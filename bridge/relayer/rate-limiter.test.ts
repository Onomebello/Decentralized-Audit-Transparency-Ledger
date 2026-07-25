import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TokenBucketRateLimiter } from "./rate-limiter";

describe("TokenBucketRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with full tokens", () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 5, refillRate: 5, refillIntervalMs: 1000 });
    expect(limiter.getTokens()).toBe(5);
    limiter.stopAutoRefill();
  });

  it("consumes tokens", () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 5, refillRate: 5, refillIntervalMs: 1000 });
    expect(limiter.tryConsume(1)).toBe(true);
    expect(limiter.getTokens()).toBe(4);
    limiter.stopAutoRefill();
  });

  it("rejects when tokens exhausted", () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 2, refillRate: 1, refillIntervalMs: 1000 });
    expect(limiter.tryConsume(2)).toBe(true);
    expect(limiter.tryConsume(1)).toBe(false);
    limiter.stopAutoRefill();
  });

  it("refills tokens over time", () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 5, refillRate: 5, refillIntervalMs: 1000 });
    limiter.tryConsume(5);
    expect(limiter.getTokens()).toBe(0);

    vi.advanceTimersByTime(1000);
    expect(limiter.getTokens()).toBe(5);
    limiter.stopAutoRefill();
  });

  it("does not exceed max tokens on refill", () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 3, refillRate: 10, refillIntervalMs: 1000 });
    limiter.tryConsume(1);
    expect(limiter.getTokens()).toBe(2);

    vi.advanceTimersByTime(2000);
    expect(limiter.getTokens()).toBe(3);
    limiter.stopAutoRefill();
  });

  it("resets to max tokens", () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 5, refillRate: 1, refillIntervalMs: 1000 });
    limiter.tryConsume(5);
    limiter.reset();
    expect(limiter.getTokens()).toBe(5);
    limiter.stopAutoRefill();
  });

  it("returns correct stats", () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 10, refillRate: 5, refillIntervalMs: 500 });
    const stats = limiter.getStats();
    expect(stats.maxTokens).toBe(10);
    expect(stats.refillRate).toBe(5);
    expect(stats.refillIntervalMs).toBe(500);
    limiter.stopAutoRefill();
  });
});
