# GhostSpan

A research C2 framework that disguises command-and-control traffic as OpenTelemetry telemetry.

Implants and the operator server speak the same protocols enterprise observability stacks use every day - OTLP over gRPC (`:4317`) and OTLP over HTTP (`:4318`) - with C2 payloads tucked inside span attributes that look like normal application traces. The operator UI is an Electron desktop app; the server is a single FastAPI process; implants are statically-linked Go binaries cross-compiled from an embedded toolchain.

> **Authorized use only.** This is for security research, red-team engagements with written authorization, internal lab exercises, and CTFs. Don't run it against anything you don't own or aren't paid to test.

---

## How it looks on the wire

- Agents POST to `/v1/traces` with **valid** OTLP protobuf payloads - no agent ID in the URL, no exotic headers.
- C2 data is hidden inside span attributes whose `(data, id)` pairs **rotate** across a pool - `db.statement`/`db.connection_string`, `http.request.body`/`http.request.header.x-request-id`, `graphql.document`/`graphql.operation.name`, etc. A passive collector can't fingerprint a single attribute pair.
- Payloads are XOR-encrypted with an HMAC-SHA256 key derived per-agent from a shared master secret.
- gRPC + protobuf is the primary path: binary protocol, HTTP/2 multiplexing, and the default transport real OTel SDKs use.

## Anti-sandbox triage gate

New beacons land in a **pending** queue. An agent has to beacon twice and survive at least 30 seconds before it's promoted to a visible endpoint. Drive-by detonations in a one-minute sandbox never show up in the operator UI - they sit in `/api/endpoints/suspicious` for review.

---

## Components

```
┌───────────────────────┐                                   ┌────────────────────┐
│  Electron Operator    │  ── REST :4318 ──────────────►    │   GhostSpan        │
│  (React + Node main)  │                                   │   FastAPI server   │
│   • Service Builder   │  ◄──────────────────────────      │                    │
│   • Endpoints         │                                   │   gRPC OTLP :4317  │
│   • Request Console   │                                   │   HTTP OTLP :4318  │
│   • Network Map       │                                   │   REST   :4318     │
└───────────────────────┘                                   └────────▲───────────┘
                                                                     │
                                          OTLP /v1/traces (gRPC/HTTP)│
                                                                     │
                                                            ┌────────┴───────────┐
                                                            │  Go implant        │
                                                            │  exe / dll / svc / │
                                                            │  mach-o / elf      │
                                                            └────────────────────┘
```

- **`server/`** - Python 3, FastAPI + uvicorn + grpcio. SQLite for operators, in-memory for endpoints/tasks/results. TLS optional.
- **`client/`** - Electron + React desktop app. The main process embeds a Go toolchain + llvm-mingw and cross-compiles implants on demand.
- **`client/src/main/templates-go/`** - Implant source for Windows EXE / macOS / Linux ELF.
- **`client/src/main/templates-dll/`** - Implant source for Windows DLL (CGO).
- **`client/src/main/templates-svc/`** - Implant source for Windows Service (SCM).

Build targets: `{windows, linux, darwin} × {amd64, arm64} × {exe | dll | svc | bin}` - 10 prebuilt templates after `npm run precompile`.

---

## Quick start

### 1. Server

```bash
cd server
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python otelc2_full_server.py                # plain HTTP + gRPC
# or with TLS:
./generate-certs.sh                         # writes server.crt + server.key
python otelc2_full_server.py --tls
```

Ports:

| Port  | Protocol            | Purpose                          |
| ----- | ------------------- | -------------------------------- |
| 4317  | gRPC (OTLP)         | Primary implant channel          |
| 4318  | HTTP (OTLP + REST)  | Fallback implants + operator API |

Default operators (change them - they live in `server/ghostspan.db`):

| Username    | Password   | Role     |
| ----------- | ---------- | -------- |
| `operator1` | `operator` | Admin    |
| `operator2` | `operator` | Operator |

Health check: `curl http://localhost:4318/health` → `{"status": "healthy"}`

### 2. Client

```bash
cd client
npm install
npm run setup:mac            # or setup:win, setup:linux
npm run precompile           # builds all 10 implant templates
npm run dev                  # starts Electron app
```

Setup downloads:
- **Go SDK** (~65MB per platform): `go1.22.0` for cross-compilation
- **llvm-mingw** (~200MB): Windows DLL cross-compiler for CGO

Login with `operator1` / `operator`. The Service Builder tab generates implants; the Endpoints tab shows connected agents.

---

## Usage

### Generate an implant

In the **Service Builder** tab:

