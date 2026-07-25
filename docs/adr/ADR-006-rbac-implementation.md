# ADR-006: RBAC Implementation for Off-Chain Services

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2024-07-01 |
| **Deciders** | Core team |

---

## Context

Off-chain services (REST API, GraphQL API, WebSocket stream, notifier) require access control to distinguish between administrative actions, event reads, and subscription management. The contract layer enforces its own access control via `require_auth()`, but off-chain services need a separate authorization layer.

The two main options were: a simple shared-secret API key model, or a full role-based access control (RBAC) system with scoped permissions.

---

## Decision

Off-chain services implement **RBAC with scoped API keys**:

| Role | Permissions | Typical User |
|------|-------------|-------------|
| `admin` | Full access to all endpoints and configuration | Service operators |
| `reader` | Read-only access to events and stats | Auditors, monitoring tools |
| `subscriber` | WebSocket subscription management | Notifier service, event consumers |
| `metrics` | Read-only access to `/metrics` endpoints | Prometheus, Grafana |

API keys are issued with an embedded role claim:

```json
{
  "key_id": "ak_abc123",
  "role": "reader",
  "scopes": ["events:read", "stats:read"],
  "created_at": "2024-07-01T00:00:00Z",
  "expires_at": "2025-07-01T00:00:00Z"
}
```

Authorization is enforced via middleware in each off-chain service:

```
Request → API Key Extraction → Role Resolution → Scope Check → Handler
```

---

## Consequences

**Positive:**
- Granular access control without changes to the on-chain contract
- API keys can be rotated and revoked independently of contract ownership
- Role separation aligns with least-privilege principle
- Simple to implement as middleware in existing Express/GraphQL/WS servers

**Negative:**
- Additional operational overhead for key management
- API keys can be leaked if not stored securely
- No built-in support for temporary or short-lived keys

**Mitigations:**
- API keys are stored as SHA-256 hashes, never in plaintext
- Rate limiting is applied per key, not per role
- Integration with a secrets manager (Vault, AWS Secrets Manager) is recommended for production

---

## Alternatives Considered

| Alternative | Reason Rejected |
|-------------|----------------|
| Shared secret (single API key) | No access granularity; a leaked key grants full access. |
| JWT-based auth with external IdP | Overengineered for current needs; can be layered on later. |
| No auth (public APIs) | Unacceptable for production deployments that need rate limiting and audit trails. |
| On-chain RBAC | Unnecessary for off-chain concerns; would bloat contract state and gas costs. |
