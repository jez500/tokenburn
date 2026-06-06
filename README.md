# codexbar-api

A Docker container that runs the [codexbar](https://github.com/steipete/codexbar) Linux CLI
and exposes AI-provider usage/cost data as an authenticated, cached HTTP API with Prometheus
metrics.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/healthz` | none | Liveness |
| GET | `/metrics` | none | Prometheus metrics |
| GET | `/v1/usage` | Bearer | Reshaped usage, `?provider=` filter |
| GET | `/v1/cost?days=30` | Bearer | Reshaped cost (days 1-365) |
| GET | `/v1/summary?days=30` | Bearer | Combined usage+cost per provider |

Auth: `Authorization: Bearer $API_TOKEN`.

## Quick start

```bash
cp .env.example .env      # set API_TOKEN and your provider keys
docker compose up --build
curl -H "Authorization: Bearer $API_TOKEN" localhost:3000/v1/summary
```

## Configuration

See `.env.example`. Provider keys map to codexbar providers: `OPENAI_ADMIN_KEY`->codex,
`ANTHROPIC_ADMIN_KEY`->claude, `GEMINI_API_KEY`->gemini, `ZAI_API_KEY`->z.ai. Browser-cookie
providers are not supported in a headless container.

## Development

```bash
npm install
npm test                  # runs against a stub codexbar binary, no creds needed
./scripts/smoke.sh        # build + boot + curl assertions
```
