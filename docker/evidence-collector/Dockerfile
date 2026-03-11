# docker/evidence-collector/Dockerfile -- Interdict Evidence Collector
#
# Multi-stage build using cargo-chef for dependency caching.
# Build context: repository root (.)
# Usage: docker build -f docker/evidence-collector/Dockerfile .

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
# Stage 3: Builder -- cache dependencies then build collector binary
# ---------------------------------------------------------------------------
FROM chef AS builder

COPY --from=planner /app/recipe.json recipe.json
# Build dependencies -- this is the caching Docker layer
RUN cargo chef cook --release --recipe-path recipe.json

# Copy full workspace and build the evidence collector binary
COPY . .
RUN cargo build --release --bin interdict-collector

# ---------------------------------------------------------------------------
# Stage 4: Runtime -- minimal image with collector binary
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd -r interdict && useradd -r -g interdict -d /app -s /sbin/nologin interdict

# Data directory for signing keys
RUN mkdir -p /data/keys /app \
    && chown -R interdict:interdict /data /app

WORKDIR /app

COPY --from=builder /app/target/release/interdict-collector /usr/local/bin/interdict-collector
COPY docker/evidence-collector/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

EXPOSE 50051

USER interdict

HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=20s \
    CMD ["nc", "-z", "127.0.0.1", "50051"]

ENTRYPOINT ["/entrypoint.sh"]
