import express from 'express';
import { bearerAuth } from './auth.js';
import { Service } from './service.js';
import { Metrics } from './metrics.js';

function parseDays(raw) {
  if (raw === undefined) return 30;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 365) return null;
  return n;
}

function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  next();
}

export function createApp(config) {
  const app = express();
  const metrics = new Metrics();
  const service = new Service(config, metrics);
  const allowedProviders = new Set([...config.providers, 'all']);

  app.use(securityHeaders);

  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', metrics.registry.contentType);
    res.end(await metrics.registry.metrics());
  });

  const v1 = express.Router();
  v1.use(bearerAuth(config.apiToken));

  // Validate the provider against a fixed allowlist (the configured providers
  // plus "all") so request input can't be smuggled into the codexbar argv.
  const provider = (req) => {
    const raw = req.query.provider;
    if (raw === undefined || raw === 'all') return 'all';
    return allowedProviders.has(raw) ? raw : null;
  };

  v1.get('/usage', async (req, res) => {
    const p = provider(req);
    if (p === null) return res.status(400).json({ error: 'unknown provider' });
    try {
      res.json(await service.getUsage(p));
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  v1.get('/cost', async (req, res) => {
    const days = parseDays(req.query.days);
    if (days === null) return res.status(400).json({ error: 'days must be an integer 1-365' });
    const p = provider(req);
    if (p === null) return res.status(400).json({ error: 'unknown provider' });
    try {
      res.json(await service.getCost(days, p));
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  v1.get('/summary', async (req, res) => {
    const days = parseDays(req.query.days);
    if (days === null) return res.status(400).json({ error: 'days must be an integer 1-365' });
    const p = provider(req);
    if (p === null) return res.status(400).json({ error: 'unknown provider' });
    try {
      res.json(await service.getSummary(days, p));
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.use('/v1', v1);
  return app;
}
