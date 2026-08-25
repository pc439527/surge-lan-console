FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY server ./server
RUN pnpm core:build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    SLC_HOST=0.0.0.0 \
    SLC_PORT=8787 \
    SLC_DATA_DIR=/data

RUN mkdir -p /data && chown node:node /data
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/server/dist ./server/dist

USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
