# docker/kernel/Dockerfile -- Interdict Kernel Proxy
#
# Multi-stage build using cargo-chef for dependency caching.
# Build context: repository root (.)
# Usage: docker build -f docker/kernel/Dockerfile .

# ---------------------------------------------------------------------------
# Stage 1: Chef base
# ---------------------------------------------------------------------------
FROM lukemathwalker/cargo-chef:latest-rust-1-bookworm AS chef
WORKDIR /app

# ---------------------------------------------------------------------------
# Stage 2: Planner -- generate recipe.json for dependency caching
# ---------------------------------------------------------------------------
FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

# ---------------------------------------------------------------------------
# Stage 3: Builder -- cache dependencies then build kernel binary
# ---------------------------------------------------------------------------
FROM chef AS builder

# aws-lc-rs (via rustls) needs cmake; install before cook stage
RUN apt-get update && apt-get install -y --no-install-recommends cmake \
    && rm -rf /var/lib/apt/lists/*

COPY --from=planner /app/recipe.json recipe.json
# Build dependencies -- this is the caching Docker layer
RUN cargo chef cook --release --recipe-path recipe.json

# Copy full workspace and build the kernel binary
COPY . .
RUN cargo build --release --bin kernel

# ---------------------------------------------------------------------------
# Stage 4: Runtime -- minimal image with kernel binary
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    gettext-base \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd -r interdict && useradd -r -g interdict -d /app -s /sbin/nologin interdict

# Data directories for certs, keys, and review queue
RUN mkdir -p /data/certs /data/keys /app/policies \
    && chown -R interdict:interdict /data /app

WORKDIR /app

COPY --from=builder /app/target/release/kernel /usr/local/bin/interdict-kernel
COPY docker/kernel/entrypoint.sh /entrypoint.sh
COPY docker/kernel/interdict.toml.template /app/interdict.toml.template

RUN chmod +x /entrypoint.sh

EXPOSE 8443

USER interdict

ENTRYPOINT ["/entrypoint.sh"]
