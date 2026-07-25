"use client";
import { useEffect, useState, useCallback } from "react";
import { fetchTotalEvents, fetchEventPage } from "@/lib/contract";
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

function applyFilters(
  events: AuditEvent[],
  typeFilter: string,
  submitterFilter: string,
  dateFrom: string,
  dateTo: string
): AuditEvent[] {
  return events.filter((e) => {
    if (typeFilter && !e.event_type.toLowerCase().includes(typeFilter.toLowerCase())) return false;
    if (submitterFilter && !e.submitter.toLowerCase().includes(submitterFilter.toLowerCase())) return false;
    if (dateFrom) {
      const fromTs = Math.floor(new Date(dateFrom).getTime() / 1000);
      if (e.timestamp < fromTs) return false;
    }
    if (dateTo) {
      const toTs = Math.floor(new Date(dateTo).getTime() / 1000);
      if (e.timestamp > toTs) return false;
    }
    return true;
  });
}

export default function ExplorerClient() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("index");
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState("");
  const [submitterFilter, setSubmitterFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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

  const filtered = applyFilters(events, typeFilter, submitterFilter, dateFrom, dateTo);

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

  const hasFilters = typeFilter || submitterFilter || dateFrom || dateTo;

  if (error)
    return (
      <p role="alert" style={{ color: "var(--error)" }}>Error loading events: {error}</p>
    );

  return (
    <div>
      {/* Filters */}
      <div className="card mb-4" style={{ padding: 16 }}>
        <div
          className="filter-grid"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}
        >
          <div>
            <label htmlFor="filter-type" className="text-muted text-sm">Event Type</label>
            <input
              id="filter-type"
              type="text"
              placeholder="e.g. payment"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)" }}
            />
          </div>
          <div>
            <label htmlFor="filter-submitter" className="text-muted text-sm">Submitter</label>
            <input
              id="filter-submitter"
              type="text"
              placeholder="G..."
              value={submitterFilter}
              onChange={(e) => setSubmitterFilter(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)" }}
            />
          </div>
          <div>
            <label htmlFor="filter-date-from" className="text-muted text-sm">From Date</label>
            <input
              id="filter-date-from"
              type="datetime-local"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)" }}
            />
          </div>
          <div>
            <label htmlFor="filter-date-to" className="text-muted text-sm">To Date</label>
            <input
              id="filter-date-to"
              type="datetime-local"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)" }}
            />
          </div>
        </div>
        {hasFilters && (
          <button
            className="secondary"
            style={{ marginTop: 8 }}
            onClick={() => { setTypeFilter(""); setSubmitterFilter(""); setDateFrom(""); setDateTo(""); }}
            aria-label="Clear all active filters"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex-between mb-4">
        <p className="text-muted">
          {hasFilters ? `${sorted.length} matching` : `${total} total`} events · Page {page + 1} of {Math.max(totalPages, 1)}
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
        <table role="grid" aria-label="Audit events">
          <thead>
            <tr>
              <th style={{ cursor: "pointer" }} onClick={() => toggleSort("index")} scope="col" role="columnheader" aria-sort={sortKey === "index" ? (sortAsc ? "ascending" : "descending") : "none"}>
                # <SortIcon k="index" />
              </th>
              <th style={{ cursor: "pointer" }} onClick={() => toggleSort("timestamp")} scope="col" role="columnheader" aria-sort={sortKey === "timestamp" ? (sortAsc ? "ascending" : "descending") : "none"}>
                Timestamp <SortIcon k="timestamp" />
              </th>
              <th style={{ cursor: "pointer" }} onClick={() => toggleSort("event_type")} scope="col" role="columnheader" aria-sort={sortKey === "event_type" ? (sortAsc ? "ascending" : "descending") : "none"}>
                Type <SortIcon k="event_type" />
              </th>
              <th style={{ cursor: "pointer" }} onClick={() => toggleSort("submitter")} scope="col" role="columnheader" aria-sort={sortKey === "submitter" ? (sortAsc ? "ascending" : "descending") : "none"}>
                Submitter <SortIcon k="submitter" />
              </th>
              <th scope="col" role="columnheader">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-muted" style={{ textAlign: "center", padding: 32 }} role="status">
                  Loading…
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-muted" style={{ textAlign: "center", padding: 32 }} role="status">
                  No events on this page.
                </td>
              </tr>
            ) : (
              sorted.map((evt) => (
                <tr
                  key={evt.index}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelected(evt)}
                  role="row"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(evt); } }}
                  aria-label={`Event ${evt.index}: ${evt.event_type} by ${evt.submitter.slice(0, 16)}`}
                >
                  <td>{evt.index}</td>
                  <td>{new Date(evt.timestamp * 1000).toLocaleString()}</td>
                  <td>
                    <span className="badge">{evt.event_type}</span>
                  </td>
                  <td className="mono">{evt.submitter.slice(0, 16)}…</td>
                  <td className="mono">{tryDecodeMetadata(evt.metadata).slice(0, 30)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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

      {/* Event detail modal */}
      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Event ${selected.index} details`}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => setSelected(null)}
          onKeyDown={(e) => { if (e.key === "Escape") setSelected(null); }}
        >
          <div
            className="card modal-content"
            style={{ width: 600, maxWidth: "90vw", maxHeight: "80vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-between mb-4">
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Event #{selected.index}</h2>
              <button className="secondary" onClick={() => setSelected(null)} aria-label="Close event details">
                ✕
              </button>
            </div>
            <dl style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "8px 16px" }}>
              {(
                [
                  ["Index", String(selected.index)],
                  ["Type", selected.event_type],
                  ["Timestamp", new Date(selected.timestamp * 1000).toISOString()],
                  ["Metadata (hex)", selected.metadata],
                  ["Metadata (UTF-8)", tryDecodeMetadata(selected.metadata)],
                  ["Event Hash", selected.event_hash],
                  ["Prev Hash", selected.prev_hash],
                ] as [string, string][]
              ).map(([label, value]) => (
                <>
                  <dt key={`dt-${label}`} className="text-muted text-sm" style={{ alignSelf: "start" }}>
                    {label}
                  </dt>
                  <dd key={`dd-${label}`} className="mono" style={{ wordBreak: "break-all" }}>
                    {value}
                  </dd>
                </>
              ))}
              <dt className="text-muted text-sm" style={{ alignSelf: "center" }}>Submitter</dt>
              <dd className="mono" style={{ wordBreak: "break-all", display: "flex", alignItems: "center" }}>
                {selected.submitter}
                <CopyButton value={selected.submitter} />
              </dd>
              {selected.tx_hash && (
                <>
                  <dt className="text-muted text-sm" style={{ alignSelf: "center" }}>Stellar Tx</dt>
                  <dd>
                    <a
                      href={`https://stellar.expert/explorer/testnet/tx/${selected.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ wordBreak: "break-all" }}
                    >
                      {selected.tx_hash}
                    </a>
                  </dd>
                </>
              )}
            </dl>
          </div>
        </div>
      )}
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
