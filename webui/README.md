# TokenBurn web UI

A small Node/Express server that serves the **TokenBurn** dashboard (a bundled React app) and
proxies a single endpoint to the [`codexbar-api`](../README.md), injecting the bearer token
server-side so the browser never sees it. This is the second image in this repo.

## What it does

- Serves the built static dashboard from `public/` (HTML, CSS, the esbuild bundle, vendored
  fonts — no runtime CDN).
- `GET /api/summary[?provider=…]` → proxies to `${API_BASE_URL}/v1/summary` with
  `Authorization: Bearer ${API_TOKEN}` added server-side. Returns `502` on upstream failure.
- `GET /healthz` → `{ "status": "ok" }` for the compose healthcheck.
- Installable as a PWA (`manifest.webmanifest` + `sw.js` service worker, network-first).

The dashboard is responsive (Grid on mobile ≤768px, Console on desktop), has a dark/light
toggle, 60-second auto-refresh + a manual refresh button, hides unconfigured/errored providers,
and shows a setup-help screen when none are reachable.

## Configuration

| Var | Default | Purpose |
|-----|---------|---------|
| `API_BASE_URL` | `http://codexbar-api:3000` | Upstream codexbar-api base URL |
| `API_TOKEN` | (required) | Bearer token for the upstream API |
| `PORT` | `3000` | Listen port inside the container |

## Develop

```bash
npm install
npm run build     # esbuild bundle + copy assets/fonts into public/
npm start         # serve on $PORT (set API_BASE_URL + API_TOKEN)
npm test          # node --test (proxy + view-model mapping)
```

Normally you don't run this directly — `docker compose up --build` from the repo root starts it
alongside `codexbar-api` (host `8080` → container `3000`). See the [root README](../README.md).
