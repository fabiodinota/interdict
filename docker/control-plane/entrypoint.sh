#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
bun run db:migrate

echo "[entrypoint] Running seed (idempotent)..."
bun run seed

echo "[entrypoint] Starting Interdict control plane..."
exec bun run start
