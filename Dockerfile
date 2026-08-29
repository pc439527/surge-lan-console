# Build identity:
#   - UI version comes from package.json (vite.config.ts)
#   - build time is generated at build time
#   - GIT_COMMIT / GIT_BRANCH are optional build args; when omitted the UI
#     reports "unknown" instead of a stale hard-coded revision.
# ── Build identity ─────────────────────────────────────────────
#   docker build \
#     --build-arg APP_VERSION=0.5.0 \
#     --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) \
#     --build-arg GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD) \
#     -t surge-lan-console:$(git rev-parse --short HEAD) .
ARG APP_VERSION=0.5.0
ARG GIT_COMMIT=unknown
ARG GIT_BRANCH=unknown

# ── Stage 1: build ──────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
ARG GIT_COMMIT
ARG GIT_BRANCH
RUN if [ -n "$GIT_COMMIT" ] && [ "$GIT_COMMIT" != "unknown" ]; then export VITE_GIT_COMMIT="$GIT_COMMIT"; fi; \
    if [ -n "$GIT_BRANCH" ] && [ "$GIT_BRANCH" != "unknown" ]; then export VITE_GIT_BRANCH="$GIT_BRANCH"; fi; \
    export VITE_APP_ENV=production; \
    pnpm build:web

# ── Stage 2: serve ──────────────────────────────────────────────
FROM nginx:1.28-alpine AS serve

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
