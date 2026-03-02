# docker/dashboard/Dockerfile -- Interdict Dashboard (Placeholder)
#
# Serves a static placeholder page via nginx until Phase 9 builds the
# real dashboard. Satisfies DEPLOY-01 image requirement.
# Build context: repository root (.)
# Usage: docker build -f docker/dashboard/Dockerfile .

FROM nginx:1-bookworm

COPY docker/dashboard/index.html /usr/share/nginx/html/index.html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=5s \
    CMD ["wget", "--spider", "-q", "http://localhost:80/"]
