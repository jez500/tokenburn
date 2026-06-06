# Postman collection — codexbar-api

Files:
- `codexbar-api.postman_collection.json` — all endpoints with Bearer auth, test assertions, and example responses.
- `codexbar-api.postman_environment.json` — `base_url` + `api_token` variables for a local run.

## Import
1. Postman → **Import** → select both JSON files.
2. Select the **codexbar-api (local)** environment (top-right).
3. Set `api_token` to your server's `API_TOKEN` (the bundled value is `change-me`, matching `.env.example`).
4. Confirm `base_url` (default `http://localhost:3033`).

## Run
- Start the API: `docker compose up --build` (from the repo root).
- Send any request, or use the **Collection Runner** to execute all requests and their test assertions.

## Notes
- `/v1/*` requests inherit Bearer auth from the collection; `Ops → Health check` / `Metrics` and the `Unauthorized (401 example)` request override it with no-auth on purpose.
- Toggle the `provider` / `days` query params (disabled by default on some requests) to filter.
- Full reference: [`../docs/API.md`](../docs/API.md).
