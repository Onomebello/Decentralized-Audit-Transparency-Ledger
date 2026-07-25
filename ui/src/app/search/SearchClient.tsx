"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { searchEvents } from "@/lib/contract";
import { Search } from "lucide-react";
import type { AuditEvent, SearchFilters } from "@/types";
import FilterChips, { type FilterChip } from "@/components/FilterChips";
import { LoadingOverlay } from "@/components/Spinner";
import { SkeletonTable } from "@/components/Skeleton";
import CopyButton from "@/components/CopyButton";

const HISTORY_KEY = "audit-ledger-search-history";
const MAX_HISTORY = 10;

function loadHistory(): SearchFilters[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveHistory(filters: SearchFilters) {
  if (typeof window === "undefined") return;
  const hasAny = filters.event_type || filters.submitter || filters.metadata || filters.dateFrom || filters.dateTo;
  if (!hasAny) return;
  const history = loadHistory().filter(
    (h) => JSON.stringify(h) !== JSON.stringify(filters)
  );
  history.unshift(filters);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

function clearHistory() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(HISTORY_KEY);
}

function tryDecodeMetadata(hex: string): string {
  try {
    return Buffer.from(hex, "hex").toString("utf8");
  } catch {
    return hex;
  }
}

export default function SearchClient() {
  const [filters, setFilters] = useState<SearchFilters>({});
  const [results, setResults] = useState<AuditEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState<SearchFilters[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    setSearchHistory(loadHistory());
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      saveHistory(filters);
      setSearchHistory(loadHistory());
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

  function applyHistoryItem(item: SearchFilters) {
    setFilters(item);
    setShowHistory(false);
  }

  function removeHistoryItem(idx: number) {
    const updated = searchHistory.filter((_, i) => i !== idx);
    setSearchHistory(updated);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  }

  function handleClearAllHistory() {
    clearHistory();
    setSearchHistory([]);
    setShowHistory(false);
  }

  // Build active filter chips
  const activeChips: FilterChip[] = [];
  if (filters.event_type) activeChips.push({ key: "event_type", label: `Type: ${filters.event_type}` });
  if (filters.submitter) activeChips.push({ key: "submitter", label: `Submitter: ${filters.submitter.slice(0, 12)}…` });
  if (filters.metadata) activeChips.push({ key: "metadata", label: `Metadata: ${filters.metadata.slice(0, 12)}…` });
  if (filters.dateFrom) activeChips.push({ key: "dateFrom", label: `From: ${filters.dateFrom}` });
  if (filters.dateTo) activeChips.push({ key: "dateTo", label: `To: ${filters.dateTo}` });

  function removeChip(key: string) {
    setFilters((f) => {
      const next = { ...f };
      delete (next as Record<string, unknown>)[key];
      return next;
    });
  }

  function clearChips() {
    setFilters({});
    setResults(null);
    setSearched(false);
  }

  return (
    <div>
      {/* Search form */}
      <form onSubmit={handleSearch} className="card mb-4">
        <div className="search-input-wrapper mb-4">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search events by type, submitter, or metadata…"
            value={filters.event_type ?? filters.submitter ?? filters.metadata ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              // Smart search: if it looks like an address, set submitter; otherwise event_type
              if (v.startsWith("G") && v.length > 20) {
                set("submitter", v);
                set("event_type", "");
                set("metadata", "");
              } else {
                set("event_type", v);
                set("submitter", "");
                set("metadata", "");
              }
            }}
            style={{ paddingLeft: 36, fontSize: 15, padding: "10px 12px 10px 36px" }}
          />
        </div>

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

        <div className="flex gap-2" style={{ alignItems: "center" }}>
          <button type="submit" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
          {Object.keys(filters).length > 0 && (
            <button type="button" className="secondary" onClick={clearChips}>
              Clear
            </button>
          )}
          {searchHistory.length > 0 && (
            <button
              type="button"
              className="secondary"
              onClick={() => setShowHistory(!showHistory)}
              style={{ marginLeft: "auto" }}
            >
              {showHistory ? "Hide History" : `History (${searchHistory.length})`}
            </button>
          )}
        </div>
      </form>

      {/* Active filter chips */}
      <FilterChips chips={activeChips} onRemove={removeChip} onClearAll={clearChips} />

      {/* Search history */}
      {showHistory && searchHistory.length > 0 && (
        <div className="card mb-4">
          <div className="flex-between mb-4">
            <p style={{ fontWeight: 600, fontSize: 14 }}>Recent Searches</p>
            <button
              className="secondary"
              style={{ padding: "4px 10px", fontSize: 12 }}
              onClick={handleClearAllHistory}
            >
              Clear All
            </button>
          </div>
          <div className="search-history">
            {searchHistory.map((item, idx) => (
              <div
                key={idx}
                className="search-history-item"
                onClick={() => applyHistoryItem(item)}
              >
                <span className="mono text-sm" style={{ marginRight: 8 }}>
                  {item.event_type && `type:${item.event_type}`}
                  {item.submitter && ` addr:${item.submitter.slice(0, 12)}…`}
                  {item.metadata && ` meta:${item.metadata.slice(0, 12)}…`}
                  {!item.event_type && !item.submitter && !item.metadata && "(all events)"}
                </span>
                <span className="text-muted text-sm" style={{ marginRight: 8 }}>
                  {item.dateFrom || item.dateTo ? `${item.dateFrom ?? "…"} to ${item.dateTo ?? "…"}` : ""}
                </span>
                <button
                  className="filter-chip-remove"
                  onClick={(e) => { e.stopPropagation(); removeHistoryItem(idx); }}
                  title="Remove from history"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p style={{ color: "var(--error)", marginBottom: 16 }}>{error}</p>}

      {/* Loading state */}
      {loading && (
        <div className="mb-4">
          <SkeletonTable rows={5} cols={5} />
        </div>
      )}

      {/* Results */}
      {!loading && results !== null && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
            <span className="text-muted">{results.length} result(s) found</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table aria-label="Search results">
              <thead>
                <tr>
                  <td colSpan={5} className="text-muted" style={{ textAlign: "center", padding: 32 }}>
                    No matching events found. Try adjusting your filters.
                  </td>
                </tr>
              ) : (
                results.map((evt) => (
                  <tr key={evt.index}>
                    <td>
                      <Link href={`/explorer/${evt.event_hash}`} style={{ color: "var(--accent)" }}>
                        {evt.index}
                      </Link>
                    </td>
                    <td>
                      <span className="badge">{evt.event_type}</span>
                    </td>
                    <td className="mono" style={{ display: "flex", alignItems: "center" }}>
                      {evt.submitter.slice(0, 16)}…
                      <CopyButton value={evt.submitter} />
                    </td>
                    <td>{new Date(evt.timestamp * 1000).toLocaleString()}</td>
                    <td className="mono">{tryDecodeMetadata(evt.metadata).slice(0, 40)}</td>
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

      {/* Empty state */}
      {!loading && !searched && (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <Search size={32} style={{ color: "var(--text-muted)", marginBottom: 12 }} />
          <p className="text-muted">Enter search criteria above to find audit events</p>
        </div>
      )}
    </div>
    </div>
    </SectionErrorBoundary>
  );
}
