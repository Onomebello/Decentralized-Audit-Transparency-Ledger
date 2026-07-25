import { afterEach, describe, expect, it } from "vitest";
import { createClient, makeServer, type Sink } from "graphql-ws";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { typeDefs } from "../src/schema";
import { publishEventLogged, resetEvents, resolvers } from "../src/resolvers";

const schema = makeExecutableSchema({ typeDefs, resolvers });
const server = makeServer({ schema });

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class InMemoryWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = InMemoryWebSocket.CONNECTING;
  protocol: string;
  onopen: null | (() => void) = null;
  onmessage: null | ((event: { data: string }) => void) = null;
  onclose: null | ((event: { code?: number; reason?: string; wasClean: boolean }) => void) = null;
  onerror: null | ((event: unknown) => void) = null;

  private serverReceive?: (data: string) => Promise<void>;
  private serverClose?: (code?: number, reason?: string) => Promise<void>;
  private closedEmitted = false;

  constructor(_url: string, protocols?: string | string[]) {
    this.protocol = Array.isArray(protocols) ? protocols[0] ?? "graphql-transport-ws" : protocols ?? "graphql-transport-ws";

    const socket = {
      protocol: this.protocol,
      send: (data: string) => {
        queueMicrotask(() => {
          this.onmessage?.({ data });
        });
      },
      close: async (code?: number, reason?: string) => {
        await this.closeFromServer(code, reason);
      },
      onMessage: (cb: (data: string) => Promise<void>) => {
        this.serverReceive = cb;
      },
    };

    this.serverClose = server.opened(socket, undefined);
    this.readyState = InMemoryWebSocket.OPEN;
    queueMicrotask(() => this.onopen?.());
  }

  send(data: string) {
    if (this.readyState !== InMemoryWebSocket.OPEN) {
      return Promise.reject(new Error("WebSocket is not open"));
    }
    return this.serverReceive?.(data);
  }

  async close(code?: number, reason?: string) {
    if (this.closedEmitted || this.readyState === InMemoryWebSocket.CLOSED || this.readyState === InMemoryWebSocket.CLOSING) {
      return;
    }
    this.readyState = InMemoryWebSocket.CLOSING;
    await this.serverClose?.(code, reason);
    if (this.closedEmitted) {
      return;
    }
    this.readyState = InMemoryWebSocket.CLOSED;
    this.closedEmitted = true;
    queueMicrotask(() => {
      this.onclose?.({ code, reason, wasClean: true });
    });
  }

  async closeFromServer(code?: number, reason?: string) {
    if (this.closedEmitted) {
      return;
    }
    this.readyState = InMemoryWebSocket.CLOSED;
    this.closedEmitted = true;
    queueMicrotask(() => {
      this.onclose?.({ code, reason, wasClean: true });
    });
  }
}

