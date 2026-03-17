# docker/control-plane/Dockerfile -- Interdict Control Plane API
#
# Bun-based build with bundled OPA binary for policy compilation.
# Build context: repository root (.)
# Usage: docker build -f docker/control-plane/Dockerfile .

FROM oven/bun:1.2-slim AS base

# ---------------------------------------------------------------------------
# Stage 1: Download OPA binary with SHA256 verification
# ---------------------------------------------------------------------------
FROM base AS opa-fetch
ARG OPA_VERSION=v1.4.2
ARG TARGETARCH
# Official SHA256 checksums from https://github.com/open-policy-agent/opa/releases/tag/v1.4.2
ARG OPA_SHA256_AMD64=2c0ccdbbe0b8e2a5d12d9c42d92f1f34f494ffb32d1f3c4ddc36101be637d66f
ARG OPA_SHA256_ARM64=facd6a9ea375c6299701f86b90b470e52305c5726c4f136e2980fa6123ae9613
# Air-gapped builds: replace this stage by providing opa_linux_${TARGETARCH}_static
# in the build context and using COPY instead of ADD.
RUN apt-get update && apt-get install -y --no-install-recommends curl=7.* ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && OPA_SHA256=$(if [ "$TARGETARCH" = "arm64" ]; then echo "$OPA_SHA256_ARM64"; else echo "$OPA_SHA256_AMD64"; fi) \
    && curl -fSL -o /tmp/opa \
       "https://github.com/open-policy-agent/opa/releases/download/${OPA_VERSION}/opa_linux_${TARGETARCH}_static" \
    && echo "${OPA_SHA256}  /tmp/opa" | sha256sum -c - \
    && chmod +x /tmp/opa

# ---------------------------------------------------------------------------
# Stage 2: Production image
# ---------------------------------------------------------------------------
FROM base

# Install wget for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/*

# Copy OPA from the download stage
COPY --from=opa-fetch /tmp/opa /usr/local/bin/opa

# Create non-root user (UID 1000 to match Helm securityContext)
# Bun base image may already have GID/UID 1000 — use -f to allow reuse
RUN groupadd -f -g 1000 interdict && \
    useradd -u 1000 -g interdict -m -s /bin/false interdict 2>/dev/null || true

WORKDIR /app

# Install production dependencies first (cached layer — changes rarely)
COPY control-plane/package.json control-plane/bun.lock ./
RUN bun install --production --frozen-lockfile

# Copy control plane source
COPY control-plane/ .

# Install remaining devDependencies (drizzle-kit needed for entrypoint migrations)
RUN bun install --frozen-lockfile

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
