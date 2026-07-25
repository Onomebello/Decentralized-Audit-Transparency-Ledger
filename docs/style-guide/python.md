# Python Style Guide

## Language Version

Python 3.10+ with type hints.

## Project Structure

```
sdk/python/
├── audit_ledger/
│   ├── __init__.py       # Public API exports
│   ├── client.py         # Main client class
│   ├── models.py         # Dataclasses/types
│   ├── analytics.py      # Analytics helpers
│   └── pandas.py         # Pandas integration
├── tests/
│   ├── __init__.py
│   └── test_sdk.py
├── examples/
│   └── analysis.py
├── pyproject.toml
└── README.md
```

## Naming Conventions

| Construct | Convention | Example |
|-----------|-----------|---------|
| Classes | `PascalCase` | `AuditLedgerClient` |
| Functions, methods | `snake_case` | `log_event`, `get_total_events` |
| Variables | `snake_case` | `event_count`, `contract_id` |
| Constants | `UPPER_SNAKE_CASE` | `DEFAULT_RPC_URL` |
| Private methods/attrs | `_` prefix | `_validate_event` |
| Modules | `snake_case` | `audit_ledger` |

## Type Hints

- Use type hints for all function signatures (parameters and return types)
- Use `|` syntax for unions (Python 3.10+) or `Optional`/`Union`
- Use `TypedDict` or dataclasses for structured data
- Avoid `Any` — use `object` or `TypeVar` with narrowing

```python
from dataclasses import dataclass
from typing import TypedDict


@dataclass
class EventData:
    index: int
    timestamp: int
    event_type: str
    metadata: bytes


EventType: TypeAlias = str  # e.g., "payment", "refund", "transfer"
```

## Formatting

No automated formatter is currently configured. Follow these conventions:

- 4-space indentation
- 88 character line limit (PEP 8 compliant)
- Two blank lines between top-level definitions
- One blank line between methods in a class
- Use trailing commas in multi-line collections

## Imports

```python
# Standard library first
import abc
import dataclasses
from collections.abc import AsyncIterator

# Third-party libraries next
import httpx

# Local imports last
from audit_ledger.models import EventData
```

## Async/Await

- Use `async/await` for I/O operations (RPC calls, HTTP requests)
- Prefer `httpx.AsyncClient` for HTTP
- Use `asyncio.gather` for parallel independent operations

```python
import asyncio
import httpx

class AuditLedgerClient:
    def __init__(self, client: httpx.AsyncClient, contract_id: str) -> None:
        self._client = client
        self._contract_id = contract_id

    async def get_total_events(self) -> int:
        response = await self._client.post(
            self.rpc_url,
            json={"method": "total_events", "params": [self._contract_id]},
        )
        response.raise_for_status()
        return response.json()["result"]
```

## Testing

- Use `pytest` for unit tests
- Name test functions with `test_` prefix
- Use descriptive test names
- Use `pytest.mark.asyncio` for async tests

```python
import pytest

class TestAuditLedgerClient:
    async def test_get_total_events_returns_count(self) -> None:
        client = AuditLedgerClient(...)
        result = await client.get_total_events()
        assert isinstance(result, int)
        assert result >= 0
```

## SDK-Specific

- Export only the public API surface in `__init__.py`
- Raise custom typed exceptions for API errors (define in `errors.py`)
- Support both sync and async where practical
- Use `httpx` over `requests` (async support, connection pooling)
- Document all public functions and classes with docstrings