1. **Collector Endpoint**: `http://your-server:4318` (or `:4317` for gRPC-only)
2. **Service Name**: `your-app-name` (appears in telemetry spans)
3. **Platform**: `windows-amd64`, `linux-arm64`, etc.
4. **Format**: `exe` (standalone), `dll` (CGO), `svc` (Windows service)
5. **Sleep**: Beacon interval in seconds
6. **Jitter**: ±% randomization
7. Click **Generate Service**

The app cross-compiles on the spot using the embedded Go toolchain. Output goes to `client/release/`.

### Deploy and operate

1. Copy the generated binary to the target
2. Run it - it beacons immediately to `collector_endpoint/v1/traces`
3. After 2+ beacons over 30+ seconds, it appears in **Endpoints** tab
4. Select an endpoint and use **Request Console** to send commands:
   - `cmd /c dir` (Windows)  
   - `/bin/ls -la` (Unix)
   - `powershell Get-Process`
   - `whoami; id`

Results come back as OTLP spans with stdout/stderr in rotating attributes.

---

## Architecture notes

### Stealth

- **No custom protocols**: Pure OTLP gRPC/HTTP that any OTel collector accepts
- **Rotating attributes**: C2 data moves between different span attribute pairs to avoid static fingerprints  
- **Standard user-agent**: Go HTTP client or gRPC library signatures
- **Valid protobuf**: Payloads parse correctly in Jaeger, Zipkin, Grafana Tempo
- **Enterprise-normal**: High-volume telemetry traffic is expected in monitored environments

### Anti-analysis

- **Triage gate**: Short-lived sandbox runs never graduate from "suspicious" to visible endpoints
- **Encryption**: XOR + HMAC key derivation per agent (not plaintext spans)
- **No static IOCs**: Server endpoints, attribute names, timing all configurable
- **Cross-platform**: 10 build targets from the same codebase

### Operator security

- **Session tokens**: Web UI requires login, uses `X-Session-Token` headers
- **Role-based**: Admin vs Operator permissions (extensible)
- **HTTPS optional**: `--tls` flag + auto-generated certs via `generate-certs.sh`
- **CORS enabled**: UI can run on different port/host from server if needed

---

## Build from source

If the precompiled templates fail or you need custom builds:

```bash
cd client
npm run setup:all                 # downloads Go + mingw for all platforms
node scripts/precompile-templates.js
```

This produces:

- `precompiled-templates/windows/amd64/template-{exe,dll,svc}.exe`
- `precompiled-templates/darwin/{amd64,arm64}/template-bin`  
- `precompiled-templates/linux/{amd64,arm64}/template-bin`
- `precompiled-templates/manifest.json`

The Service Builder patches these at runtime instead of compiling from scratch (much faster UX).

### Manual build (no precompile)

```bash
cd client/src/main/templates-go
export GOOS=linux GOARCH=amd64
go build -ldflags="-s -w" -o implant .
```

Then patch placeholders before deployment:
```go
// Replace {{PLACEHOLDER_COLLECTOR_ENDPOINT}}XXX... with your server URL
// Replace {{PLACEHOLDER_SERVICE_NAME}}XXX... with desired service name
// etc.
```

---

## Troubleshooting

**Server won't start**: Check Python dependencies with `pip install -r requirements.txt`. The package is `protobuf`, not `google-protobuf`.

**gRPC disabled**: Install `grpcio grpcio-tools opentelemetry-proto` for the binary protocol support.

**Client build fails**: Check Node.js version (16+) and run `npm run setup:<platform>` to download the Go toolchain.

**DLL build fails with "command not found"**: llvm-mingw needs a space-free path. Clone to `/tmp/ghost` instead of `Documents/My Project/Ghost Span`.

**Implant doesn't appear**: Check the server logs for "pending" agents. They need 2+ beacons over 30+ seconds to graduate. Hit `GET /api/endpoints/suspicious` to see quarantined agents.

**Connection refused**: Verify server ports. gRPC is `:4317`, HTTP is `:4318`. Check firewall and `curl http://server:4318/health`.

---

## Development

- Server: `uvicorn server.otelc2_full_server:app --reload --port 4318`
- Client: `npm run dev` (webpack-dev-server + Electron)
- Implant: `go run .` in `templates-go/` with placeholder values

SQLite schema: `server/ghostspan.db` contains operators table. Endpoints/tasks/results are in-memory only.

---

## Disclaimer

This tool is designed for **authorized security research** and **legitimate red team engagements** only. The authors are not responsible for misuse. Ensure you have written permission before testing against any systems you do not own.

OpenTelemetry and OTLP are trademarks of the OpenTelemetry project. This tool is not affiliated with or endorsed by the OpenTelemetry community.