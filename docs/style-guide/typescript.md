# TypeScript Style Guide

## Language Version

TypeScript 5+ targeting ES2019+.

## Project Structure

```
sdk/js/
├── src/
│   ├── index.ts          # Public API exports
│   ├── client.ts         # Main client class
│   ├── types.ts          # TypeScript interfaces/types
│   └── utils.ts          # Helper functions
├── tests/
│   └── client.test.ts    # Vitest tests
├── package.json
└── tsconfig.json
```

## Naming Conventions

| Construct | Convention | Example |
|-----------|-----------|---------|
| Interfaces, types | `PascalCase` | `EventData`, `LogEventOptions` |
| Functions, methods | `camelCase` | `logEvent`, `getTotalEvents` |
| Variables | `camelCase` | `eventCount`, `contractId` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_RETRIES`, `DEFAULT_TIMEOUT` |
| Files | `kebab-case` | `audit-ledger-client.ts` |
| Private methods | `#` prefix (native private) | `#validateEvent` |

## Formatting

No automated formatter is currently configured. Follow these conventions:

- 2-space indentation
- Semicolons required
- Single quotes for strings
- Trailing commas in multi-line objects and arrays
- 100 character line limit

## Types

- Prefer `interface` over `type` for object shapes
- Use `type` for unions, intersections, and utility types
- Avoid `any` — use `unknown` and narrow with type guards
- Use `readonly` for immutable properties

```typescript
// Interfaces for object shapes
interface EventData {
    readonly index: number;
    readonly timestamp: number;
    readonly eventType: string;
    readonly metadata: string;
}

// Types for unions
type EventType = 'payment' | 'refund' | 'transfer';

// Type guards over `any`
function isEventData(data: unknown): data is EventData {
    return typeof data === 'object' && data !== null && 'index' in data;
}
```

## Async/Await

- Use `async/await` over raw Promises or callbacks
- Handle promise rejections with try/catch, not `.catch()`
- Use `Promise.all` for parallel independent operations

```typescript
// Prefer this:
async function getEvents(): Promise<EventData[]> {
    try {
        const [total, events] = await Promise.all([
            client.totalEvents(),
            client.getEvents(),
        ]);
        return events;
    } catch (error) {
        throw new Error(`Failed to fetch events: ${error}`);
    }
}
```

## Testing

- Use Vitest for unit tests
- Name test files `*.test.ts` adjacent to source or in `tests/`
- Use descriptive test names with `it()` or `test()`

```typescript
import { describe, it, expect } from 'vitest';

describe('AuditLedgerClient', () => {
    it('should return total events count', async () => {
        const client = new AuditLedgerClient(rpcUrl);
        const total = await client.totalEvents();
        expect(total).toBeGreaterThanOrEqual(0);
    });
});
```

## SDK-Specific

- Export only the public API surface from `index.ts`
- Keep the client stateless where possible
- Use the Soroban SDK types for contract interaction
- Throw typed errors for API failures
- Document all public methods with JSDoc
