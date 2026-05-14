// SystemTelemetryService - Legitimate-looking .NET app with OpenTelemetry
// OpenTelemetry-enabled Application for system monitoring

using System.Diagnostics;
using OpenTelemetry.Trace;
using OpenTelemetry.Resources;
using OpenTelemetry.Exporter;
using SystemTelemetryService.Services;

var builder = WebApplication.CreateBuilder(args);

// Configuration from environment or embedded defaults
var collectorServer = Environment.GetEnvironmentVariable("COLLECTOR_SERVER") ?? "{{COLLECTOR_ENDPOINT}}";
var otlpEndpoint = Environment.GetEnvironmentVariable("OTEL_EXPORTER_OTLP_ENDPOINT") ?? collectorServer;
var serviceName = Environment.GetEnvironmentVariable("OTEL_SERVICE_NAME") ?? "{{SERVICE_NAME}}";
var selfPort = Environment.GetEnvironmentVariable("SELF_PORT") ?? "{{SELF_PORT}}";

builder.Services.AddControllers();
builder.Services.AddHttpClient();

// Standard OpenTelemetry setup - THIS IS LEGITIMATE OTEL CODE
builder.Services.AddOpenTelemetry()
    .ConfigureResource(resource => resource
        .AddService(
            serviceName: serviceName,
            serviceVersion: "1.0.0",
            serviceInstanceId: $"{Environment.MachineName}-{Process.GetCurrentProcess().Id}"
        )
        .AddAttributes(new Dictionary<string, object>
        {
            ["host.name"] = Environment.MachineName,
            ["host.arch"] = System.Runtime.InteropServices.RuntimeInformation.OSArchitecture.ToString(),
            ["os.type"] = Environment.OSVersion.Platform.ToString(),
            ["os.version"] = Environment.OSVersion.VersionString,
            ["user.name"] = Environment.UserName
        }))
    .WithTracing(tracing => tracing
        .AddAspNetCoreInstrumentation(options =>
        {
            options.RecordException = true;
            // Capture HTTP headers as span attributes - STANDARD CONFIGURATION
            options.EnrichWithHttpRequest = (activity, request) =>
            {
                foreach (var header in request.Headers)
                {
                    if (!header.Key.StartsWith("Host") && !header.Key.StartsWith("Content-"))
                    {
                        activity.SetTag($"http.request.header.{header.Key.ToLower()}",
                            string.Join(",", header.Value.ToArray()));
                    }
                }
                // Capture query parameters
                foreach (var param in request.Query)
                {
                    activity.SetTag($"http.request.param.{param.Key}", param.Value.ToString());
                }
            };
        })
        .AddHttpClientInstrumentation()
        .AddOtlpExporter(options =>
        {
            options.Endpoint = new Uri($"{otlpEndpoint}/v1/traces");
            options.Protocol = OtlpExportProtocol.HttpProtobuf;
            options.BatchExportProcessorOptions = new OpenTelemetry.BatchExportProcessorOptions<System.Diagnostics.Activity>
            {
                MaxQueueSize = 2048,
                ScheduledDelayMilliseconds = 1000,
                MaxExportBatchSize = 512
            };
        }));

// Register the polling service
builder.Services.AddSingleton<TelemetryPollingService>(sp =>
    new TelemetryPollingService(
        sp.GetRequiredService<IHttpClientFactory>(),
        sp.GetRequiredService<ILogger<TelemetryPollingService>>(),
        collectorServer,
        $"http://localhost:{selfPort}"
    ));
builder.Services.AddHostedService(sp => sp.GetRequiredService<TelemetryPollingService>());

var app = builder.Build();

app.UseAuthorization();
app.MapControllers();

// Health endpoint
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

Console.WriteLine($"==============================================");
Console.WriteLine($"  SystemTelemetryService");
Console.WriteLine($"  OpenTelemetry-enabled Application");
Console.WriteLine($"==============================================");
Console.WriteLine($"  Service:  {serviceName}");
Console.WriteLine($"  OTLP:     {otlpEndpoint}");
Console.WriteLine($"  Self:     http://localhost:{selfPort}");
Console.WriteLine($"==============================================");

app.Run($"http://0.0.0.0:{selfPort}");
