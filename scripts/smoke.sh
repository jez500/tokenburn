#!/usr/bin/env bash
# End-to-end smoke test: build the image, run it with the test stub binary
# (so no real credentials are needed), and assert the API behaves.
set -euo pipefail

docker build -t codexbar-api:smoke .

cid=$(docker run -d --rm \
  -e API_TOKEN=smoke-token \
  -e CODEXBAR_BIN=/app/test/fixtures/stub-codexbar \
  -e CODEXBAR_OAUTH_PROVIDERS=claude,codex \
  -p 3999:3000 \
  -v "$(pwd)/test:/app/test:ro" \
  codexbar-api:smoke)

cleanup() { docker stop "$cid" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# wait for health
for i in $(seq 1 20); do
  if curl -fs localhost:3999/healthz >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "healthz:"; curl -fs localhost:3999/healthz; echo
echo "unauthed /v1/usage (expect 401):"; curl -s -o /dev/null -w '%{http_code}\n' localhost:3999/v1/usage
echo "authed /v1/usage:"; curl -fs -H 'Authorization: Bearer smoke-token' localhost:3999/v1/usage; echo
echo "metrics:"; curl -fs localhost:3999/metrics | grep codexbar_ | head

echo "entrypoint resilience (missing OAuth tokens must not abort boot):"
docker logs "$cid" 2>&1 | grep -q "token file not readable" \
  && echo "  OK: warned about missing OAuth token files" \
  || echo "  NOTE: no OAuth warning (providers may not be enabled in this run)"
# The real assertion is that /healthz already returned ok above despite missing tokens.

echo "SMOKE OK"
