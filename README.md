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
cp .env.example .env      # set API_TOKEN (+ any API-key providers)
# Ensure you're logged in on the host: `claude setup-token` and `codex` login.
docker compose up --build # mounts ~/.claude and ~/.codex read-write
curl -H "Authorization: Bearer $API_TOKEN" localhost:3033/v1/summary
```

## Configuration

Two credential models, used together:

**OAuth subscription plans (Claude Code Pro/Max, OpenAI Codex/ChatGPT)** — no API key.
Log in once on the host (`claude setup-token` and `codex` login), then mount the host
credential dirs read-write. `docker-compose.yml` mounts `~/.claude` and `~/.codex` into the
container, which runs as **uid 1000** (the base image's `node` user) so it can read and
refresh those `600`-mode files. This requires the host user to be uid 1000.

- Usage is fetched with `--source oauth`; tokens self-refresh and persist back to the host
  files. `/v1/usage` and `/v1/summary` report each plan's percent-used and reset windows.
- Cost (`/v1/cost`, `/v1/summary`) is **only available for Claude and Codex** (codexbar reads
  local native logs) over a fixed ~30-day window. The `?days=` query param is accepted for
  compatibility but does not change codexbar's window. Codex keeps no local cost logs, so its
  cost fields are null.
- `CODEXBAR_OAUTH_PROVIDERS` (default `claude,codex`) decides each provider's auth mode:
  providers in the list use the OAuth/mount path; others use the API-key path.
- If Claude ever returns a `user:profile` scope error, run `claude setup-token` on the host to
  mint a scoped token.

**API-key providers** — set the matching env var (`GEMINI_API_KEY`, `ZAI_API_KEY`, or the
`OPENAI_ADMIN_KEY`/`ANTHROPIC_ADMIN_KEY` admin keys). These are provisioned via
`codexbar config set-api-key` at boot and queried with `--source api`. To use admin keys for
codex/claude, remove them from `CODEXBAR_OAUTH_PROVIDERS`.

See `.env.example` for the full list.

## Development

```bash
npm install
npm test                  # runs against a stub codexbar binary, no creds needed
./scripts/smoke.sh        # build + boot + curl assertions
```
