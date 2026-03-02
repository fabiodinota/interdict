# docker/control-plane/Dockerfile -- Interdict Control Plane API
#
# Bun-based build with bundled OPA binary for policy compilation.
# Build context: repository root (.)
# Usage: docker build -f docker/control-plane/Dockerfile .

FROM oven/bun:1-slim

# Install wget for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/*

# Download pinned OPA binary for policy compilation
ARG OPA_VERSION=v1.4.2
ADD https://github.com/open-policy-agent/opa/releases/download/${OPA_VERSION}/opa_linux_amd64_static /usr/local/bin/opa
RUN chmod +x /usr/local/bin/opa

WORKDIR /app

# Install dependencies (including devDependencies for drizzle-kit migrations)
COPY control-plane/package.json control-plane/bun.lock ./
RUN bun install --frozen-lockfile

# Copy control plane source
COPY control-plane/ .

# Copy proto files -- gRPC distribution module resolves proto relative to
# control-plane/src/modules/distribution/ as ../../../../proto/
# With WORKDIR /app, __dirname is /app/src/modules/distribution/
# so ../../../../proto resolves to /proto/
COPY proto/ /proto/

# Copy entrypoint
COPY docker/control-plane/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Wasm policy storage directory
RUN mkdir -p /app/data/wasm

EXPOSE 3000 50052

ENTRYPOINT ["/entrypoint.sh"]
