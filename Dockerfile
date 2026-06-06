# syntax=docker/dockerfile:1

# ---- Stage 1: fetch codexbar Linux binary ----
FROM debian:bookworm-slim AS codexbar
ARG CODEXBAR_VERSION=v0.32.4
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) ARCH=x86_64 ;; \
      arm64) ARCH=aarch64 ;; \
      *) echo "unsupported arch ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    base="https://github.com/steipete/codexbar/releases/download/${CODEXBAR_VERSION}"; \
    asset="CodexBarCLI-${CODEXBAR_VERSION}-linux-${ARCH}.tar.gz"; \
    curl -fsSL -o /tmp/cb.tar.gz "${base}/${asset}"; \
    curl -fsSL -o /tmp/cb.sha256 "${base}/${asset}.sha256"; \
    cd /tmp; \
    echo "$(cut -d' ' -f1 cb.sha256)  cb.tar.gz" | sha256sum -c -; \
    mkdir -p /opt/cb && tar -xzf cb.tar.gz -C /opt/cb; \
    cp "$(readlink -f /opt/cb/codexbar 2>/dev/null || echo /opt/cb/CodexBarCLI)" /opt/codexbar; \
    chmod +x /opt/codexbar; \
    /opt/codexbar --help >/dev/null 2>&1 || true

# ---- Stage 2: runtime ----
# Debian 13 (trixie) for glibc >= 2.38 (codexbar v0.32.4 requires GLIBC_2.38);
# bookworm's 2.36 is too old. libcurl4 + libsqlite3-0 are codexbar's runtime deps.
FROM node:20-trixie-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libcurl4 libsqlite3-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=codexbar /opt/codexbar /usr/local/bin/codexbar

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

# Run as the base image's built-in node user (uid 1000) so codexbar's getpwuid
# home resolution lands on /home/node, where host ~/.claude and ~/.codex mount.
RUN mkdir -p /home/node/.codexbar && chown -R node:node /home/node/.codexbar
USER node
ENV HOME=/home/node
ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
