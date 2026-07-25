"use client";
import { useState, useCallback } from "react";
import { fetchTotalEvents, fetchEventByOrder } from "@/lib/contract";
import type { AuditEvent } from "@/types";

type ExportFormat = "csv" | "json" | "ndjson";

const FORMAT_OPTIONS: { value: ExportFormat; label: string; description: string }[] = [
  { value: "csv", label: "CSV", description: "Comma-separated values for spreadsheet tools" },
  { value: "json", label: "JSON", description: "Structured JSON array" },
  { value: "ndjson", label: "NDJSON", description: "Newline-delimited JSON for streaming" },
];

export default function ExportClient() {
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const exportEvents = useCallback(async () => {
    setExporting(true);
    setError(null);
    setCompleted(false);
    setProgress(0);

    try {
      const eventTotal = await fetchTotalEvents();
      if (eventTotal === 0) {
        setError("No events to export.");
        setExporting(false);
        return;
      }

      setTotal(eventTotal);

      const fromTs = dateFrom ? Math.floor(new Date(dateFrom).getTime() / 1000) : 0;
      const toTs = dateTo ? Math.floor(new Date(dateTo).getTime() / 1000) : Infinity;

      const BATCH_SIZE = 5;
      const exportedEvents: AuditEvent[] = [];

      for (let i = 0; i < eventTotal; i += BATCH_SIZE) {
        const batchEnd = Math.min(i + BATCH_SIZE, eventTotal);
        const batch = await Promise.all(
          Array.from({ length: batchEnd - i }, (_, j) => fetchEventByOrder(i + j))
        );

        for (const evt of batch) {
          if (evt.timestamp >= fromTs && evt.timestamp <= toTs) {
            exportedEvents.push(evt);
          }
        }

        setProgress(batchEnd);
        await new Promise((r) => setTimeout(r, 50));
      }

      if (exportedEvents.length === 0) {
        setError("No events matched the selected date range.");
        setExporting(false);
        return;
      }

      downloadFile(exportedEvents, format);
      setCompleted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }, [format, dateFrom, dateTo]);

  function downloadFile(events: AuditEvent[], fmt: ExportFormat) {
    const timestamp = Date.now();
    let content: string;
    let mime: string;
    let ext: string;

    if (fmt === "json") {
      content = JSON.stringify(events, null, 2);
      mime = "application/json";
      ext = "json";
    } else if (fmt === "ndjson") {
      content = events.map((e) => JSON.stringify(e)).join("\n");
      mime = "application/x-ndjson";
      ext = "ndjson";
    } else {
      const header = "index,timestamp,event_type,submitter,metadata,event_hash,prev_hash\n";
      const rows = events
        .map(
          (e) =>
            `${e.index},${e.timestamp},${e.event_type},${e.submitter},${e.metadata},${e.event_hash},${e.prev_hash}`
        )
        .join("\n");
      content = header + rows;
      mime = "text/csv";
      ext = "csv";
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-ledger-export-${timestamp}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;

  return (
    <div>
      {/* Export configuration */}
      <div className="grid-2 mb-6">
        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 16 }}>Export Format</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {FORMAT_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "12px 16px",
                  borderRadius: 8,
                  border: `1px solid ${format === opt.value ? "var(--accent)" : "var(--border)"}`,
                  background: format === opt.value ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "var(--bg)",
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
              >
                <input
                  type="radio"
                  name="format"
                  value={opt.value}
                  checked={format === opt.value}
                  onChange={() => setFormat(opt.value)}
                  style={{ marginTop: 2, accentColor: "var(--accent)" }}
                />
                <div>
                  <p style={{ fontWeight: 600, fontSize: 14 }}>{opt.label}</p>
                  <p className="text-muted text-sm">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 16 }}>Date Range (Optional)</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label className="text-muted text-sm" style={{ display: "block", marginBottom: 4 }}>
                From
              </label>
              <input
                type="datetime-local"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                disabled={exporting}
              />
            </div>
            <div>
              <label className="text-muted text-sm" style={{ display: "block", marginBottom: 4 }}>
                To
              </label>
              <input
                type="datetime-local"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                disabled={exporting}
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                className="secondary"
                style={{ fontSize: 12, padding: "4px 10px", alignSelf: "flex-start" }}
                onClick={() => { setDateFrom(""); setDateTo(""); }}
              >
                Clear dates
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Export button and progress */}
      <div className="card mb-6">
        <div className="flex-between mb-4">
          <div>
            <p style={{ fontWeight: 600 }}>Export</p>
            <p className="text-muted text-sm">
              {exporting
                ? `Exporting events… ${progress} of ${total}`
                : completed
                ? "Export completed successfully."
                : "Click to begin exporting events from the contract."}
            </p>
          </div>
          <button onClick={exportEvents} disabled={exporting}>
            {exporting ? "Exporting…" : completed ? "Export Again" : "Start Export"}
          </button>
        </div>

        {exporting && (
          <div>
            <div
              style={{
                height: 6,
                borderRadius: 3,
                background: "var(--border)",
                overflow: "hidden",
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: "var(--accent)",
                  borderRadius: 3,
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <div className="flex-between">
              <span className="text-muted text-sm">{pct}% complete</span>
              <span className="text-muted text-sm">
                {progress.toLocaleString()} / {total.toLocaleString()} events
              </span>
            </div>
          </div>
        )}

        {completed && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              background: "color-mix(in srgb, var(--success) 10%, transparent)",
              color: "var(--success)",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Your export has been downloaded.
          </div>
        )}

        {error && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              background: "color-mix(in srgb, var(--error) 10%, transparent)",
              color: "var(--error)",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Format details */}
      <div className="card">
        <p style={{ fontWeight: 600, marginBottom: 12 }}>Exported Fields</p>
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Description</th>
              <th>Example</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["index", "Sequential event index", "0"],
              ["timestamp", "Unix timestamp (seconds)", "1700000000"],
              ["event_type", "Event type symbol", "payment"],
              ["submitter", "Submitter Stellar address", "GABC..."],
              ["metadata", "Hex-encoded metadata payload", "48656c6c6f…"],
              ["event_hash", "SHA-256 event hash (hex)", "a1b2c3…"],
              ["prev_hash", "Previous event hash (hex)", "d4e5f6…"],
            ].map(([field, desc, example]) => (
              <tr key={field}>
                <td className="mono" style={{ fontWeight: 600 }}>{field}</td>
                <td className="text-muted">{desc}</td>
                <td className="mono">{example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
