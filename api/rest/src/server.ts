import express from "express";
import cors from "cors";

// Import resolvers from GraphQL service
import { resolvers } from "../graphql/src/resolvers";
import { exportCsv, exportJson, createStreamingExporter, ExportOptions } from "./export";

const app = express();
const port = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

// ── Health Check Endpoints (#268) ─────────────────────────────────────────────

const startTime = Date.now();

app.get("/healthz", (_req, res) => {
  res.json({
    status: "ok",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  });
});

app.get("/readyz", (_req, res) => {
  const checks: Record<string, { status: string; latencyMs?: number }> = {};

  const storeCheckStart = Date.now();
  try {
    resolvers.Query.statistics(null, {}, null);
    checks.eventStore = { status: "ok", latencyMs: Date.now() - storeCheckStart };
  } catch {
    checks.eventStore = { status: "failed", latencyMs: Date.now() - storeCheckStart };
  }

  const allHealthy = Object.values(checks).every((c) => c.status === "ok");
  const statusCode = allHealthy ? 200 : 503;

  res.status(statusCode).json({
    status: allHealthy ? "ready" : "not_ready",
    checks,
    timestamp: new Date().toISOString(),
  });
});

app.get("/metrics", (_req, res) => {
  const stats = resolvers.Query.statistics(null, {}, null) as Record<string, unknown>;
  const byType = (stats.eventsByType as Record<string, number>) ?? {};
  const lines = [
    "# HELP audit_ledger_events_total Total number of audit events",
    "# TYPE audit_ledger_events_total counter",
    `audit_ledger_events_total ${stats.totalEvents ?? 0}`,
    "",
    "# HELP audit_ledger_events_by_type Events count by type",
    "# TYPE audit_ledger_events_by_type gauge",
    ...Object.entries(byType).map(([t, c]) => `audit_ledger_events_by_type{event_type="${t}"} ${c}`),
    "",
    "# HELP audit_ledger_uptime_seconds API uptime in seconds",
    "# TYPE audit_ledger_uptime_seconds gauge",
    `audit_ledger_uptime_seconds ${Math.floor((Date.now() - startTime) / 1000)}`,
  ];
  res.setHeader("Content-Type", "text/plain; version=0.0.4");
  res.send(lines.join("\n"));
});

// ── Version Middleware (#271) ─────────────────────────────────────────────────

const SUPPORTED_VERSIONS = ["v1"];
const DEPRECATED_VERSIONS: Record<string, string> = {};
const LATEST_VERSION = "v1";

app.use((req, res, next) => {
  res.setHeader("X-API-Version", LATEST_VERSION);
  res.setHeader("X-Supported-Versions", SUPPORTED_VERSIONS.join(", "));

  const versionHeader = req.headers["accept-version"] as string | undefined;
  const urlMatch = req.path.match(/^\/(v\d+)\//);

  let requestedVersion = versionHeader ?? urlMatch?.[1] ?? LATEST_VERSION;

  if (DEPRECATED_VERSIONS[requestedVersion]) {
    res.setHeader("Deprecation", "true");
    res.setHeader("Sunset", DEPRECATED_VERSIONS[requestedVersion]);
    res.setHeader("X-Deprecation-Notice", `API version ${requestedVersion} is deprecated. Use ${LATEST_VERSION}.`);
  }

  (req as express.Request & { apiVersion?: string }).apiVersion = requestedVersion;
  next();
});

// ── Versioned Routes (#271) ───────────────────────────────────────────────────

const v1 = express.Router();

// GET /events - List all events with pagination
v1.get("/events", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 1000);
  const offset = parseInt(req.query.offset as string) || 0;
  const filter = req.query.filter ? JSON.parse(req.query.filter as string) : null;

  const result = resolvers.Query.events(null, { limit, offset, filter }, null);
  res.json({ data: result, total: result.length });
});

// GET /events/:index - Get event by index
v1.get("/events/:index", (req, res) => {
  const index = parseInt(req.params.index);
  const result = resolvers.Query.event(null, { index }, null);

  if (!result) {
    return res.status(404).json({ error: "Event not found" });
  }
  res.json({ data: result });
});

