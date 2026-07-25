import http from "http";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { useServer } from "graphql-ws/dist/use/ws";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { typeDefs } from "./schema";
import { resolvers } from "./resolvers";

const PORT = parseInt(process.env.PORT ?? "4000", 10);
const API_KEY = process.env.API_KEY ?? "dev-key";
const MAX_WS_CONNECTIONS = parseInt(process.env.MAX_WS_CONNECTIONS ?? "100", 10);

const schema = makeExecutableSchema({ typeDefs, resolvers });

const activeConnections = new Set<WebSocket>();

async function main() {
  const app = express();
  app.use(express.json());

  const httpServer = http.createServer(app);

  const wsServer = new WebSocketServer({ server: httpServer, path: "/graphql" });

  wsServer.on("connection", (ws) => {
    if (activeConnections.size >= MAX_WS_CONNECTIONS) {
      ws.close(1013, "Too many connections");
      return;
    }
    activeConnections.add(ws);
    ws.on("close", () => activeConnections.delete(ws));
  });

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

  // Health check with connection count
  app.get("/health", (_req, res) => res.json({ status: "ok", connections: activeConnections.size }));

  // Keepalive ping every 30s
  const pingInterval = setInterval(() => {
    wsServer.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    });
  }, 30000);

  wsServer.on("close", () => clearInterval(pingInterval));

  await new Promise<void>((resolve) => httpServer.listen(PORT, resolve));
  console.log(`GraphQL ready at http://localhost:${PORT}/graphql`);
  console.log(`Subscriptions via ws://localhost:${PORT}/graphql`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
