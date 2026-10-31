FROM oven/bun:1.4.0

WORKDIR /app

COPY package.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/game/package.json ./packages/game/package.json

COPY . .

RUN bun install \
  && bun run --filter @parallax/game build \
  && bun run --filter @parallax/server build \
  && bun install --production

ENV NODE_ENV=production
EXPOSE 2567

CMD ["bun", "run", "--filter", "@parallax/server", "start"]
