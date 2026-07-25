"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { fetchTotalEvents, fetchEventPage } from "@/lib/contract";
import { useFilterPersistence, FILTER_PRESETS } from "@/components/FilterPanel";
import FilterChips, { type FilterChip } from "@/components/FilterChips";
import { SkeletonTable, SkeletonStats } from "@/components/Skeleton";
import CopyButton from "@/components/CopyButton";
import type { AuditEvent } from "@/types";

const PAGE_SIZE = 20;

type SortKey = keyof Pick<AuditEvent, "index" | "timestamp" | "event_type" | "submitter">;

function exportAs(events: AuditEvent[], format: "csv" | "json") {
  const timestamp = Date.now();
  let content: string;
  let mime: string;
  const filename = `audit-ledger-export-${timestamp}.${format}`;
  if (format === "json") {
    content = JSON.stringify(events, null, 2);
    mime = "application/json";
  } else {
    const header = "index,timestamp,event_type,submitter,metadata,event_hash\n";
    const rows = events
      .map(
        (e) =>
          `${e.index},${e.timestamp},${e.event_type},${e.submitter},${e.metadata},${e.event_hash}`
      )
      .join("\n");
    content = header + rows;
    mime = "text/csv";
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function tryDecodeMetadata(hex: string): string {
  try {
    return Buffer.from(hex, "hex").toString("utf8");
  } catch {
    return hex;
  }
}

export default function ExplorerClient() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("index");
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { filters, updateFilter, clearFilters, applyPreset, hasActiveFilters } = useFilterPersistence();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = await fetchTotalEvents();
      setTotal(t);
      const evts = await fetchEventPage(page, PAGE_SIZE);
      setEvents(evts);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  // Client-side filtering
  const filtered = events.filter((e) => {
    if (filters.event_type && !e.event_type.toLowerCase().includes(filters.event_type.toLowerCase())) return false;
    if (filters.submitter && !e.submitter.toLowerCase().includes(filters.submitter.toLowerCase())) return false;
    if (filters.metadata && !e.metadata.includes(filters.metadata.toLowerCase())) return false;
    if (filters.dateFrom) {
      const fromTs = Math.floor(new Date(filters.dateFrom).getTime() / 1000);
      if (e.timestamp < fromTs) return false;
    }
    if (filters.dateTo) {
      const toTs = Math.floor(new Date(filters.dateTo).getTime() / 1000);
      if (e.timestamp > toTs) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortAsc ? cmp : -cmp;
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((p) => !p);
    else { setSortKey(key); setSortAsc(true); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span aria-hidden="true" style={{ opacity: 0.3 }}> ↕</span>;
    return <span aria-hidden="true">{sortAsc ? " ↑" : " ↓"}</span>;
  }

  // Build filter chips
  const activeChips: FilterChip[] = [];
  if (filters.event_type) activeChips.push({ key: "event_type", label: `Type: ${filters.event_type}` });
  if (filters.submitter) activeChips.push({ key: "submitter", label: `Submitter: ${filters.submitter.slice(0, 12)}…` });
  if (filters.metadata) activeChips.push({ key: "metadata", label: `Metadata: ${filters.metadata.slice(0, 12)}…` });
  if (filters.dateFrom) activeChips.push({ key: "dateFrom", label: `From: ${filters.dateFrom}` });
  if (filters.dateTo) activeChips.push({ key: "dateTo", label: `To: ${filters.dateTo}` });

  function removeChip(key: string) {
    updateFilter(key as keyof typeof filters, "");
  }

  if (error)
    return (
      <p role="alert" style={{ color: "var(--error)" }}>Error loading events: {error}</p>
    );

  return (
    <div>
      {/* Filter presets */}
      <div className="filter-presets mb-4">
        {FILTER_PRESETS.map((preset) => (
          <button
            key={preset.label}
            className={`filter-preset ${JSON.stringify(preset.filters) === JSON.stringify(filters) ? "active" : ""}`}
            onClick={() => applyPreset(preset.filters)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card mb-4" style={{ padding: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <input
            type="text"
            placeholder="Filter by type…"
            value={filters.event_type}
            onChange={(e) => updateFilter("event_type", e.target.value)}
          />
          <input
            type="text"
            placeholder="Filter by submitter…"
            value={filters.submitter}
            onChange={(e) => updateFilter("submitter", e.target.value)}
          />
          <input
            type="datetime-local"
            title="From date"
            value={filters.dateFrom}
            onChange={(e) => updateFilter("dateFrom", e.target.value)}
          />
          <input
            type="datetime-local"
            title="To date"
            value={filters.dateTo}
            onChange={(e) => updateFilter("dateTo", e.target.value)}
          />
        </div>
        {hasActiveFilters && (
          <button
            className="secondary"
            style={{ marginTop: 8 }}
            onClick={clearFilters}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Active filter chips */}
      <FilterChips chips={activeChips} onRemove={removeChip} onClearAll={clearFilters} />

      {/* Toolbar */}
      <div className="flex-between mb-4">
        <p className="text-muted">
          {hasActiveFilters ? `${sorted.length} matching` : `${total} total`} events · Page {page + 1} of {Math.max(totalPages, 1)}
        </p>
        <div className="flex gap-2 export-buttons">
          <button className="secondary" onClick={() => exportAs(sorted, "csv")} aria-label="Export filtered events as CSV">
            Export CSV
          </button>
          <button className="secondary" onClick={() => exportAs(sorted, "json")} aria-label="Export filtered events as JSON">
            Export JSON
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <SkeletonTable rows={8} cols={5} />
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("index")}>
                  # <SortIcon k="index" />
                </th>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("timestamp")}>
                  Timestamp <SortIcon k="timestamp" />
                </th>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("event_type")}>
                  Type <SortIcon k="event_type" />
                </th>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("submitter")}>
                  Submitter <SortIcon k="submitter" />
                </th>
                <th>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted" style={{ textAlign: "center", padding: 32 }}>
                    No events on this page.
                  </td>
                </tr>
              ) : (
                sorted.map((evt) => (
                  <tr key={evt.index}>
                    <td>
                      <Link href={`/explorer/${evt.event_hash}`} style={{ color: "var(--accent)" }}>
                        {evt.index}
                      </Link>
                    </td>
                    <td>{new Date(evt.timestamp * 1000).toLocaleString()}</td>
                    <td>
                      <span className="badge">{evt.event_type}</span>
                    </td>
                    <td className="mono" style={{ display: "flex", alignItems: "center" }}>
                      {evt.submitter.slice(0, 16)}…
                      <CopyButton value={evt.submitter} />
                    </td>
                    <td className="mono">{tryDecodeMetadata(evt.metadata).slice(0, 30)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex-between" style={{ marginTop: 16 }}>
        <button
          className="secondary"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
          aria-label="Go to previous page"
        >
          ← Previous
        </button>
        <span className="text-muted" aria-live="polite">
          {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of{" "}
          {total}
        </span>
        <button
          className="secondary"
          disabled={page >= totalPages - 1}
          onClick={() => setPage((p) => p + 1)}
          aria-label="Go to next page"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }

  return (
    <button
      className="secondary"
      onClick={(e) => { e.stopPropagation(); copy(); }}
      style={{ marginLeft: 8, padding: "4px 8px", fontSize: 11, minHeight: "auto" }}
      aria-label={copied ? "Copied to clipboard" : "Copy submitter address"}
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}
