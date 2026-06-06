import { timingSafeEqual } from 'node:crypto';

function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
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
