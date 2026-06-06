# syntax=docker/dockerfile:1

# ---- Stage 1: build the static bundle ----
# Pin to the native build platform: npm ci + esbuild produce arch-neutral
# static assets, so running them under QEMU emulation (e.g. for arm64) would be
# pathologically slow. The per-arch work happens only in the runtime stage.
FROM --platform=$BUILDPLATFORM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY build.js ./build.js
COPY src ./src
RUN npm run build

# ---- Stage 2: runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js ./server.js
COPY --from=build /app/public ./public
USER node
ENV PORT=3000
EXPOSE 3000
ENTRYPOINT ["node", "server.js"]
