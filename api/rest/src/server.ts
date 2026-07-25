import express from "express";
import cors from "cors";

import { resolvers } from "../graphql/src/resolvers";
import { rateLimiter } from "./rateLimiter";
import {
  encodeCursor,
  decodeCursor,
  setPaginationHeaders,
  MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
} from "./pagination";

const app = express();
const port = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());
app.use(rateLimiter);

function parseLimit(raw: string | undefined): number {
  const n = parseInt(raw || "") || DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(1, n), MAX_PAGE_SIZE);
}

// GET /events - Cursor-based pagination
app.get("/events", (req, res) => {
  const limit = parseLimit(req.query.limit as string);
  const filter = req.query.filter ? JSON.parse(req.query.filter as string) : null;

  let offset = 0;
  if (req.query.cursor) {
    const decoded = decodeCursor(req.query.cursor as string);
    if (!decoded) {
      return res.status(400).json({ error: "Invalid cursor" });
    }
    offset = decoded.index;
  }

  const allFiltered = resolvers.Query.events(null, { limit: 100000, offset: 0, filter }, null);
  const total = allFiltered.length;
  const result = allFiltered.slice(offset, offset + limit);

  const nextCursor = offset + limit < total ? encodeCursor(offset + limit) : null;
  const prevCursor = offset > 0 ? encodeCursor(Math.max(0, offset - limit)) : null;

  setPaginationHeaders(res, "/events", total, limit, offset, nextCursor, prevCursor);
  res.json({ data: result });
});

// GET /events/:index - Get event by index
app.get("/events/:index", (req, res) => {
  const index = parseInt(req.params.index);
  const result = resolvers.Query.event(null, { index }, null);

  if (!result) {
    return res.status(404).json({ error: "Event not found" });
  }
  res.json({ data: result });
});

// GET /events/type/:type - Events by type with cursor pagination
app.get("/events/type/:type", (req, res) => {
  const type = req.params.type;
  const limit = parseLimit(req.query.limit as string);

  let offset = 0;
  if (req.query.cursor) {
    const decoded = decodeCursor(req.query.cursor as string);
    if (!decoded) {
      return res.status(400).json({ error: "Invalid cursor" });
    }
    offset = decoded.index;
  }

  const allByType = Array.from({ length: 1000 }, (_, i) => i)
    .map((typeIndex) => resolvers.Query.eventByType(null, { type, typeIndex }, null))
    .filter(Boolean);

  const total = allByType.length;
  const result = allByType.slice(offset, offset + limit);

  const nextCursor = offset + limit < total ? encodeCursor(offset + limit) : null;
  const prevCursor = offset > 0 ? encodeCursor(Math.max(0, offset - limit)) : null;

  setPaginationHeaders(res, `/events/type/${type}`, total, limit, offset, nextCursor, prevCursor);
  res.json({ data: result });
});

// GET /stats - Get statistics
app.get("/stats", (req, res) => {
  const result = resolvers.Query.statistics(null, {}, null);
  res.json({ data: result });
});

app.listen(port, () => {
  console.log(`REST API listening on port ${port}`);
});
