"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { fetchEventById, fetchEventByOrder, fetchEventPage, fetchTotalEvents } from "@/lib/contract";
import type { AuditEvent } from "@/types";
import CopyButton from "@/components/CopyButton";
import Spinner from "@/components/Spinner";
import { SkeletonCard, SkeletonTable } from "@/components/Skeleton";

function tryDecodeMetadata(hex: string): string {
  try {
    return Buffer.from(hex, "hex").toString("utf8");
  } catch {
    return hex;
  }
}

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function EventDetailClient({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<AuditEvent | null>(null);
  const [history, setHistory] = useState<AuditEvent[]>([]);
  const [related, setRelated] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRawMetadata, setShowRawMetadata] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const evt = await fetchEventById(eventId);
      setEvent(evt);

      // Load event history (preceding events)
      const historyEvents: AuditEvent[] = [];
      const startIdx = Math.max(0, evt.index - 5);
      for (let i = evt.index - 1; i >= startIdx; i--) {
        try {
          historyEvents.push(await fetchEventByOrder(i));
        } catch {
          break;
        }
      }
      setHistory(historyEvents);

      // Load related events (same type, excluding current)
      const total = await fetchTotalEvents();
      const relatedEvents: AuditEvent[] = [];
      const scanLimit = Math.min(total, 100);
      for (let i = total - 1; i >= Math.max(0, total - scanLimit) && relatedEvents.length < 5; i--) {
        try {
          const e = await fetchEventByOrder(i);
          if (e.index !== evt.index && (e.event_type === evt.event_type || e.submitter === evt.submitter)) {
            relatedEvents.push(e);
          }
        } catch {
          break;
        }
      }
      setRelated(relatedEvents);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div>
        <Link href="/explorer" className="back-link">← Back to Explorer</Link>
        <SkeletonCard />
        <div style={{ marginTop: 24 }}>
          <SkeletonTable rows={3} cols={4} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Link href="/explorer" className="back-link">← Back to Explorer</Link>
        <div className="card" style={{ padding: 32, textAlign: "center" }}>
          <p style={{ color: "var(--error)", marginBottom: 12 }}>Failed to load event</p>
          <p className="text-muted text-sm" style={{ marginBottom: 16 }}>{error}</p>
          <button onClick={load}>Retry</button>
        </div>
      </div>
    );
  }

  if (!event) return null;

  const metaDecoded = tryDecodeMetadata(event.metadata);

  return (
    <div>
      <Link href="/explorer" className="back-link">← Back to Explorer</Link>

      {/* Header */}
      <div className="card mb-6">
        <div className="flex-between">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
              Event #{event.index}
            </h1>
            <p className="text-muted text-sm">
              {new Date(event.timestamp * 1000).toLocaleString()} · {timeAgo(event.timestamp)}
            </p>
          </div>
          <span className="badge" style={{ fontSize: 14, padding: "4px 12px" }}>
            {event.event_type}
          </span>
        </div>
      </div>

      {/* Metadata display */}
      <div className="detail-section">
        <div className="detail-section-title">Event Details</div>
        <div className="card">
          <dl className="detail-grid">
            <dt className="text-muted text-sm">Index</dt>
            <dd className="mono">{event.index}</dd>

            <dt className="text-muted text-sm">Event Type</dt>
            <dd><span className="badge">{event.event_type}</span></dd>

            <dt className="text-muted text-sm">Timestamp</dt>
            <dd className="mono">
              {new Date(event.timestamp * 1000).toISOString()}
              <span className="text-muted" style={{ marginLeft: 8 }}>({timeAgo(event.timestamp)})</span>
            </dd>

            <dt className="text-muted text-sm">Submitter</dt>
            <dd className="mono" style={{ display: "flex", alignItems: "center", wordBreak: "break-all" }}>
              {event.submitter}
              <CopyButton value={event.submitter} />
            </dd>

            <dt className="text-muted text-sm">Metadata (decoded)</dt>
            <dd className="mono" style={{ wordBreak: "break-all" }}>
              {metaDecoded || <span className="text-muted">(empty)</span>}
            </dd>

            <dt className="text-muted text-sm">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                Metadata (hex)
                <button
                  className="secondary"
                  style={{ padding: "2px 8px", fontSize: 11 }}
                  onClick={() => setShowRawMetadata(!showRawMetadata)}
                >
                  {showRawMetadata ? "Hide" : "Show"}
                </button>
              </div>
            </dt>
            <dd className="mono" style={{ wordBreak: "break-all" }}>
              {showRawMetadata ? (
                <div style={{ display: "flex", alignItems: "flex-start" }}>
                  {event.metadata || <span className="text-muted">(empty)</span>}
                  {event.metadata && <CopyButton value={event.metadata} />}
                </div>
              ) : (
                <span className="text-muted">{event.metadata ? `${event.metadata.slice(0, 40)}…` : "(empty)"}</span>
              )}
            </dd>

            <dt className="text-muted text-sm">Event Hash</dt>
            <dd className="mono" style={{ wordBreak: "break-all", display: "flex", alignItems: "center" }}>
              {event.event_hash}
              <CopyButton value={event.event_hash} />
            </dd>

            <dt className="text-muted text-sm">Previous Hash</dt>
            <dd className="mono" style={{ wordBreak: "break-all", display: "flex", alignItems: "center" }}>
              {event.prev_hash || <span className="text-muted">(genesis event)</span>}
              {event.prev_hash && <CopyButton value={event.prev_hash} />}
            </dd>

            {event.tx_hash && (
              <>
                <dt className="text-muted text-sm">Stellar Transaction</dt>
                <dd>
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${event.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono"
                    style={{ wordBreak: "break-all", display: "inline-flex", alignItems: "center" }}
                  >
                    {event.tx_hash}
                    <span style={{ marginLeft: 4 }}>↗</span>
                  </a>
                </dd>
              </>
            )}
          </dl>
        </div>
      </div>

      {/* Event history */}
      {history.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-title">Event History (preceding events)</div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Type</th>
                  <th>Submitter</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {history.map((evt) => (
                  <tr key={evt.index}>
                    <td>
                      <Link href={`/explorer/${evt.event_hash}`} style={{ color: "var(--accent)" }}>
                        {evt.index}
                      </Link>
                    </td>
                    <td><span className="badge">{evt.event_type}</span></td>
                    <td className="mono">{evt.submitter.slice(0, 16)}…</td>
                    <td>{new Date(evt.timestamp * 1000).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Related events */}
      {related.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-title">Related Events (same type or submitter)</div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Type</th>
                  <th>Submitter</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {related.map((evt) => (
                  <tr key={evt.index}>
                    <td>
                      <Link href={`/explorer/${evt.event_hash}`} style={{ color: "var(--accent)" }}>
                        {evt.index}
                      </Link>
                    </td>
                    <td><span className="badge">{evt.event_type}</span></td>
                    <td className="mono">{evt.submitter.slice(0, 16)}…</td>
                    <td>{new Date(evt.timestamp * 1000).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
