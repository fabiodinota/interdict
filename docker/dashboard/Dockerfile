# docker/dashboard/Dockerfile -- Interdict Dashboard (Next.js)
# Build context: repository root (.)
# Usage: docker build -f docker/dashboard/Dockerfile .

# Stage 1: Install dependencies
FROM oven/bun:1.1@sha256:d6ad4d3280d3e7e92b793a924105d68766d60b1f36709f4cee11bc8737782621 AS deps
WORKDIR /app
COPY dashboard/package.json dashboard/bun.lock ./
RUN bun install --frozen-lockfile

# Stage 2: Build
FROM oven/bun:1.1@sha256:d6ad4d3280d3e7e92b793a924105d68766d60b1f36709f4cee11bc8737782621 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY dashboard/ .
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_SAML_ENABLED=false
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_SAML_ENABLED=$NEXT_PUBLIC_SAML_ENABLED
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN bun run build

# Stage 3: Production
FROM node:20-slim@sha256:a82f40540f5959e0003fb7b3c0f80490def2927be8bdbee7e3e0ac65cce3be92 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

# Create non-root user (UID 1000 to match Helm securityContext)
RUN groupadd -g 1000 interdict && \
    useradd -u 1000 -g interdict -m -s /bin/false interdict

COPY --from=builder --chown=interdict:interdict /app/.next/standalone ./
COPY --from=builder --chown=interdict:interdict /app/.next/static ./.next/static
COPY --from=builder --chown=interdict:interdict /app/public ./public

# Writable cache directory for ISR (read-only rootfs compatibility)
RUN mkdir -p /app/.next/cache && chown interdict:interdict /app/.next/cache

USER interdict

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=30s \
    CMD ["node", "-e", "fetch('http://localhost:3001/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "server.js"]
