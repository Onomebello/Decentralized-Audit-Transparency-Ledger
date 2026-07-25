/**
 * Token Bucket Rate Limiter (#260)
 *
 * Implements a token bucket algorithm for rate limiting bridge operations.
 * Tokens refill at a configurable rate up to a maximum capacity.
 */

export interface RateLimiterConfig {
  maxTokens: number;
  refillRate: number;
  refillIntervalMs: number;
}

export interface RateLimiterStats {
  tokens: number;
  maxTokens: number;
  refillRate: number;
  refillIntervalMs: number;
  lastRefill: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxTokens: 10,
  refillRate: 10,
  refillIntervalMs: 1000,
};

export class TokenBucketRateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number;
  private refillIntervalMs: number;
  private lastRefill: number;
  private refillTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    const merged = { ...DEFAULT_CONFIG, ...config };
    this.maxTokens = merged.maxTokens;
    this.tokens = merged.maxTokens;
    this.refillRate = merged.refillRate;
    this.refillIntervalMs = merged.refillIntervalMs;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const refillCount = Math.floor((elapsed / this.refillIntervalMs) * this.refillRate);
    if (refillCount > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + refillCount);
      this.lastRefill = now;
    }
  }

  tryConsume(tokens: number = 1): boolean {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }

  async waitForToken(tokens: number = 1): Promise<void> {
    while (!this.tryConsume(tokens)) {
      const waitMs = Math.ceil((tokens - this.tokens) / this.refillRate * this.refillIntervalMs);
      await new Promise((r) => setTimeout(r, Math.min(waitMs, 1000)));
    }
  }

  getTokens(): number {
    this.refill();
    return this.tokens;
  }

  getStats(): RateLimiterStats {
    this.refill();
    return {
      tokens: this.tokens,
      maxTokens: this.maxTokens,
      refillRate: this.refillRate,
      refillIntervalMs: this.refillIntervalMs,
      lastRefill: this.lastRefill,
    };
  }

  startAutoRefill(): void {
    if (this.refillTimer) return;
    this.refillTimer = setInterval(() => this.refill(), this.refillIntervalMs);
  }

  stopAutoRefill(): void {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
    }
  }

  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }
}

export function createStellarRateLimiter(): TokenBucketRateLimiter {
  return new TokenBucketRateLimiter({
    maxTokens: parseInt(process.env.STELLAR_RATE_MAX_TOKENS ?? "10", 10),
    refillRate: parseInt(process.env.STELLAR_RATE_REFILL_RATE ?? "10", 10),
    refillIntervalMs: parseInt(process.env.STELLAR_RATE_REFILL_INTERVAL_MS ?? "1000", 10),
  });
}

export function createEvmRateLimiter(): TokenBucketRateLimiter {
  return new TokenBucketRateLimiter({
    maxTokens: parseInt(process.env.EVM_RATE_MAX_TOKENS ?? "5", 10),
    refillRate: parseInt(process.env.EVM_RATE_REFILL_RATE ?? "5", 10),
    refillIntervalMs: parseInt(process.env.EVM_RATE_REFILL_INTERVAL_MS ?? "1000", 10),
  });
}
