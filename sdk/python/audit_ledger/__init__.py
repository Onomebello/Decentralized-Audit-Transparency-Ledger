"""AuditLedger Python SDK."""

from .client import AuditLedgerClient
from .models import Event, ContractError, RPCError, AuditLedgerError, Page
from .async_client import AsyncAuditLedgerClient
from .validation import (
    SchemaRegistry,
    SchemaValidationError,
    SchemaNotFoundError,
    get_default_registry,
    validate_event,
    BASE_EVENT_SCHEMA,
)

__all__ = [
    # Sync client
    "AuditLedgerClient",
    # Async client (#242)
    "AsyncAuditLedgerClient",
    # Models
    "Event",
    "Page",
    "ContractError",
    "RPCError",
    "AuditLedgerError",
    # Validation (#240)
    "SchemaRegistry",
    "SchemaValidationError",
    "SchemaNotFoundError",
    "get_default_registry",
    "validate_event",
    "BASE_EVENT_SCHEMA",
]
