# Scaling Guide

## Horizontal Scaling

### Off-Chain Services

All off-chain services (REST API, GraphQL API, WebSocket stream, metrics exporter) are stateless and can be horizontally scaled:

```yaml
# docker-compose scaling example
services:
  rest-api:
    build: ./api/rest
    deploy:
      replicas: 3
    environment:
      - RPC_URL=${RPC_URL}

  graphql-api:
    build: ./api/graphql
    deploy:
      replicas: 2
    environment:
      - RPC_URL=${RPC_URL}

  ws-stream:
    build: ./api/ws
    deploy:
      replicas: 2
    environment:
      - RPC_URL=${RPC_URL}
```

### Load Balancing

Place a reverse proxy (nginx, Caddy, or cloud LB) in front of scaled services:

```nginx
upstream rest_api {
    server rest-api:3002;
    server rest-api:3002;
}

upstream graphql_api {
    server graphql-api:4000;
    server graphql-api:4000;
}

server {
    listen 80;
    location /api/ {
        proxy_pass http://rest_api;
    }
    location /graphql {
        proxy_pass http://graphql_api;
    }
}
```

## Vertical Scaling

### Contract Layer

The Soroban contract has fixed resource limits per operation. Vertical scaling of the contract is not applicable — scale by:

1. **Increasing `global_max_logs`** if storage allows
2. **Removing per-event caps** to allow unbounded per-type logging
3. **Adjusting TTL** to manage storage reclamation

### Off-Chain Services

| Service | Bottleneck | Recommendation |
|---------|------------|----------------|
| REST API | RPC latency | Increase `RPC_TIMEOUT`; add caching |
| GraphQL API | Query complexity | Limit query depth; add pagination |
| WebSocket | Connection count | Increase `MAX_CONNECTIONS`; use event filtering |
| Relayer | EVM gas costs | Batch submissions; use gas oracles |

## Storage Scaling

### On-Chain

- Storage is bounded by `global_max_logs` and per-event caps
- Use `archive_events` and `purge_archived_events` to manage state
- Set `event_ttl` to allow Soroban to reclaim storage for old events

### Off-Chain

- Off-chain services cache minimal state (only recent events for subscriptions)
- Historical event data can be fetched on-demand from Soroban RPC
- Consider an event export pipeline for long-term archival (see `docs/performance/optimization-guide.md`)

## High-Volume Event Patterns

### Burst Handling

For high-volume event bursts:

1. Use `log_events` (batch) for multiple events
2. Implement client-side backpressure
3. Configure rate limiting on off-chain APIs

### Event Filtering

Reduce WebSocket stream load by subscribing only to needed event types:

```typescript
// Subscribe to specific event types only
ws.send(JSON.stringify({
    type: "subscribe",
    eventTypes: ["payment", "refund"]
}));
```

## Monitoring for Scale

Track these metrics to determine when to scale:

| Metric | Warning Threshold | Critical Threshold |
|--------|-------------------|--------------------|
| API response time (p99) | >1s | >5s |
| WebSocket connections | >80% of max | >95% of max |
| RPC error rate | >1% | >5% |
| Relayer submission failures | >5% | >20% |
| Contract storage usage | >80% of cap | >95% of cap |

## Capacity Planning

| Component | Base Capacity | Per Replica | Scaling Strategy |
|-----------|--------------|-------------|------------------|
| REST API | 50 req/s | ~50 req/s | Horizontal |
| GraphQL API | 25 req/s | ~25 req/s | Horizontal |
| WebSocket | 500 connections | ~500 connections | Horizontal |
| Relayer | 1 submission/30s | N/A | Optimize gas usage |
| Contract | `global_max_logs` | N/A | Adjust limits |
