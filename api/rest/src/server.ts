import express from "express";
import cors from "cors";

// Import resolvers from GraphQL service
import { resolvers } from "../graphql/src/resolvers";
import { authMiddleware, rateLimitMiddleware } from "./middleware";
import { generateKey, rotateKey, revokeKey, listKeys } from "./keys";

const app = express();
const port = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());
app.use(rateLimitMiddleware);

// ── Public read endpoints ─────────────────────────────────────────────────────

// GET /events - List all events with pagination
app.get("/events", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 1000);
  const offset = parseInt(req.query.offset as string) || 0;
  const filter = req.query.filter ? JSON.parse(req.query.filter as string) : null;

  const result = resolvers.Query.events(null, { limit, offset, filter }, null);
  res.json({ data: result, total: result.length });
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

// GET /events/type/:type - Get events by type with pagination
app.get("/events/type/:type", (req, res) => {
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
app.get("/stats", (req, res) => {
  const result = resolvers.Query.statistics(null, {}, null);
  res.json({ data: result });
});

// ── Key management endpoints (admin-protected) ────────────────────────────────

const ADMIN_KEY = process.env.ADMIN_KEY ?? process.env.API_KEY ?? "";

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const key = (req.headers["x-api-key"] as string)
    ?? req.headers["authorization"]?.replace("Bearer ", "");
  if (!key || key !== ADMIN_KEY) {
    res.status(403).json({ error: "Forbidden: admin key required" });
    return;
  }
  next();
}

app.get("/keys", requireAdmin, (_req, res) => {
  res.json({ data: listKeys() });
});

app.post("/keys", requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "name is required" });
  }
  const record = generateKey(name);
  res.status(201).json({ data: record });
});

app.post("/keys/rotate", requireAdmin, (req, res) => {
  const { key } = req.body;
  if (!key || typeof key !== "string") {
    return res.status(400).json({ error: "key is required" });
  }
  const newRecord = rotateKey(key);
  if (!newRecord) {
    return res.status(404).json({ error: "Key not found or already inactive" });
  }
  res.json({ data: newRecord });
});

app.delete("/keys/:key", requireAdmin, (req, res) => {
  const revoked = revokeKey(req.params.key);
  if (!revoked) {
    return res.status(404).json({ error: "Key not found" });
  }
  res.json({ data: { revoked: true } });
});

app.listen(port, () => {
  console.log(`REST API listening on port ${port}`);
});
