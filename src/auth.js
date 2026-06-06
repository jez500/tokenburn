import { timingSafeEqual } from 'node:crypto';

function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // Always run a constant-time compare against an equal-length buffer so the
  // length of the expected token can't be inferred from response timing.
  const ref = ab.length === bb.length ? bb : Buffer.alloc(ab.length);
  return timingSafeEqual(ab, ref) && ab.length === bb.length;
}

export function bearerAuth(token) {
  return function (req, res, next) {
    const header = req.headers.authorization || '';
    const prefix = 'Bearer ';
    if (!header.startsWith(prefix) || !safeEqual(header.slice(prefix.length), token)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    next();
  };
}
