import { Request, Response, NextFunction } from "express";
import { validateKey, ApiKeyRecord } from "./keys";

declare global {
  namespace Express {
    interface Request {
      apiKeyRecord?: ApiKeyRecord;
    }
  }
}

const keyBuckets = new Map<string, { tokens: number; lastRefill: number }>();

const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX ?? "100", 10);
const RATE_LIMIT_REFILL_RATE = parseInt(process.env.RATE_LIMIT_REFILL_RATE ?? "100", 10);
const RATE_LIMIT_REFILL_INTERVAL_MS = parseInt(process.env.RATE_LIMIT_REFILL_INTERVAL_MS ?? "60000", 10);

function getBucket(key: string) {
  let bucket = keyBuckets.get(key);
  if (!bucket) {
    bucket = { tokens: RATE_LIMIT_MAX, lastRefill: Date.now() };
    keyBuckets.set(key, bucket);
  }
  const now = Date.now();
  const elapsed = now - bucket.lastRefill;
  const refillCount = Math.floor((elapsed / RATE_LIMIT_REFILL_INTERVAL_MS) * RATE_LIMIT_REFILL_RATE);
  if (refillCount > 0) {
    bucket.tokens = Math.min(RATE_LIMIT_MAX, bucket.tokens + refillCount);
    bucket.lastRefill = now;
  }
  return bucket;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "GET") {
    return next();
  }

  const key = req.headers["x-api-key"] as string
    ?? req.headers["authorization"]?.replace("Bearer ", "");

  if (!key) {
    res.status(401).json({ error: "Unauthorized: missing API key" });
    return;
  }

  const record = validateKey(key);
  if (!record) {
    res.status(401).json({ error: "Unauthorized: invalid API key" });
    return;
  }

  req.apiKeyRecord = record;
  next();
}

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers["x-api-key"] as string
    ?? req.headers["authorization"]?.replace("Bearer ", "")
    ?? `ip:${req.ip}`;

  const bucket = getBucket(key);
  const limit = RATE_LIMIT_MAX;
  const remaining = bucket.tokens;
  const resetSeconds = Math.ceil(
    (RATE_LIMIT_REFILL_INTERVAL_MS - (Date.now() - bucket.lastRefill)) / 1000
  );

  res.setHeader("X-RateLimit-Limit", String(limit));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
  res.setHeader("X-RateLimit-Reset", String(Math.max(0, resetSeconds)));

  if (bucket.tokens <= 0) {
    const retryAfter = Math.ceil((1 / RATE_LIMIT_REFILL_RATE) * RATE_LIMIT_REFILL_INTERVAL_MS / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({ error: "Rate limit exceeded", retryAfter });
    return;
  }

  bucket.tokens--;
  next();
}