describe("eventLogged subscription", () => {
  afterEach(() => {
    resetEvents();
  });

  it("receives published events and filters by type", async () => {
    const received: Array<{ event_type: string; metadata: string }> = [];
    const client = createClient({
      url: "ws://in-memory/graphql",
      webSocketImpl: InMemoryWebSocket as never,
    });

    try {
      const done = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("subscription timed out")), 2000);

        client.subscribe(
          {
            query: `
              subscription($type: String) {
                eventLogged(type: $type) {
                  id
                  event_type
                  submitter
                  metadata
                }
              }
            `,
            variables: { type: "payment" },
          },
          {
            next: (result) => {
              const payload = result.data?.eventLogged;
              if (!payload) return;
              received.push({
                event_type: payload.event_type,
                metadata: payload.metadata,
              });
              if (payload.event_type === "payment") {
                clearTimeout(timeout);
                resolve();
              }
            },
            error: (err) => {
              clearTimeout(timeout);
              reject(err);
            },
            complete: () => undefined,
          } satisfies Sink
        );
      });

      await delay(25);

      await publishEventLogged({
        id: "0",
        index: 0,
        timestamp: Math.floor(Date.now() / 1000),
        event_type: "audit",
        submitter: "GAAAA",
        metadata: "ignored",
        event_hash: "1".repeat(64),
        prev_hash: "0".repeat(64),
      });

      await publishEventLogged({
        id: "1",
        index: 1,
        timestamp: Math.floor(Date.now() / 1000),
        event_type: "payment",
        submitter: "GBBBB",
        metadata: "delivered",
        event_hash: "2".repeat(64),
        prev_hash: "1".repeat(64),
      });

      await done;

      expect(received).toEqual([
        {
          event_type: "payment",
          metadata: "delivered",
        },
      ]);
    } finally {
      client.dispose();
    }
  });

  it("filters by submitter", async () => {
    const received: Array<{ event_type: string; submitter: string }> = [];
    const client = createClient({
      url: "ws://in-memory/graphql",
      webSocketImpl: InMemoryWebSocket as never,
    });

    try {
      const done = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("subscription timed out")), 2000);

        client.subscribe(
          {
            query: `
              subscription($submitter: String) {
                eventLogged(submitter: $submitter) {
                  id
                  event_type
                  submitter
                }
              }
            `,
            variables: { submitter: "GCCCC" },
          },
          {
            next: (result) => {
              const payload = result.data?.eventLogged;
              if (!payload) return;
              received.push({
                event_type: payload.event_type,
                submitter: payload.submitter,
              });
              clearTimeout(timeout);
              resolve();
            },
            error: (err) => {
              clearTimeout(timeout);
              reject(err);
            },
            complete: () => undefined,
          } satisfies Sink
        );
      });

      await delay(25);

      await publishEventLogged({
        id: "10",
        index: 10,
        timestamp: Math.floor(Date.now() / 1000),
        event_type: "audit",
        submitter: "GAAAA",
        metadata: "wrong submitter",
        event_hash: "a".repeat(64),
        prev_hash: "0".repeat(64),
      });

      await publishEventLogged({
        id: "11",
        index: 11,
        timestamp: Math.floor(Date.now() / 1000),
        event_type: "payment",
        submitter: "GCCCC",
        metadata: "correct submitter",
        event_hash: "b".repeat(64),
        prev_hash: "a".repeat(64),
      });

      await done;

      expect(received).toEqual([
        {
          event_type: "payment",
          submitter: "GCCCC",
        },
      ]);
    } finally {
      client.dispose();
    }
  });

  it("filters by time range", async () => {
    const received: Array<{ event_type: string; timestamp: number }> = [];
    const now = Math.floor(Date.now() / 1000);

    const client = createClient({
      url: "ws://in-memory/graphql",
      webSocketImpl: InMemoryWebSocket as never,
    });

    try {
      const done = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("subscription timed out")), 2000);

        client.subscribe(
          {
            query: `
              subscription($startTime: Int, $endTime: Int) {
                eventLogged(startTime: $startTime, endTime: $endTime) {
                  id
                  event_type
                  timestamp
                }
              }
            `,
            variables: { startTime: now - 10, endTime: now + 10 },
          },
          {
            next: (result) => {
              const payload = result.data?.eventLogged;
              if (!payload) return;
              received.push({
                event_type: payload.event_type,
                timestamp: payload.timestamp,
              });
              clearTimeout(timeout);
              resolve();
            },
            error: (err) => {
              clearTimeout(timeout);
              reject(err);
            },
            complete: () => undefined,
          } satisfies Sink
        );
      });

      await delay(25);

      await publishEventLogged({
        id: "20",
        index: 20,
        timestamp: now - 100,
        event_type: "old_event",
        submitter: "GAAAA",
        metadata: "too old",
        event_hash: "c".repeat(64),
        prev_hash: "0".repeat(64),
      });

      await publishEventLogged({
        id: "21",
        index: 21,
        timestamp: now,
        event_type: "recent_event",
        submitter: "GBBBB",
        metadata: "in range",
        event_hash: "d".repeat(64),
        prev_hash: "c".repeat(64),
      });

      await done;

      expect(received).toEqual([
        {
          event_type: "recent_event",
          timestamp: now,
        },
      ]);
    } finally {
      client.dispose();
    }
  });

  it("filters by combined type and submitter", async () => {
    const received: Array<{ event_type: string; submitter: string }> = [];
    const client = createClient({
      url: "ws://in-memory/graphql",
      webSocketImpl: InMemoryWebSocket as never,
    });

    try {
      const done = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("subscription timed out")), 2000);

        client.subscribe(
          {
            query: `
              subscription($type: String, $submitter: String) {
                eventLogged(type: $type, submitter: $submitter) {
                  id
                  event_type
                  submitter
                }
              }
            `,
            variables: { type: "payment", submitter: "GDDDD" },
          },
          {
            next: (result) => {
              const payload = result.data?.eventLogged;
              if (!payload) return;
              received.push({
                event_type: payload.event_type,
                submitter: payload.submitter,
              });
              clearTimeout(timeout);
              resolve();
            },
            error: (err) => {
              clearTimeout(timeout);
              reject(err);
            },
            complete: () => undefined,
          } satisfies Sink
        );
      });

      await delay(25);

      await publishEventLogged({
        id: "30",
        index: 30,
        timestamp: Math.floor(Date.now() / 1000),
        event_type: "audit",
        submitter: "GDDDD",
        metadata: "wrong type",
        event_hash: "e".repeat(64),
        prev_hash: "0".repeat(64),
      });

      await publishEventLogged({
        id: "31",
        index: 31,
        timestamp: Math.floor(Date.now() / 1000),
        event_type: "payment",
        submitter: "GEEEE",
        metadata: "wrong submitter",
        event_hash: "f".repeat(64),
        prev_hash: "e".repeat(64),
      });

      await publishEventLogged({
        id: "32",
        index: 32,
        timestamp: Math.floor(Date.now() / 1000),
        event_type: "payment",
        submitter: "GDDDD",
        metadata: "both match",
        event_hash: "a1".repeat(32),
        prev_hash: "f".repeat(64),
      });

      await done;

      expect(received).toEqual([
        {
          event_type: "payment",
          submitter: "GDDDD",
        },
      ]);
    } finally {
      client.dispose();
    }
  });
});
