import express from "express";
import cors from "cors";

// Import resolvers from GraphQL service
import { resolvers } from "../graphql/src/resolvers";

const app = express();
const port = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

interface FilterParams {
  type?: string;
  submitter?: string;
  metadata?: string;
  startTime?: number;
  endTime?: number;
  sort?: "index" | "timestamp" | "event_type" | "submitter";
  order?: "asc" | "desc";
}

function parseFilterParams(query: Record<string, unknown>): {
  filter: FilterParams | null;
  errors: string[];
} {
  const errors: string[] = [];
  const filter: FilterParams = {};

  if (query.type !== undefined) {
    const type = String(query.type).trim();
    if (type.length === 0) errors.push("type cannot be empty");
    else if (type.length > 128) errors.push("type exceeds max length of 128");
    else filter.type = type;
  }

  if (query.submitter !== undefined) {
    const submitter = String(query.submitter).trim();
    if (submitter.length === 0) errors.push("submitter cannot be empty");
    else if (submitter.length > 128) errors.push("submitter exceeds max length of 128");
    else filter.submitter = submitter;
  }

  if (query.metadata !== undefined) {
    const metadata = String(query.metadata).trim();
    if (metadata.length === 0) errors.push("metadata cannot be empty");
    else if (metadata.length > 256) errors.push("metadata exceeds max length of 256");
    else filter.metadata = metadata;
  }

  if (query.startTime !== undefined) {
    const ts = Number(query.startTime);
    if (Number.isNaN(ts) || ts < 0) errors.push("startTime must be a non-negative integer (unix seconds)");
    else filter.startTime = Math.floor(ts);
  }

  if (query.endTime !== undefined) {
    const ts = Number(query.endTime);
    if (Number.isNaN(ts) || ts < 0) errors.push("endTime must be a non-negative integer (unix seconds)");
    else filter.endTime = Math.floor(ts);
  }

  if (filter.startTime !== undefined && filter.endTime !== undefined && filter.startTime > filter.endTime) {
    errors.push("startTime must be <= endTime");
  }

  const VALID_SORT_FIELDS = new Set(["index", "timestamp", "event_type", "submitter"]);
  if (query.sort !== undefined) {
    const sort = String(query.sort);
    if (!VALID_SORT_FIELDS.has(sort)) errors.push(`sort must be one of: ${[...VALID_SORT_FIELDS].join(", ")}`);
    else filter.sort = sort as FilterParams["sort"];
  }

  const VALID_ORDERS = new Set(["asc", "desc"]);
  if (query.order !== undefined) {
    const order = String(query.order).toLowerCase();
    if (!VALID_ORDERS.has(order)) errors.push("order must be 'asc' or 'desc'");
    else filter.order = order as FilterParams["order"];
  }

  if (errors.length > 0) return { filter: null, errors };
  return { filter: Object.keys(filter).length > 0 ? filter : null, errors: [] };
}

function applyServerSideFilter(
  events: any[],
  filter: FilterParams | null
): any[] {
  if (!filter) return events;

  let result = events;

  if (filter.type) {
    const needle = filter.type.toLowerCase();
    result = result.filter((e) => e.event_type.toLowerCase().includes(needle));
  }
  if (filter.submitter) {
    const needle = filter.submitter.toLowerCase();
    result = result.filter((e) => e.submitter.toLowerCase().includes(needle));
  }
  if (filter.metadata) {
    const needle = filter.metadata.toLowerCase();
    result = result.filter((e) => e.metadata.toLowerCase().includes(needle));
  }
  if (filter.startTime !== undefined) {
    result = result.filter((e) => e.timestamp >= filter.startTime!);
  }
  if (filter.endTime !== undefined) {
    result = result.filter((e) => e.timestamp <= filter.endTime!);
  }

  return result;
}

function sortEvents(
  events: any[],
  sortKey: string | undefined,
  order: string | undefined
): any[] {
  if (!sortKey) return events;

  const ascending = order !== "desc";
  return [...events].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return ascending ? cmp : -cmp;
  });
}

