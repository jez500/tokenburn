# codexbar-api — HTTP API Reference

The service wraps the [codexbar](https://github.com/steipete/codexbar) CLI and exposes
AI-provider **usage** and **cost** data as a small, authenticated, cached JSON API, plus a
Prometheus metrics endpoint.

- **Base URL (default):** `http://localhost:3033` — `docker-compose.yml` maps host port `3033`
  to the container's `3000`. Inside the container the app listens on `PORT` (default `3000`).
- **Content type:** `application/json` for all `/v1/*` and ops JSON responses;
  `text/plain; version=0.0.4` (Prometheus exposition) for `/metrics`.
- **Auth:** Bearer token on `/v1/*` only (see [Authentication](#authentication)).

## Contents
- [Authentication](#authentication)
- [Conventions](#conventions)
- [Caching](#caching)
- [Endpoints](#endpoints)
  - [GET /healthz](#get-healthz)
  - [GET /metrics](#get-metrics)
  - [GET /v1/usage](#get-v1usage)
  - [GET /v1/cost](#get-v1cost)
  - [GET /v1/summary](#get-v1summary)
- [Schemas](#schemas)
- [Status codes & errors](#status-codes--errors)

---

## Authentication

All `/v1/*` endpoints require a bearer token equal to the server's `API_TOKEN` env var. The
comparison is constant-time.

```
Authorization: Bearer <API_TOKEN>
```

`/healthz` and `/metrics` are **unauthenticated** (intended for liveness probes and a
Prometheus scraper).

A missing or incorrect token returns `401`:

```json
{ "error": "unauthorized" }
```

## Conventions

- **`provider` query param** (optional, on all `/v1/*`): restrict the response to a single
  provider id (e.g. `claude`, `codex`, `zai`, `gemini`). Must be one of the configured providers
  or `all`; an unknown value returns `400`. Omit it, or pass `provider=all` (the default), to
  return every provider in `CODEXBAR_PROVIDERS` (default `codex,claude,gemini,z.ai`).
- **Per-provider isolation:** each provider is queried independently. A single provider failing
  is reported as an `error` object on that provider's entry — it does **not** fail the whole
  response. (Exception: if *every* provider fails on `/v1/usage`, the request returns `502`.)
- **`source` field:** how the datum was obtained — `oauth` (subscription token), `api` (API
  key) for usage; `local` (codexbar's native cost logs) for cost.
- **Timestamps:** ISO‑8601 UTC strings.
- **`null` fields:** a field is `null` when codexbar did not report it (e.g. Codex has no local
  cost logs, so its cost figures come back `null`).

## Caching

Responses are cached in-memory per `(endpoint, provider, days)` key for `CACHE_TTL_SECONDS`
(default `300`). Concurrent identical requests are coalesced into a single codexbar call. The
envelope's **`cached`** boolean indicates whether the body was served from cache (`true`) or
freshly fetched (`false`).

---

## Endpoints

### GET /healthz

Liveness probe. No auth.

| | |
|---|---|
| Auth | none |
| Query params | none |

**200 OK**
```json
{ "status": "ok" }
```

---

### GET /metrics

Prometheus metrics exposition. No auth. Returns `text/plain`.

| | |
|---|---|
| Auth | none |
| Query params | none |

Exposed series (plus default Node/process metrics):

| Metric | Type | Labels | Meaning |
|---|---|---|---|
| `codexbar_usage_percent` | gauge | `provider` | Primary-window usage percent |
| `codexbar_cost_usd` | gauge | `provider`, `window` | Cost in USD over the window (e.g. `30d`) |
| `codexbar_scrape_success_total` | counter | `command` (`usage`/`cost`) | Successful codexbar scrapes |
| `codexbar_scrape_failure_total` | counter | `command` | Failed codexbar scrapes |
| `codexbar_scrape_duration_seconds` | histogram | `command` | codexbar scrape latency |

**200 OK** (excerpt)
```text
# HELP codexbar_usage_percent Provider usage percent (primary window)
# TYPE codexbar_usage_percent gauge
codexbar_usage_percent{provider="codex"} 1
codexbar_usage_percent{provider="claude"} 30
codexbar_usage_percent{provider="zai"} 6
# HELP codexbar_cost_usd Provider cost in USD over the window
# TYPE codexbar_cost_usd gauge
codexbar_cost_usd{provider="claude",window="30d"} 42.5
```

> Only providers that returned a numeric usage/cost produce a gauge sample; errored providers
> are omitted from the gauges (their failures increment `codexbar_scrape_failure_total`).

---

### GET /v1/usage

Reshaped usage (percent-used and reset windows) per provider.

| | |
|---|---|
| Auth | Bearer |
| Query params | `provider` (optional, default `all`) |

**Example**
```bash
curl -H "Authorization: Bearer $API_TOKEN" \
  "http://localhost:3033/v1/usage?provider=claude"
```

**200 OK**
```json
{
  "generatedAt": "2026-06-06T02:40:39.442Z",
  "cached": false,
  "providers": [
    {
      "provider": "claude",
      "source": "oauth",
      "updatedAt": "2026-06-06T02:40:39Z",
      "usage": {
        "percent": 30,
        "resetsAt": "2026-06-06T06:20:01Z",
        "plan": "Claude Max",
        "extra": [{ "id": "claude-routines", "title": "Daily Routines", "percent": 0, "windowMinutes": 10080 }],
        "windows": {
          "primary":   { "usedPercent": 30, "windowMinutes": 300, "resetsAt": "2026-06-06T06:20:01Z", "resetDescription": "Jun 6 at 6:20AM" },
          "secondary": { "usedPercent": 6,  "windowMinutes": 10080, "resetsAt": "2026-06-12T20:00:00Z" },
          "tertiary":  null
        },
        "raw": { "…": "verbatim codexbar usage payload" }
      },
      "cost": null,
      "error": null
    }
  ]
}
```

---

### GET /v1/cost

Reshaped cost over codexbar's local-log window. **Only Claude and Codex** report cost
(codexbar reads their native session logs); other providers are omitted from `provider=all`,
or — if requested explicitly — return an `error` entry. Codex cost is derived from
**Codex CLI** session logs (`~/.codex/sessions`), so it appears only if you've used the Codex
CLI locally within the ~30-day window; otherwise its cost figures come back `null`.

| | |
|---|---|
| Auth | Bearer |
| Query params | `days` (optional int 1–365, default `30`), `provider` (optional, default `all`) |

> **Note on `days`:** accepted for compatibility, but codexbar ignores it and always reports
> its own fixed `historyDays` window (currently ~30 days). The `window` field reflects
> codexbar's actual window, not the requested `days`.

**Example**
```bash
curl -H "Authorization: Bearer $API_TOKEN" \
  "http://localhost:3033/v1/cost?provider=claude&days=30"
```

**200 OK**
```json
{
  "generatedAt": "2026-06-06T02:40:49.609Z",
  "cached": false,
  "providers": [
    {
      "provider": "claude",
      "source": "local",
      "updatedAt": "2026-06-06T02:40:39Z",
      "usage": null,
      "cost": {
        "window": "30d",
        "usd": 42.5,
        "tokens": { "total": 12000000 },
        "session": { "usd": 1.2, "tokens": 250000 },
        "totals": {
          "inputTokens": 50000,
          "outputTokens": 800000,
          "cacheReadTokens": 11000000,
          "cacheCreationTokens": 150000,
          "totalTokens": 12000000,
          "totalCost": 42.5
        },
        "daily": [
          { "date": "2026-06-06", "usd": 6.25, "tokens": 1800000, "models": [{ "name": "claude-opus-4-8", "usd": 6.25, "tokens": 1800000 }] }
        ],
        "models": [
          { "name": "claude-opus-4-8", "usd": 30.1, "tokens": 9000000 },
          { "name": "claude-sonnet-4-6", "usd": 12.4, "tokens": 3000000 }
        ],
        "raw": { "…": "verbatim codexbar cost payload" }
      },
      "error": null
    }
  ]
}
```

> Example figures above are illustrative placeholders, not real account data.

---

### GET /v1/summary

Combined usage + cost per provider (merges `/v1/usage` and `/v1/cost`). Cost is present only
for providers that support it.

| | |
|---|---|
| Auth | Bearer |
| Query params | `days` (optional int 1–365, default `30`), `provider` (optional, default `all`) |

**Example**
```bash
curl -H "Authorization: Bearer $API_TOKEN" \
  "http://localhost:3033/v1/summary"
```

**200 OK** (multiple providers, including a provider with no API key configured)
```json
{
  "generatedAt": "2026-06-06T02:41:10.745Z",
  "cached": false,
  "providers": [
    {
      "provider": "codex",
      "source": "oauth",
      "updatedAt": "2026-06-06T02:41:10Z",
      "usage": { "percent": 1, "resetsAt": "2026-06-06T07:41:10Z", "windows": { "primary": { "usedPercent": 1, "windowMinutes": 300 }, "secondary": null, "tertiary": null }, "raw": { "…": "…" } },
      "cost":  { "window": "30d", "usd": null, "tokens": { "total": null }, "session": { "usd": null, "tokens": null }, "totals": null, "raw": { "…": "…" } },
      "error": null
    },
    {
      "provider": "claude",
      "source": "oauth",
      "updatedAt": "2026-06-06T02:41:10Z",
      "usage": { "percent": 30, "resetsAt": "2026-06-06T06:20:00Z", "plan": "Claude Max", "extra": [{ "id": "claude-routines", "title": "Daily Routines", "percent": 0, "windowMinutes": 10080 }], "windows": { "primary": { "usedPercent": 30, "windowMinutes": 300 }, "secondary": null, "tertiary": null }, "raw": { "…": "…" } },
      "cost":  { "window": "30d", "usd": 42.5, "tokens": { "total": 12000000 }, "session": { "usd": 1.2, "tokens": 250000 }, "totals": { "…": "…" }, "daily": [{ "date": "2026-06-06", "usd": 6.25, "tokens": 1800000, "models": [{ "name": "claude-opus-4-8", "usd": 6.25, "tokens": 1800000 }] }], "models": [{ "name": "claude-opus-4-8", "usd": 30.1, "tokens": 9000000 }], "raw": { "…": "…" } },
      "error": null
    },
    {
      "provider": "gemini",
      "source": "api",
      "updatedAt": null,
      "usage": { "percent": null, "resetsAt": null, "windows": { "primary": null, "secondary": null, "tertiary": null }, "raw": null },
      "cost": null,
      "error": { "message": "codexbar usage failed: …" }
    }
  ]
}
```

---

## Schemas

### Envelope
| Field | Type | Description |
|---|---|---|
| `generatedAt` | string (ISO‑8601) | When this response was assembled |
| `cached` | boolean | `true` if served from the TTL cache |
| `providers` | array\<ProviderEntry> | One entry per queried provider |

### ProviderEntry
| Field | Type | Description |
|---|---|---|
| `provider` | string \| null | Provider id (`claude`, `codex`, `zai`, `gemini`, …) |
| `source` | string \| null | `oauth` / `api` (usage) or `local` (cost) |
| `updatedAt` | string \| null | codexbar's data timestamp |
| `usage` | Usage \| null | Present on `/v1/usage` and `/v1/summary`; `null` on `/v1/cost` |
| `cost` | Cost \| null | Present on `/v1/cost` and `/v1/summary`; `null` on `/v1/usage` or when unsupported/errored |
| `error` | Error \| null | Set when this provider's scrape failed |

### Usage
| Field | Type | Description |
|---|---|---|
| `percent` | number \| null | Primary-window used percent (0–100) |
| `resetsAt` | string \| null | When the primary window resets |
| `plan` | string \| null | Subscription plan label (codexbar `loginMethod`), e.g. `"Claude Max"`, `"plus"` |
| `extra` | array | Extra rate windows: `[{ id, title, percent, windowMinutes }]` (e.g. Claude "Daily Routines"); `[]` when none |
| `windows.primary` / `.secondary` / `.tertiary` | object \| null | Verbatim codexbar window objects (`usedPercent`, `windowMinutes`, `resetsAt`, …) |
| `raw` | object \| null | Verbatim codexbar `usage` payload |

### Cost
| Field | Type | Description |
|---|---|---|
| `window` | string | Window label, e.g. `"30d"` (codexbar's `historyDays`) |
| `usd` | number \| null | Cost over the window |
| `tokens.total` | number \| null | Total tokens over the window |
| `session.usd` / `session.tokens` | number \| null | Current-session cost / tokens |
| `totals` | object \| null | Token breakdown (`inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheCreationTokens`, `totalTokens`, `totalCost`) |
| `daily` | array | Per-day series `[{ date, usd, tokens, models: [{ name, usd, tokens }] }]`; `[]` when codexbar has no local logs (e.g. Codex) |
| `models` | array | Per-model totals aggregated across the window `[{ name, usd, tokens }]`, sorted by `usd` desc; `[]` when no daily data |
| `raw` | object \| null | Verbatim codexbar `cost` payload |

### Error
| Field | Type | Description |
|---|---|---|
| `message` | string | codexbar failure detail for this provider |

---

## Status codes & errors

| Status | When | Body |
|---|---|---|
| `200` | Success (including partial-provider failures, surfaced per-entry as `error`) | Envelope |
| `400` | `days` is not an integer in `1–365` | `{ "error": "days must be an integer 1-365" }` |
| `401` | Missing/invalid bearer token on `/v1/*` | `{ "error": "unauthorized" }` |
| `502` | **All** providers failed on `/v1/usage` (total outage) | `{ "error": "<joined provider messages>" }` |

`/v1/cost` and `/v1/summary` are best-effort and do not return `502` for provider failures —
failed providers appear as `error` entries with `200`.