// GET /events/type/:type - Get events by type with pagination
v1.get("/events/type/:type", (req, res) => {
  const type = req.params.type;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 1000);
  const offset = parseInt(req.query.offset as string) || 0;

  const allByType = Array.from({ length: 1000 }, (_, i) => i).map((typeIndex) =>
    resolvers.Query.eventByType(null, { type, typeIndex }, null)
  ).filter(Boolean);

  const result = allByType.slice(offset, offset + limit);
  res.json({ data: result, total: allByType.length });
});

// GET /stats - Get statistics
v1.get("/stats", (_req, res) => {
  const result = resolvers.Query.statistics(null, {}, null);
  res.json({ data: result });
});

// ── Export Endpoints (#273) ───────────────────────────────────────────────────

// GET /export/events.json - JSON export
v1.get("/export/events.json", (req, res) => {
  const options: ExportOptions = {
    format: "json",
    limit: parseInt(req.query.limit as string) || undefined,
    offset: parseInt(req.query.offset as string) || undefined,
    fields: req.query.fields ? (req.query.fields as string).split(",") : undefined,
  };

  if (req.query.filter) {
    options.filter = JSON.parse(req.query.filter as string);
  }

  const result = exportJson(options);
  res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
  res.setHeader("Content-Type", result.contentType);
  res.json(JSON.parse(result.data));
});

// GET /export/events.csv - CSV export
v1.get("/export/events.csv", (req, res) => {
  const options: ExportOptions = {
    format: "csv",
    limit: parseInt(req.query.limit as string) || undefined,
    offset: parseInt(req.query.offset as string) || undefined,
    fields: req.query.fields ? (req.query.fields as string).split(",") : undefined,
  };

  if (req.query.filter) {
    options.filter = JSON.parse(req.query.filter as string);
  }

  const result = exportCsv(options);
  res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
  res.setHeader("Content-Type", result.contentType);
  res.send(result.data);
});

// GET /export/events/stream - Streaming JSON export (#273 streaming)
v1.get("/export/events/stream", async (req, res) => {
  const options: ExportOptions = {
    format: "json",
    limit: parseInt(req.query.limit as string) || undefined,
    offset: parseInt(req.query.offset as string) || undefined,
    fields: req.query.fields ? (req.query.fields as string).split(",") : undefined,
    stream: true,
  };

  if (req.query.filter) {
    options.filter = JSON.parse(req.query.filter as string);
  }

  const exporter = createStreamingExporter(options);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("X-Export-Status", "running");

  try {
    for await (const chunk of exporter.generate()) {
      res.write(chunk);
    }
    res.setHeader("X-Export-Status", "completed");
    res.end();
  } catch (err) {
    res.setHeader("X-Export-Status", "failed");
    res.setHeader("X-Export-Error", err instanceof Error ? err.message : String(err));
    res.end();
  }
});

// GET /export/progress - Export progress check (#273 progress)
v1.get("/export/progress", (_req, res) => {
  res.json({
    status: "idle",
    message: "Use export endpoints to start an export. Progress is tracked via X-Export-Status header for streaming exports.",
  });
});

app.use("/v1", v1);

// Legacy unversioned routes (redirect to v1)
app.get("/events", (req, res) => {
  res.redirect(301, `/v1/events${req.url.includes("?") ? "?" + req.url.split("?")[1] : ""}`);
});
app.get("/events/:index", (req, res) => {
  res.redirect(301, `/v1/events/${req.params.index}`);
});
app.get("/events/type/:type", (req, res) => {
  res.redirect(301, `/v1/events/type/${req.params.type}${req.url.includes("?") ? "?" + req.url.split("?")[1] : ""}`);
});
app.get("/stats", (_req, res) => {
  res.redirect(301, "/v1/stats");
});

app.listen(port, () => {
  console.log(`REST API listening on port ${port}`);
  console.log(`  Versioned: /v1/*`);
  console.log(`  Legacy:    /events, /stats (301 → /v1/...)`);
  console.log(`  Health:    /healthz, /readyz, /metrics`);
  console.log(`  Export:    /v1/export/events.{json,csv}, /v1/export/events/stream`);
});
