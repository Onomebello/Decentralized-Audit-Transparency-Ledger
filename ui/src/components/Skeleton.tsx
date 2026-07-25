"use client";

export function SkeletonBlock({ width, height = 14 }: { width?: string | number; height?: number }) {
  return (
    <div
      className="skeleton"
      style={{ width: width ?? "100%", height, borderRadius: 4 }}
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton skeleton-text"
          style={i === lines - 1 ? { width: "60%" } : undefined}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton skeleton-heading" />
      <SkeletonText lines={2} />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="skeleton-card" style={{ padding: 0, overflow: "hidden" }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="skeleton-row"
          style={{
            padding: "10px 12px",
            borderBottom: r < rows - 1 ? "1px solid var(--border)" : undefined,
          }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="skeleton skeleton-cell"
              style={{ flex: c === 0 ? 0.5 : 1 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid-4 mb-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton skeleton-text" style={{ width: "50%", height: 12, marginBottom: 12 }} />
          <div className="skeleton" style={{ width: "70%", height: 28, borderRadius: 4 }} />
        </div>
      ))}
    </div>
  );
}
