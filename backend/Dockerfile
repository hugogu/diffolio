ARG REGISTRY_PREFIX=""
FROM ${REGISTRY_PREFIX}node:22.22.1-alpine3.23 AS base
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma

FROM base AS development
RUN apk add --no-cache openssl3 ca-certificates
RUN npm ci
RUN npx prisma generate
COPY . .
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run dev"]

FROM base AS builder
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

ARG REGISTRY_PREFIX=""
FROM ${REGISTRY_PREFIX}node:22.22.1-alpine3.23 AS production
RUN apk add --no-cache openssl3 ca-certificates
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./
RUN mkdir -p /data/uploads
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
