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

export HOME="${HOME:-/home/node}"
mkdir -p "$HOME/.codexbar"

# Providers that authenticate via mounted OAuth token files (no API key).
OAUTH_PROVIDERS="${CODEXBAR_OAUTH_PROVIDERS:-claude,codex}"

is_oauth() {
  case ",$OAUTH_PROVIDERS," in *",$1,"*) return 0 ;; *) return 1 ;; esac
}

# API-key providers: store the key from env and enable. set-api-key enables
# the provider implicitly. Skipped for providers configured for OAuth.
provision_api_key() {
  local env_name="$1" provider="$2"
  if is_oauth "$provider"; then return 0; fi
  local value="${!env_name:-}"
  if [ -n "$value" ]; then
    if printf '%s' "$value" | codexbar config set-api-key --provider "$provider" --stdin; then
      echo "Provisioned API-key provider: $provider"
    else
      echo "WARN: failed to set key for $provider" >&2
    fi
  fi
}

# OAuth providers: no key; just enable and check the mounted token file is present.
provision_oauth() {
  local provider="$1" token_path="$2"
  codexbar config enable --provider "$provider" >/dev/null 2>&1 \
    || echo "WARN: failed to enable $provider" >&2
  if [ -r "$token_path" ]; then
    echo "Provisioned OAuth provider: $provider (token: $token_path)"
  else
    echo "WARN: OAuth provider $provider enabled but token file not readable: $token_path" >&2
    echo "      (mount the host credential dir read-write; container runs as uid 1000)" >&2
  fi
}

# API-key providers (skipped when their env var is empty).
provision_api_key GEMINI_API_KEY gemini
provision_api_key ZAI_API_KEY    z.ai
provision_api_key OPENAI_ADMIN_KEY    codex
provision_api_key ANTHROPIC_ADMIN_KEY claude

# OAuth providers (mounted token files at the container user's home directory).
is_oauth claude && provision_oauth claude "$HOME/.claude/.credentials.json"
is_oauth codex  && provision_oauth codex  "$HOME/.codex/auth.json"

# Validate config but never hard-fail boot on it.
codexbar config validate || echo "WARN: codexbar config validate reported issues" >&2

exec node src/index.js
