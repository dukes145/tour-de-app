FROM oven/bun:1.4-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY . .

RUN test -f /app/src/index.ts
RUN test -f /app/src/seedStops.ts
RUN test -f /app/seed-data/stops.csv

ENV PORT=3001
EXPOSE 3001

USER bun

CMD ["bun", "src/index.ts"]
