export function loadConfig(env = process.env) {
  const apiToken = env.API_TOKEN;
  if (!apiToken) {
    throw new Error('API_TOKEN is required');
  }
  const providers = (env.CODEXBAR_PROVIDERS || 'codex,claude,gemini,z.ai')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    apiToken,
    port: Number(env.PORT || 3000),
    cacheTtlMs: Number(env.CACHE_TTL_SECONDS || 300) * 1000,
    execTimeoutMs: Number(env.EXEC_TIMEOUT_MS || 30000),
    codexbarBin: env.CODEXBAR_BIN || 'codexbar',
    providers,
  };
}
