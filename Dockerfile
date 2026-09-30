FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM node:24-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=preview HOST=0.0.0.0 PORT=4000
COPY --from=build /app /app
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]

FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
EXPOSE 80 443
