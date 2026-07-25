"use client";
import { useState } from "react";
import { searchEvents } from "@/lib/contract";
import type { AuditEvent, SearchFilters } from "@/types";

export default function SearchClient() {
  const [filters, setFilters] = useState<SearchFilters>({});
  const [results, setResults] = useState<AuditEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const evts = await searchEvents(filters);
      setResults(evts);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function set(k: keyof SearchFilters, v: string) {
    setFilters((f) => ({ ...f, [k]: v || undefined }));
  }

  return (
    <div>
      <form onSubmit={handleSearch} className="card mb-6" role="search" aria-label="Event search">
        <div className="grid-2 gap-4 mb-4">
          <div>
            <label htmlFor="search-type" className="text-muted text-sm">Event Type</label>
            <input
              id="search-type"
              placeholder="e.g. payment"
              value={filters.event_type ?? ""}
              onChange={(e) => set("event_type", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="search-submitter" className="text-muted text-sm">Submitter Address</label>
            <input
              id="search-submitter"
              placeholder="G…"
              value={filters.submitter ?? ""}
              onChange={(e) => set("submitter", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="search-metadata" className="text-muted text-sm">Metadata contains (hex)</label>
            <input
              id="search-metadata"
              placeholder="hex substring"
              value={filters.metadata ?? ""}
              onChange={(e) => set("metadata", e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <div style={{ flex: 1 }}>
              <label htmlFor="search-from" className="text-muted text-sm">From</label>
              <input
                id="search-from"
                type="date"
                value={filters.dateFrom ?? ""}
                onChange={(e) => set("dateFrom", e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="search-to" className="text-muted text-sm">To</label>
              <input
                id="search-to"
                type="date"
                value={filters.dateTo ?? ""}
                onChange={(e) => set("dateTo", e.target.value)}
              />
            </div>
          </div>
        </div>
        <button type="submit" disabled={loading} aria-busy={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p role="alert" style={{ color: "var(--error)", marginBottom: 16 }}>{error}</p>}

      {results !== null && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
            <span className="text-muted" aria-live="polite">{results.length} result(s)</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table aria-label="Search results">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Type</th>
                  <th scope="col">Submitter</th>
                  <th scope="col">Timestamp</th>
                  <th scope="col">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-muted" style={{ textAlign: "center", padding: 24 }} role="status">
                      No matching events.
                    </td>
                  </tr>
                ) : (
                  results.map((evt) => (
                    <tr key={evt.index}>
                      <td>{evt.index}</td>
                      <td>
                        <span className="badge">{evt.event_type}</span>
                      </td>
                      <td className="mono">{evt.submitter.slice(0, 16)}…</td>
                      <td>{new Date(evt.timestamp * 1000).toLocaleString()}</td>
                      <td className="mono">
                        {(() => {
                          try {
                            return Buffer.from(evt.metadata, "hex").toString("utf8").slice(0, 40);
                          } catch {
                            return evt.metadata.slice(0, 40);
                          }
                        })()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
