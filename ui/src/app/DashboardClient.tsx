"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
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
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import { fetchTotalEvents, fetchEventPage } from "@/lib/contract";
import { SkeletonStats, SkeletonTable } from "@/components/Skeleton";
import { ProgressBar } from "@/components/Spinner";
import type { AuditEvent } from "@/types";

const COLORS = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)",
  "var(--chart-4)", "var(--chart-5)", "var(--chart-6)",
];

const KNOWN_TYPES = (process.env.NEXT_PUBLIC_EVENT_TYPES ?? "payment,refund,transfer,audit,governance,other").split(",");

function buildTimeSeries(events: AuditEvent[], intervalMinutes: number) {
  if (events.length === 0) return [];
  const buckets = new Map<string, number>();
  for (const e of events) {
    const d = new Date(e.timestamp * 1000);
    const key = new Date(
      Math.floor(d.getTime() / (intervalMinutes * 60000)) * intervalMinutes * 60000
    ).toISOString();
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, count]) => ({ time: new Date(time).toLocaleString([], { hour: "2-digit", minute: "2-digit" }), count }));
}

function buildSubmitterActivity(events: AuditEvent[]) {
  const counts = new Map<string, number>();
  for (const e of events) {
    const short = e.submitter.slice(0, 8) + "…";
    counts.set(short, (counts.get(short) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([submitter, count]) => ({ submitter, count }));
}

export default function DashboardClient() {
  const [total, setTotal] = useState<number | null>(null);
  const [recent, setRecent] = useState<AuditEvent[]>([]);
  const [allEvents, setAllEvents] = useState<AuditEvent[]>([]);
  const [typeCounts, setTypeCounts] = useState<{ name: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
    try {
      const t = await fetchTotalEvents();
      setTotal(t);
      if (t > 0) {
        const page = await fetchEventPage(0, Math.min(t, 500));
        setAllEvents(page);
        setRecent([...page].slice(-10).reverse());
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

  if (loading)
    return (
      <div>
        <ProgressBar />
        <div style={{ marginTop: 16 }}>
          <SkeletonStats />
          <div className="grid-2 mb-6">
            <div className="skeleton-card" style={{ height: 260 }} />
            <div className="skeleton-card" style={{ height: 260 }} />
          </div>
          <SkeletonTable rows={5} cols={5} />
        </div>
      </div>
    );
  if (error)
    return (
      <p role="alert" style={{ color: "var(--error)" }}>
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
            {recent[0]
              ? new Date(recent[0].timestamp * 1000).toLocaleTimeString()
              : "—"}
          </p>
        </div>
        <div className="card">
          <p className="text-muted text-sm">Last Refreshed</p>
          <p className="stat-value" style={{ fontSize: 14 }}>
            {lastUpdated?.toLocaleTimeString() ?? "—"}
          </p>
        </div>
      </div>

      {/* Date range filter */}
      <div className="card mb-6">
        <div className="flex-between mb-4">
          <p style={{ fontWeight: 600 }}>Charts</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label className="text-muted text-sm">From</label>
            <input
              type="datetime-local"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ width: 200 }}
            />
            <label className="text-muted text-sm">To</label>
            <input
              type="datetime-local"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ width: 200 }}
            />
            {(dateFrom || dateTo) && (
              <button
                className="secondary"
                onClick={() => { setDateFrom(""); setDateTo(""); }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid-2 mb-6">
        {/* Time series chart */}
        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 12 }}>Events Over Time</p>
          {timeSeries.length === 0 ? (
            <p className="text-muted">No events in range.</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={timeSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="time" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "var(--chart-tooltip-bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--text)",
                  }}
                />
                <Line type="monotone" dataKey="count" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Event distribution chart */}
        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 12 }}>Events by Type</p>
          {typeCounts.length === 0 ? (
            <p className="text-muted">No typed events yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={typeCounts}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={85}
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                >
                  {typeCounts.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--chart-tooltip-bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--text)",
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid-2 mb-6">
        {/* Event volume bar chart */}
        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 12 }}>Event Volume by Type</p>
          {typeCounts.length === 0 ? (
            <p className="text-muted">No typed events yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={typeCounts} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis type="number" stroke="var(--text-muted)" />
                <YAxis type="category" dataKey="name" width={80} stroke="var(--text-muted)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--chart-tooltip-bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--text)",
                  }}
                />
                <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Submitter activity chart */}
        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 12 }}>Top Submitters</p>
          {submitterData.length === 0 ? (
            <p className="text-muted">No events yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={submitterData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="submitter" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                <YAxis stroke="var(--text-muted)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--chart-tooltip-bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--text)",
                  }}
                />
                <Bar dataKey="count" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent events */}
      <div className="card">
        <div className="flex-between mb-4">
          <p style={{ fontWeight: 600 }}>Recent Events</p>
          <button className="secondary" onClick={load} aria-label="Refresh recent events">
            Refresh
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="text-muted">No events logged yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table aria-label="Recent audit events">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Type</th>
                  <th scope="col">Submitter</th>
                  <th scope="col">Timestamp</th>
                  <th scope="col">Metadata (hex)</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((evt) => (
                  <tr key={evt.index}>
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
          </div>
        )}
      </div>
    </div>
  );
}
