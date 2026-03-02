#!/bin/sh
set -e

echo "[entrypoint] Starting Interdict evidence collector..."
exec /usr/local/bin/interdict-collector
