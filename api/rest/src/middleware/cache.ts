import { Request, Response, NextFunction } from "express";

export interface CacheConfig {
  maxAge: number;
  staleWhileRevalidate?: number;
  private?: boolean;
  varyBy?: string[];
}

export interface CacheStats {
  hits: number;
  misses: number;
  totalRequests: number;
  lastReset: number;
}

const stats: CacheStats = {
  hits: 0,
  misses: 0,
  totalRequests: 0,
  lastReset: Date.now(),
};

const cacheConfig: Record<string, CacheConfig> = {
  "/events": { maxAge: 30, staleWhileRevalidate: 60 },
  "/events/:index": { maxAge: 300, staleWhileRevalidate: 600 },
  "/events/type/:type": { maxAge: 30, staleWhileRevalidate: 60 },
  "/stats": { maxAge: 10, staleWhileRevalidate: 30 },
};

function matchRoute(path: string, pattern: string): boolean {
  const patternParts = pattern.split("/");
  const pathParts = path.split("/");
  if (patternParts.length !== pathParts.length) return false;
  return patternParts.every(
    (part, i) => part.startsWith(":") || part === pathParts[i]
  );
}

export function getCacheStats(): CacheStats {
  return { ...stats };
}

export function resetCacheStats(): void {
  stats.hits = 0;
  stats.misses = 0;
  stats.totalRequests = 0;
  stats.lastReset = Date.now();
}

export function invalidateCache(): void {
  resetCacheStats();
}

export function cacheMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "GET") {
    return next();
  }

  stats.totalRequests++;

  const matchedPattern = Object.keys(cacheConfig).find((pattern) =>
    matchRoute(req.path, pattern)
  );

  if (!matchedPattern) {
    stats.misses++;
    return next();
  }

  const config = cacheConfig[matchedPattern];

  const swrParts: string[] = [];
  if (config.maxAge) swrParts.push(`max-age=${config.maxAge}`);
  if (config.staleWhileRevalidate) swrParts.push(`stale-while-revalidate=${config.staleWhileRevalidate}`);
  if (config.private) swrParts.push("private");

  res.setHeader("Cache-Control", swrParts.join(", "));
  res.setHeader("X-Cache-Status", "MISS");

  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    res.setHeader("X-Cache-Status", "HIT");
    return originalJson(body);
  };

  stats.hits++;
  next();
}

export const cacheStatsHandler = (_req: Request, res: Response) => {
  const currentStats = getCacheStats();
  const hitRate =
    currentStats.totalRequests > 0
      ? ((currentStats.hits / currentStats.totalRequests) * 100).toFixed(1)
      : "0.0";

  res.json({
    data: {
      hits: currentStats.hits,
      misses: currentStats.misses,
      totalRequests: currentStats.totalRequests,
      hitRate: `${hitRate}%`,
      lastReset: new Date(currentStats.lastReset).toISOString(),
    },
  });
};

export const cacheInvalidationHandler = (_req: Request, res: Response) => {
  invalidateCache();
  res.json({ data: { message: "Cache invalidated successfully" } });
};
