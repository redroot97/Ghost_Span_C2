#!/usr/bin/env bash
# Generate a self-signed TLS cert + key for the GhostSpan server.
# Drops server.crt and server.key into the script's directory.
# Run with: ./generate-certs.sh [CN]
set -euo pipefail
CN="${1:-localhost}"
DIR="$(cd "$(dirname "$0")" && pwd)"

openssl req -x509 -newkey rsa:4096 -sha256 -days 365 -nodes \
  -keyout "$DIR/server.key" -out "$DIR/server.crt" \
  -subj "/CN=$CN" \
  -addext "subjectAltName=DNS:$CN,DNS:localhost,IP:127.0.0.1"

chmod 600 "$DIR/server.key"
echo "Wrote $DIR/server.crt and $DIR/server.key (CN=$CN, 365 days)"
