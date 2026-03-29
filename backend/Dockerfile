ARG REGISTRY_PREFIX=""
FROM ${REGISTRY_PREFIX}node:22.22.1-alpine3.23 AS base
RUN apk add --no-cache openssl3 ca-certificates
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM deps AS prisma-client
COPY prisma ./prisma
RUN npx prisma generate

FROM prisma-client AS development
COPY . .
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run dev"]

FROM prisma-client AS builder
COPY . .
RUN npm run build

ARG REGISTRY_PREFIX=""
FROM ${REGISTRY_PREFIX}node:22.22.1-alpine3.23 AS production
RUN apk add --no-cache openssl3 ca-certificates
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=prisma-client /app/node_modules ./node_modules
COPY --from=prisma-client /app/prisma ./prisma
COPY package*.json ./
RUN mkdir -p /data/uploads
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
