import http from "http";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import express from "express";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/dist/use/ws";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { typeDefs } from "./schema";
import { resolvers } from "./resolvers";

const PORT = parseInt(process.env.PORT ?? "4000", 10);
const API_KEY = process.env.API_KEY ?? "dev-key";

const schema = makeExecutableSchema({ typeDefs, resolvers });

async function main() {
  const app = express();
  app.use(express.json());

  const httpServer = http.createServer(app);

  // WebSocket server for subscriptions
  const wsServer = new WebSocketServer({ server: httpServer, path: "/graphql" });
  const cleanup = useServer({ schema }, wsServer);

  const apollo = new ApolloServer({
    schema,
    plugins: [
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await cleanup.dispose();
            },
          };
        },
      },
    ],
  });

  await apollo.start();

  app.use(
    "/graphql",
    expressMiddleware(apollo, {
      context: async ({ req }) => ({
        apiKey: req.headers["x-api-key"] ?? req.headers["authorization"]?.replace("Bearer ", ""),
      }),
    })
  );

  // Health check endpoints (#268)
  const graphqlStartTime = Date.now();

  app.get("/healthz", (_req, res) => {
    res.json({
      status: "ok",
      service: "graphql",
      uptime: Math.floor((Date.now() - graphqlStartTime) / 1000),
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/readyz", (_req, res) => {
    const checks: Record<string, { status: string; latencyMs?: number }> = {};

    const schemaCheckStart = Date.now();
    try {
      const op = { kind: "query" as const, name: { kind: "Name" as const, value: "__typename" } };
      checks.schema = { status: "ok", latencyMs: Date.now() - schemaCheckStart };
    } catch {
      checks.schema = { status: "failed", latencyMs: Date.now() - schemaCheckStart };
    }

    const allHealthy = Object.values(checks).every((c) => c.status === "ok");
    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? "ready" : "not_ready",
      service: "graphql",
      checks,
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "graphql",
      uptime: Math.floor((Date.now() - graphqlStartTime) / 1000),
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/metrics", (_req, res) => {
    const lines = [
      "# HELP graphql_uptime_seconds GraphQL service uptime",
      "# TYPE graphql_uptime_seconds gauge",
      `graphql_uptime_seconds ${Math.floor((Date.now() - graphqlStartTime) / 1000)}`,
    ];
    res.setHeader("Content-Type", "text/plain; version=0.0.4");
    res.send(lines.join("\n"));
  });

  await new Promise<void>((resolve) => httpServer.listen(PORT, resolve));
  console.log(`🚀 GraphQL ready at http://localhost:${PORT}/graphql`);
  console.log(`🔌 Subscriptions via ws://localhost:${PORT}/graphql`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
