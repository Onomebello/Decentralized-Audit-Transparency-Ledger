import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";

import { resolvers } from "../graphql/src/resolvers";
import {
  PaginationSchema,
  EventFilterSchema,
  IndexParamSchema,
  EventTypeParamSchema,
} from "./validation";
import { validateQuery, validateParams, errorHandler } from "./middleware/validation";
import {
  cacheMiddleware,
  cacheStatsHandler,
  cacheInvalidationHandler,
} from "./middleware/cache";

const app = express();
const port = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());
app.use(cacheMiddleware);

// Swagger UI
try {
  const swaggerUi = require("swagger-ui-express");
  const specPath = path.resolve(__dirname, "../../openapi.yaml");
  const spec = yaml.load(fs.readFileSync(specPath, "utf8"));
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(spec as any));
} catch {
  // swagger-ui-express not installed; skip
}

// GET /events - List all events with pagination
app.get(
  "/events",
  validateQuery(PaginationSchema.extend({ filter: EventFilterSchema })),
  (req: any, res) => {
    const { limit, offset, filter } = req.query;

    const result = resolvers.Query.events(null, { limit, offset, filter }, null);
    res.json({ data: result, total: result.length });
  }
);

// GET /events/:index - Get event by index
app.get(
  "/events/:index",
  validateParams(IndexParamSchema),
  (req: any, res) => {
    const { index } = req.params;
    const result = resolvers.Query.event(null, { index }, null);

    if (!result) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: `Event with index ${index} not found`,
        },
      });
    }
    res.json({ data: result });
  }
);

// GET /events/type/:type - Get events by type with pagination
app.get(
  "/events/type/:type",
  validateParams(EventTypeParamSchema),
  validateQuery(PaginationSchema),
  (req: any, res) => {
    const { type } = req.params;
    const { limit, offset } = req.query;

    const allByType = Array.from({ length: 1000 }, (_, i) => i).map((typeIndex) =>
      resolvers.Query.eventByType(null, { type, typeIndex }, null)
    ).filter(Boolean);

    const result = allByType.slice(offset, offset + limit);
    res.json({ data: result, total: allByType.length });
  }
);

// GET /stats - Get statistics
app.get("/stats", (_req, res) => {
  const result = resolvers.Query.statistics(null, {}, null);
  res.json({ data: result });
});

// GET /cache/stats - Cache statistics
app.get("/cache/stats", cacheStatsHandler);

// POST /cache/invalidate - Invalidate cache
app.post("/cache/invalidate", cacheInvalidationHandler);

// Global error handler
app.use(errorHandler);

app.listen(port, () => {
  console.log(`REST API listening on port ${port}`);
  console.log(`API docs at http://localhost:${port}/api-docs`);
});
