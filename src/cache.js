export class TtlCache {
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    this.entries = new Map();   // key -> { value, expiresAt }
    this.inflight = new Map();  // key -> Promise
  }

  async getOrLoad(key, loader) {
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value;
    }
    const pending = this.inflight.get(key);
    if (pending) return pending;

    const promise = (async () => {
      const value = await loader();
      this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
      return value;
    })();
    this.inflight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(key);
    }
  }
}
