#!/usr/bin/env bash
set -euo pipefail

# Fail fast on the app token.
if [ -z "${API_TOKEN:-}" ]; then
  echo "FATAL: API_TOKEN is required" >&2
  exit 1
fi

# Verify the codexbar binary exists and is runnable.
if ! command -v codexbar >/dev/null 2>&1; then
  echo "FATAL: codexbar binary not found on PATH" >&2
  exit 1
fi

export HOME="${HOME:-/home/app}"
mkdir -p "$HOME/.codexbar"

# Map container env vars -> codexbar providers. For each present key,
# store it via set-api-key and enable the provider. set-api-key reads stdin.
provision() {
  local env_name="$1" provider="$2"
  local value="${!env_name:-}"
  if [ -n "$value" ]; then
    printf '%s' "$value" | codexbar config set-api-key --provider "$provider" --stdin || \
      echo "WARN: failed to set key for $provider" >&2
    codexbar config enable --provider "$provider" || \
      echo "WARN: failed to enable $provider" >&2
    echo "Provisioned provider: $provider"
  fi
}

provision OPENAI_ADMIN_KEY   codex
provision ANTHROPIC_ADMIN_KEY claude
provision GEMINI_API_KEY     gemini
provision ZAI_API_KEY        z.ai

# Validate config but never hard-fail boot on it.
codexbar config validate || echo "WARN: codexbar config validate reported issues" >&2

exec node src/index.js
