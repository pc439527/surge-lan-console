# syntax=docker/dockerfile:1
# ── Build identity (OPTIMIZATION_PLAN §84–85) ─────────────────
#   docker build \
#     --build-arg APP_VERSION=0.2.1 \
#     --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) \
#     --build-arg BUILD_TIME=$(date -Iseconds) \
#     -t surge-lan-console:$(git rev-parse --short HEAD) .
ARG APP_VERSION=0.2.1
ARG GIT_COMMIT=unknown
ARG GIT_BRANCH=unknown
ARG BUILD_TIME=unknown

# ── Stage 1: build ──────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
ARG APP_VERSION
ARG GIT_COMMIT
ARG GIT_BRANCH
ARG BUILD_TIME
ENV VITE_APP_VERSION=${APP_VERSION} \
    VITE_GIT_COMMIT=${GIT_COMMIT} \
    VITE_GIT_BRANCH=${GIT_BRANCH} \
    VITE_BUILD_TIME=${BUILD_TIME} \
    VITE_APP_ENV=production
RUN pnpm build

# ── Stage 2: serve ──────────────────────────────────────────────
FROM nginx:1.27-alpine AS serve

ARG APP_VERSION
ARG GIT_COMMIT
LABEL org.opencontainers.image.version=${APP_VERSION}
LABEL org.opencontainers.image.revision=${GIT_COMMIT}
LABEL org.opencontainers.image.title="Surge LAN Console"
LABEL org.opencontainers.image.description="Apple-style Surge management console for your LAN"

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-snippets/ /etc/nginx/snippets/

COPY --from=build /app/dist /usr/share/nginx/html

# nginx worker runs as unprivileged "nginx" user — ensure all files are world-readable
RUN chmod -R a+rX /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]