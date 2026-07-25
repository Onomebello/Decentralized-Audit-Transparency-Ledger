"use client";
import { useEffect, useState, useCallback } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from "recharts";
import { fetchTotalEvents, fetchEventPage } from "@/lib/contract";
import { useWebSocket, type WSStatus } from "@/lib/websocket";
import type { AuditEvent } from "@/types";

const COLORS = [
  "#4f8ef7", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#fb923c",
];

const KNOWN_TYPES = (process.env.NEXT_PUBLIC_EVENT_TYPES ?? "payment,refund,transfer,audit,governance,other").split(",");

const STATUS_LABELS: Record<WSStatus, string> = {
  connected: "Live",
  connecting: "Connecting…",
  disconnected: "Offline",
  error: "Error",
};

const STATUS_COLORS: Record<WSStatus, string> = {
  connected: "var(--success)",
  connecting: "var(--warn)",
  disconnected: "var(--text-muted)",
  error: "var(--error)",
};

export default function DashboardClient() {
  const [total, setTotal] = useState<number | null>(null);
  const [recent, setRecent] = useState<AuditEvent[]>([]);
  const [typeCounts, setTypeCounts] = useState<{ name: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const { status: wsStatus, events: wsEvents } = useWebSocket({
    onEvent: () => {
      // Auto-refresh data when new events arrive via WebSocket
      load();
    },
  });

  const load = useCallback(async () => {
    try {
      const t = await fetchTotalEvents();
      setTotal(t);
      if (t > 0) {
        const page = await fetchEventPage(0, Math.min(10, t));
        setRecent([...page].reverse());
      }
      const { fetchEventCount } = await import("@/lib/contract");
      const counts = await Promise.all(
        KNOWN_TYPES.map(async (type) => ({
          name: type,
          value: await fetchEventCount(type).catch(() => 0),
        }))
      );
      setTypeCounts(counts.filter((c) => c.value > 0));
      setLastUpdated(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const displayRecent = wsEvents.length > 0
    ? [...wsEvents, ...recent.filter((r) => !wsEvents.some((w) => w.index === r.index))].slice(0, 10)
    : recent;

  if (loading) return <p className="text-muted">Loading contract data…</p>;
  if (error)
    return (
      <p style={{ color: "var(--error)" }}>
        Could not connect to contract: {error}
      </p>
    );

  return (
    <div>
      {/* Stats row */}
      <div className="grid-4 mb-6">
        <div className="card">
          <p className="text-muted text-sm">Total Events</p>
          <p className="stat-value">{total ?? "—"}</p>
        </div>
        <div className="card">
          <p className="text-muted text-sm">Event Types Active</p>
          <p className="stat-value">{typeCounts.length}</p>
        </div>
        <div className="card">
          <p className="text-muted text-sm">Most Recent</p>
          <p className="stat-value" style={{ fontSize: 14 }}>
            {displayRecent[0]
              ? new Date(displayRecent[0].timestamp * 1000).toLocaleTimeString()
              : "—"}
          </p>
        </div>
        <div className="card">
          <div className="flex-between">
            <div>
              <p className="text-muted text-sm">Connection</p>
              <p className="stat-value" style={{ fontSize: 14, color: STATUS_COLORS[wsStatus] }}>
                {STATUS_LABELS[wsStatus]}
              </p>
            </div>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: STATUS_COLORS[wsStatus],
                boxShadow: wsStatus === "connected"
                  ? `0 0 8px ${STATUS_COLORS[wsStatus]}`
                  : "none",
              }}
            />
          </div>
          <p className="text-muted text-sm" style={{ marginTop: 4 }}>
            {wsEvents.length > 0
              ? `${wsEvents.length} live event${wsEvents.length !== 1 ? "s" : ""} this session`
              : "Real-time updates"}
          </p>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid-2 mb-6">
        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 12 }}>Events by Type</p>
          {typeCounts.length === 0 ? (
            <p className="text-muted">No typed events yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={typeCounts}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                >
                  {typeCounts.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 12 }}>Event Volume by Type</p>
          {typeCounts.length === 0 ? (
            <p className="text-muted">No typed events yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={typeCounts} layout="vertical">
                <XAxis type="number" stroke="var(--text-muted)" />
                <YAxis type="category" dataKey="name" width={80} stroke="var(--text-muted)" />
                <Tooltip />
                <Bar dataKey="value" fill="var(--accent)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent events */}
      <div className="card">
        <div className="flex-between mb-4">
          <p style={{ fontWeight: 600 }}>
            Recent Events
            {wsStatus === "connected" && (
              <span
                className="badge"
                style={{ marginLeft: 8, fontSize: 10, background: "color-mix(in srgb, var(--success) 20%, transparent)", color: "var(--success)" }}
              >
                LIVE
              </span>
            )}
          </p>
          <button className="secondary" onClick={load}>
            Refresh
          </button>
        </div>
        {displayRecent.length === 0 ? (
          <p className="text-muted">No events logged yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Type</th>
                <th>Submitter</th>
                <th>Timestamp</th>
                <th>Metadata (hex)</th>
              </tr>
            </thead>
            <tbody>
              {displayRecent.map((evt) => (
                <tr
                  key={evt.index}
                  style={
                    wsEvents.some((w) => w.index === evt.index)
                      ? { background: "color-mix(in srgb, var(--success) 8%, transparent)" }
                      : undefined
                  }
                >
                  <td>{evt.index}</td>
                  <td>
                    <span className="badge">{evt.event_type}</span>
                  </td>
                  <td className="mono">{evt.submitter.slice(0, 12)}…</td>
                  <td>{new Date(evt.timestamp * 1000).toLocaleString()}</td>
                  <td className="mono">{evt.metadata.slice(0, 20)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
