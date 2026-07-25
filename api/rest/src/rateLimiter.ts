import { Request, Response, NextFunction } from "express";

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimitConfig {
  maxTokens: number;
  refillRate: number;
  refillIntervalMs: number;
}

const buckets = new Map<string, TokenBucket>();

const config: RateLimitConfig = {
  maxTokens: parseInt(process.env.RATE_LIMIT_MAX_TOKENS || "100"),
  refillRate: parseInt(process.env.RATE_LIMIT_REFILL_RATE || "10"),
  refillIntervalMs: parseInt(process.env.RATE_LIMIT_REFILL_INTERVAL_MS || "60000"),
};

function getClientKey(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || req.ip
    || "unknown";
}

function getBucket(key: string): TokenBucket {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = { tokens: config.maxTokens, lastRefill: now };
    buckets.set(key, bucket);
    return bucket;
  }

  const elapsed = now - bucket.lastRefill;
  const refillCount = Math.floor(elapsed / config.refillIntervalMs) * config.refillRate;
  if (refillCount > 0) {
    bucket.tokens = Math.min(config.maxTokens, bucket.tokens + refillCount);
    bucket.lastRefill = now;
  }

  return bucket;
}

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const key = getClientKey(req);
  const bucket = getBucket(key);

  const resetSeconds = Math.ceil(
    (config.refillIntervalMs - (Date.now() - bucket.lastRefill)) / 1000
  );

  res.setHeader("X-RateLimit-Limit", config.maxTokens);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, bucket.tokens - 1));
  res.setHeader("X-RateLimit-Reset", Math.max(0, resetSeconds));

  if (bucket.tokens <= 0) {
    res.setHeader("Retry-After", resetSeconds);
    res.status(429).json({
      error: "Too many requests",
      retryAfter: resetSeconds,
    });
    return;
  }

  bucket.tokens--;
  next();
}

export function resetBuckets(): void {
  buckets.clear();
}
