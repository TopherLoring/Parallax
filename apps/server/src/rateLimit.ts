export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, { startedAt: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error("Rate limit must be a positive integer");
    if (!Number.isInteger(windowMs) || windowMs < 1) throw new Error("Rate window must be a positive integer");
  }

  allow(key: string, now = Date.now()): boolean {
    const current = this.buckets.get(key);
    if (!current || now - current.startedAt >= this.windowMs || now < current.startedAt) {
      this.buckets.set(key, { startedAt: now, count: 1 });
      return true;
    }
    if (current.count >= this.limit) return false;
    current.count += 1;
    if (this.buckets.size > 5_000) {
      for (const [bucketKey, bucket] of this.buckets) {
        if (now - bucket.startedAt >= this.windowMs) this.buckets.delete(bucketKey);
      }
    }
    return true;
  }

  forget(key: string): void {
    this.buckets.delete(key);
  }

  clear(): void {
    this.buckets.clear();
  }
}
