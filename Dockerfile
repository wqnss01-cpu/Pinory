FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/bot/package.json ./apps/bot/package.json
COPY apps/miniapp/package.json ./apps/miniapp/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN npm ci --workspace @pinory/api --workspace @pinory/miniapp --workspace @pinory/config --workspace @pinory/shared --include-workspace-root=false

COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/api ./apps/api
COPY apps/miniapp ./apps/miniapp
COPY packages/config ./packages/config
COPY packages/shared ./packages/shared
RUN npm run build -w @pinory/shared && npm run build -w @pinory/config && npm run build -w @pinory/api && npm run build -w @pinory/miniapp

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/bot/package.json ./apps/bot/package.json
COPY apps/miniapp/package.json ./apps/miniapp/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN npm ci --omit=dev --workspace @pinory/api --workspace @pinory/config --workspace @pinory/shared --include-workspace-root=false && npm cache clean --force

COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/miniapp/dist ./apps/miniapp/dist
COPY --from=build /app/packages/config/dist ./packages/config/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY infrastructure/migrations ./infrastructure/migrations

USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["sh", "-c", "node apps/api/dist/scripts/migrate.js && node apps/api/dist/scripts/seed.js && exec node apps/api/dist/server.js"]
