import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export function createApp(config) {
  const apiBaseUrl = config.apiBaseUrl.replace(/\/$/, '');
  const app = express();

  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

  app.get('/api/summary', async (req, res) => {
    const qs = req.query.provider ? `?provider=${encodeURIComponent(req.query.provider)}` : '';
    try {
      const upstream = await fetch(`${apiBaseUrl}/v1/summary${qs}`, {
        headers: { Authorization: `Bearer ${config.apiToken}` },
      });
      const body = await upstream.text();
      if (!upstream.ok) {
        return res.status(502).json({ error: `upstream ${upstream.status}`, detail: body.slice(0, 500) });
      }
      res.set('Content-Type', 'application/json').send(body);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.use(express.static(join(here, 'public')));

  // SPA fallback: any non-API GET serves index.html.
  app.get('*', (req, res) => res.sendFile(join(here, 'public', 'index.html')));

  return app;
}

export function startServer() {
  const config = {
    apiBaseUrl: process.env.API_BASE_URL || 'http://codexbar-api:3000',
    apiToken: process.env.API_TOKEN || '',
    port: Number(process.env.PORT) || 3000,
  };
  if (!config.apiToken) {
    // eslint-disable-next-line no-console
    console.warn('WARNING: API_TOKEN is not set — every /api/summary call will return 502');
  }
  const app = createApp(config);
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`tokenburn-webui listening on :${config.port} → ${config.apiBaseUrl}`);
  });
}

// Start only when run directly (not when imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) startServer();