// GET /events - List events with pagination and filtering
app.get("/events", (req, res) => {
  const limitRaw = parseInt(req.query.limit as string);
  const offsetRaw = parseInt(req.query.offset as string);

  if (!isNaN(limitRaw) && (limitRaw < 1 || limitRaw > 1000)) {
    return res.status(400).json({ error: "limit must be between 1 and 1000" });
  }
  if (!isNaN(offsetRaw) && offsetRaw < 0) {
    return res.status(400).json({ error: "offset must be non-negative" });
  }

  const limit = Math.min(limitRaw || 50, 1000);
  const offset = offsetRaw || 0;

  const { filter, errors } = parseFilterParams(req.query as Record<string, unknown>);
  if (errors.length > 0) {
    return res.status(400).json({ error: "Invalid filter parameters", details: errors });
  }

  const allEvents = resolvers.Query.events(null, { limit: 10000, offset: 0, filter: null }, null);
  const filtered = applyServerSideFilter(allEvents, filter);
  const sorted = sortEvents(filtered, filter?.sort, filter?.order);
  const total = sorted.length;
  const page = sorted.slice(offset, offset + limit);

  res.json({ data: page, total, limit, offset });
});

// GET /events/:index - Get event by index
app.get("/events/:index", (req, res) => {
  const index = parseInt(req.params.index);
  if (isNaN(index) || index < 0) {
    return res.status(400).json({ error: "index must be a non-negative integer" });
  }

  const result = resolvers.Query.event(null, { index }, null);

  if (!result) {
    return res.status(404).json({ error: "Event not found" });
  }
  res.json({ data: result });
});

// GET /events/type/:type - Get events by type with pagination and filtering
app.get("/events/type/:type", (req, res) => {
  const type = req.params.type;
  if (!type || type.length > 128) {
    return res.status(400).json({ error: "type is required and must be <= 128 characters" });
  }

  const limitRaw = parseInt(req.query.limit as string);
  const offsetRaw = parseInt(req.query.offset as string);

  if (!isNaN(limitRaw) && (limitRaw < 1 || limitRaw > 1000)) {
    return res.status(400).json({ error: "limit must be between 1 and 1000" });
  }
  if (!isNaN(offsetRaw) && offsetRaw < 0) {
    return res.status(400).json({ error: "offset must be non-negative" });
  }

  const limit = Math.min(limitRaw || 50, 1000);
  const offset = offsetRaw || 0;

  const allByType = Array.from({ length: 10000 }, (_, i) => i).map((typeIndex) =>
    resolvers.Query.eventByType(null, { type, typeIndex }, null)
  ).filter(Boolean);

  const total = allByType.length;
  const result = allByType.slice(offset, offset + limit);
  res.json({ data: result, total, limit, offset });
});

// GET /events/search - Search events by multiple criteria
app.get("/events/search", (req, res) => {
  const { filter, errors } = parseFilterParams(req.query as Record<string, unknown>);
  if (errors.length > 0) {
    return res.status(400).json({ error: "Invalid search parameters", details: errors });
  }

  const limitRaw = parseInt(req.query.limit as string);
  const offsetRaw = parseInt(req.query.offset as string);
  const limit = Math.min(limitRaw || 50, 1000);
  const offset = offsetRaw || 0;

  const allEvents = resolvers.Query.events(null, { limit: 10000, offset: 0, filter: null }, null);
  const filtered = applyServerSideFilter(allEvents, filter);
  const sorted = sortEvents(filtered, filter?.sort, filter?.order);
  const total = sorted.length;
  const page = sorted.slice(offset, offset + limit);

  res.json({ data: page, total, limit, offset });
});

// GET /stats - Get statistics
app.get("/stats", (req, res) => {
  const result = resolvers.Query.statistics(null, {}, null);
  res.json({ data: result });
});

// GET /health - Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Math.floor(Date.now() / 1000) });
});

app.listen(port, () => {
  console.log(`REST API listening on port ${port}`);
});
