# ADR-009: API Design for Off-Chain Services

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2024-07-01 |
| **Deciders** | Core team |

---

## Context

Off-chain consumers need multiple access patterns for AuditLedger events: REST for simple integrations, GraphQL for rich queries and type safety, and WebSocket for real-time event streaming. The question is how to design these APIs for consistency, maintainability, and performance.

---

## Decision

We use a **layered API architecture** with REST as the outer adapter, GraphQL as the core query engine, and WebSocket for push-based subscriptions:

```
┌─────────┐     ┌──────────┐     ┌─────────────────┐
│  REST   │────▶│  GraphQL │────▶│  Soroban RPC    │
│  (thin) │     │  (core)  │     │  (data source)  │
└─────────┘     └──────────┘     └─────────────────┘
                      │
                      ▼
               ┌──────────┐
               │  WebSocket│
               │  (stream) │
               └──────────┘
```

### REST API

- Thin adapter that delegates to GraphQL resolvers
- Provides a flat, familiar REST interface for simple integrations
- Endpoints are versioned (`/api/v1/`)
- Standard HTTP methods: GET for reads, POST for writes

### GraphQL API

- Core query engine for all off-chain data access
- Single endpoint (`/graphql`) for all queries
- Schema-first design with explicit types and relationships
- Supports pagination, filtering, and field selection
- Resolvers map to Soroban contract reads

### WebSocket Stream

- Gateway for real-time event pushes
- Uses a lightweight JSON frame protocol
- Event type filtering at connection time
- Heartbeat mechanism for connection health

### Shared Conventions

| Convention | Standard |
|------------|----------|
| Pagination | Cursor-based (`first`, `after`, `before`) |
| Error format | `{ error: { code, message, details } }` |
| Timestamps | ISO 8601 (UTC) |
| IDs | Hex-encoded SHA-256 hash strings |
| Rate limiting | Per-IP and per-API-key token buckets |

---

## Consequences

**Positive:**
- Single GraphQL core eliminates duplicate business logic across API layers
- REST adapter provides a familiar interface without maintaining duplicate resolvers
- WebSocket stream integrates naturally with GraphQL subscriptions
- Cursor-based pagination works well with sequential event IDs
- Consistent error format simplifies client error handling

**Negative:**
- REST API has slightly higher latency due to the adapter layer
- GraphQL schema must be versioned carefully to avoid breaking changes
- WebSocket protocol is custom (not WAMP or similar standard)
- Rate limiting must be consistent across all three API surfaces

**Mitigations:**
- REST adapter is a thin pass-through (no caching layer adds latency)
- GraphQL schema changes follow a deprecation policy (`@deprecated` directive)
- WebSocket protocol is documented and has reference client implementations
- Rate limiting is centralized in a shared middleware package

---

## Alternatives Considered

| Alternative | Reason Rejected |
|-------------|----------------|
| REST-only with multiple endpoints | Duplicated logic; no type-safe queries; harder to evolve. |
| GraphQL-only (no REST) | Steeper learning curve for simple integrations; some tools speak only REST. |
| gRPC | Unnecessary overhead for this use case; harder to consume from browsers and scripts. |
| Server-Sent Events (SSE) instead of WebSocket | Unidirectional only; no client-to-server filtering or subscription management. |
| REST + WebSocket (no GraphQL) | REST lacks rich query semantics; WebSocket alone doesn't provide typed queries. |
