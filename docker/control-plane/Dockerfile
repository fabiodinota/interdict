# docker/control-plane/Dockerfile -- Interdict Control Plane API
#
# Bun-based build with bundled OPA binary for policy compilation.
# Build context: repository root (.)
# Usage: docker build -f docker/control-plane/Dockerfile .

FROM oven/bun:1.1-slim AS base

# ---------------------------------------------------------------------------
# Stage 1: Download OPA binary (isolated for air-gapped cache replacement)
# ---------------------------------------------------------------------------
FROM base AS opa-fetch
ARG OPA_VERSION=v1.4.2
ARG TARGETARCH
# Air-gapped builds: replace this stage by providing opa_linux_${TARGETARCH}_static
# in the build context and using COPY instead of ADD.
ADD https://github.com/open-policy-agent/opa/releases/download/${OPA_VERSION}/opa_linux_${TARGETARCH}_static /tmp/opa
RUN chmod +x /tmp/opa

# ---------------------------------------------------------------------------
# Stage 2: Production image
# ---------------------------------------------------------------------------
FROM base

# Install wget for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends wget=1.21.* \
    && rm -rf /var/lib/apt/lists/*

# Copy OPA from the download stage
COPY --from=opa-fetch /tmp/opa /usr/local/bin/opa

# Create non-root user (UID 1000 to match Helm securityContext)
RUN groupadd -g 1000 interdict && \
    useradd -u 1000 -g interdict -m -s /bin/false interdict

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
RUN mkdir -p /app/data/wasm && chown -R interdict:interdict /app

USER interdict

EXPOSE 3000 50052

HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=30s \
    CMD ["wget", "--spider", "-q", "http://localhost:3000/health"]

ENTRYPOINT ["/entrypoint.sh"]
