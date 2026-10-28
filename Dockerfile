FROM oven/bun:1.4.4-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

FROM deps AS builder
COPY . .
RUN AUTH_SECRET=placeholder-for-the-build-step-only-000000 bun run build

FROM alpine:3.24
RUN apk add --no-cache ca-certificates libgcc libstdc++ \
    && mkdir -p /data \
    && chown 1000:1000 /data
WORKDIR /app
COPY --from=builder --chown=1000:1000 /app/build ./build
COPY --from=builder --chown=1000:1000 /app/drizzle ./drizzle
USER 1000:1000
VOLUME /data
ARG APP_VERSION=""
ENV APP_VERSION=$APP_VERSION \
    PORT=3000 \
    DATABASE_PATH=/data/localassistant.sqlite \
    PROTOCOL_HEADER=x-forwarded-proto \
    HOST_HEADER=x-forwarded-host \
    LOG_LEVEL=info \
    LOG_FORMAT=json
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["wget", "-q", "--spider", "http://127.0.0.1:3000/api/health"]
CMD ["/app/build/server"]
