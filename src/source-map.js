// src/source-map.js
export const DEFAULT_OAUTH_PROVIDERS = ['claude', 'codex'];
const COST_PROVIDERS = new Set(['claude', 'codex']);

export function oauthProvidersFromEnv(env = process.env) {
  const raw = env.CODEXBAR_OAUTH_PROVIDERS;
  const list = (raw === undefined ? DEFAULT_OAUTH_PROVIDERS.join(',') : raw)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return new Set(list);
}

export function sourceForProvider(provider, oauthProviders) {
  return oauthProviders.has(provider) ? 'oauth' : 'api';
}

export function costSupported(provider) {
  return COST_PROVIDERS.has(provider);
}

export function usageArgs(provider, source) {
  return ['usage', '--provider', provider, '--source', source, '--format', 'json'];
}

export function costArgs(provider) {
  return ['cost', '--provider', provider, '--format', 'json'];
}
