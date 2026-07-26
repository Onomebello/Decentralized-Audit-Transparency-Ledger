"""AuditLedger Python SDK — Soroban contract client."""

from __future__ import annotations

import base64
import csv
import hashlib
import io
import json
import struct
import time
from collections import OrderedDict
from typing import Any, Callable, Generator, Optional

from .models import Event, ContractError, RPCError, Page

try:
    import stellar_sdk
    from stellar_sdk import SorobanServer, Keypair
    from stellar_sdk.soroban import SorobanClient
    STELLAR_SDK_AVAILABLE = True
except ImportError:
    STELLAR_SDK_AVAILABLE = False


class AuditLedgerClient:
    """Client for interacting with the AuditLedger Soroban contract.

    Args:
        contract_id: Stellar contract ID (C... string).
        rpc_url: Soroban RPC endpoint URL.
        network_passphrase: Stellar network passphrase.
        source_keypair: Optional Stellar keypair for signing transactions.

    Usage:
        >>> client = AuditLedgerClient(
        ...     contract_id="CCXMTP7...",
        ...     rpc_url="https://soroban-testnet.stellar.org",
        ...     network_passphrase="Test SDF Network ; September 2015",
        ... )
        >>> events = client.total_events()
        42
    """

    def __init__(
        self,
        contract_id: str,
        rpc_url: str = "https://soroban-testnet.stellar.org",
        network_passphrase: str = "Test SDF Network ; September 2015",
        source_keypair: Optional[str] = None,
        cache_size: int = 128,
        enable_cache: bool = True,
        max_page_size: int = 100,
    ):
        if not STELLAR_SDK_AVAILABLE:
            raise ImportError(
                "stellar-sdk is required. Install with: pip install stellar-sdk"
            )
        self.contract_id = contract_id
        self.rpc_url = rpc_url
        self.network_passphrase = network_passphrase
        self.server = SorobanServer(rpc_url)
        self.source = Keypair.from_secret(source_keypair) if source_keypair else None
        self._event_cache: OrderedDict[int, Event] = OrderedDict()
        self._total_events_cache: Optional[int] = None
        self._cache_hits = 0
        self._cache_misses = 0
        self._cache_enabled = enable_cache
        self._max_cache_size = max(1, cache_size)
        self._max_page_size = max(1, max_page_size)

    def _invoke(self, method: str, params: dict = None):
        """Invoke a contract function and return the parsed result."""
        if params is None:
            params = {}

        try:
            result = self.server.invoke_contract(
                contract_id=self.contract_id,
                function_name=method,
                parameters=params,
                source=self.source,
            )
            return result
        except Exception as e:
            error_msg = str(e)
            # Try to extract contract error code
            for code in sorted(ContractError.ERROR_CODES, reverse=True):
                if f"#{code}" in error_msg or f"Error(Contract, #{code})" in error_msg:
                    raise ContractError(code) from e
            raise RPCError(f"RPC call failed: {error_msg}") from e

    def _parse_u32(self, result) -> int:
        """Parse a u32 return value."""
        if isinstance(result, dict):
            for v in result.values():
                return int(v)
        return int(result)

    def _ensure_runtime_state(self) -> None:
        """Initialize runtime-only state for clients built without __init__."""
        if not hasattr(self, "_event_cache"):
            self._event_cache = OrderedDict()
        if not hasattr(self, "_total_events_cache"):
            self._total_events_cache = None
        if not hasattr(self, "_cache_hits"):
            self._cache_hits = 0
        if not hasattr(self, "_cache_misses"):
            self._cache_misses = 0
        if not hasattr(self, "_cache_enabled"):
            self._cache_enabled = True
        if not hasattr(self, "_max_cache_size"):
            self._max_cache_size = 128
        if not hasattr(self, "_max_page_size"):
            self._max_page_size = 100

    # ── Write functions ───────────────────────────────────────────────────

    def initialize(self, owner: str, global_max_logs: int) -> None:
        """Initialize the contract with an owner and global max log count."""
        self._invoke("initialize", {
            "owner": owner,
            "global_max_logs": global_max_logs,
        })

    def log_event(
        self, submitter: str, event_type: str, metadata: bytes
    ) -> bytes:
        """Log an event and return its 32-byte content-addressed ID."""
        result = self._invoke("log_event", {
            "submitter": submitter,
            "event_type": event_type,
            "metadata": base64.b64encode(metadata).decode(),
        })
        if isinstance(result, dict):
            return bytes.fromhex(list(result.values())[0])
        return bytes.fromhex(result)

    def log_events(self, events: list[dict[str, Any]]) -> list[int]:
        """Log a batch of events and return their sequential indices."""
        payload = []
        for event in events:
            payload.append({
                "submitter": event["submitter"],
                "event_type": event["event_type"],
                "metadata": base64.b64encode(event["metadata"]).decode(),
            })
        result = self._invoke("log_events", {"events": payload})
        if isinstance(result, list):
            return [self._parse_u32(item) for item in result]
        if isinstance(result, dict):
            return [self._parse_u32(value) for value in result.values()]
        return [self._parse_u32(result)]

    def log_event_signed(
        self,
        submitter: str,
        event_type: str,
        metadata: bytes,
        signature_payload: bytes,
    ) -> bytes:
        """Log an event with a 96-byte signature payload (pubkey + sig)."""
        result = self._invoke("log_event_signed", {
            "submitter": submitter,
            "event_type": event_type,
            "metadata": base64.b64encode(metadata).decode(),
            "signature_payload": base64.b64encode(signature_payload).decode(),
        })
        if isinstance(result, dict):
            return bytes.fromhex(list(result.values())[0])
        return bytes.fromhex(result)

    # ── Read functions ────────────────────────────────────────────────────

    def total_events(self, use_cache: bool = True) -> int:
        """Return the total number of events on-chain."""
        self._ensure_runtime_state()
        if use_cache and self._cache_enabled and self._total_events_cache is not None:
            return self._total_events_cache
        result = self._invoke("total_events")
        total = self._parse_u32(result)
        if self._cache_enabled:
            self._total_events_cache = total
        return total

    def get_event(self, event_id: bytes) -> Event:
        """Retrieve an event by its 32-byte content-addressed ID."""
        result = self._invoke("get_event", {"id": event_id.hex()})
        return Event.from_dict(result) if isinstance(result, dict) else result

    def get_event_by_order(self, order: int) -> Event:
        """Retrieve an event by its sequential order index."""
        self._ensure_runtime_state()
        if self._cache_enabled and order in self._event_cache:
            self._cache_hits += 1
            self._event_cache.move_to_end(order)
            return self._event_cache[order]

        self._cache_misses += 1
        result = self._invoke("get_event_by_order", {"order": order})
        event = Event.from_dict(result) if isinstance(result, dict) else result
        if self._cache_enabled:
            self._event_cache[order] = event
            self._event_cache.move_to_end(order)
            self._total_events_cache = max(self._total_events_cache or 0, order + 1)
            while len(self._event_cache) > self._max_cache_size:
                self._event_cache.popitem(last=False)
        return event

    def event_count(self, event_type: str) -> int:
        """Return the count of events for a specific type."""
        result = self._invoke("event_count", {"event_type": event_type})
        return self._parse_u32(result)

    def get_event_by_type(self, event_type: str, type_index: int) -> Event:
        """Retrieve an event by type and type-relative index."""
        result = self._invoke("get_event_by_type", {
            "event_type": event_type,
            "type_index": type_index,
        })
        return Event.from_dict(result) if isinstance(result, dict) else result

    def stream_events(
        self, after_index: int = 0, poll_interval_s: float = 5.0
    ) -> Generator[Event, None, None]:
        """Yield new Event objects as they are logged on-chain.

        Args:
            after_index: Resume from this sequential order index (exclusive).
            poll_interval_s: Seconds to wait between polls when no new events.

        Yields:
            Event objects in ascending order as they appear.
        """
        cursor = max(int(after_index), 0)
        while True:
            total = self.total_events()
            while cursor < total:
                yield self.get_event_by_order(cursor)
                cursor += 1
            if poll_interval_s <= 0:
                return
            time.sleep(poll_interval_s)

    def get_events(
        self,
        offset: int = 0,
        limit: int = 50,
        cursor: Optional[int] = None,
    ) -> "Page[Event]":
        """Return a paginated slice of all events.

        Args:
            offset: Zero-based index of the first event to return.
            limit: Maximum number of events to return.
            cursor: An optional cursor that is treated as the starting offset.

        Returns:
            Page[Event] with items, total, offset, and limit fields.
        """
        start = max(int(cursor or offset), 0) if cursor is not None else max(int(offset), 0)
        self._ensure_runtime_state()
        safe_limit = max(1, min(int(limit), self._max_page_size))
        total = self.total_events()
        end = min(start + safe_limit, total)
        items: list[Event] = []
        for i in range(start, end):
            items.append(self.get_event_by_order(i))
        return Page(items=items, total=total, offset=start, limit=safe_limit)

    def filter_events(
        self,
        events: list[Event],
        event_type: Optional[str] = None,
        submitter: Optional[str] = None,
        start_time: Optional[int] = None,
        end_time: Optional[int] = None,
        metadata_query: Optional[str] = None,
    ) -> list[Event]:
        """Filter events on the client side using simple predicates."""
        query = metadata_query.lower() if metadata_query else None
        filtered: list[Event] = []
        for event in events:
            if event_type and event.event_type != event_type:
                continue
            if submitter and event.submitter != submitter:
                continue
            if start_time is not None and event.timestamp < start_time:
                continue
            if end_time is not None and event.timestamp > end_time:
                continue
            if query:
                metadata_text = event.metadata.decode("utf-8", errors="ignore").lower()
                if query not in metadata_text:
                    continue
            filtered.append(event)
        return filtered

    def export_events(
        self,
        events: list[Event],
        fmt: str = "json",
        streaming: bool = False,
        on_progress: Optional[Callable[[dict[str, int]], None]] = None,
    ) -> str:
        """Export events as JSON or CSV, optionally emitting progress updates."""
        total = len(events)
        records: list[dict[str, Any]] = []
        for index, event in enumerate(events, start=1):
            records.append({
                "index": event.index,
                "timestamp": event.timestamp,
                "event_type": event.event_type,
                "submitter": event.submitter,
                "metadata": event.metadata.decode("utf-8", errors="ignore"),
                "metadata_hex": event.metadata.hex(),
                "event_hash": event.event_hash.hex(),
                "prev_hash": event.prev_hash.hex(),
            })
            if streaming and on_progress is not None:
                on_progress({"completed": index, "total": total})

        if fmt.lower() == "csv":
            output = io.StringIO()
            fieldnames = [
                "index",
                "timestamp",
                "event_type",
                "submitter",
                "metadata",
                "metadata_hex",
                "event_hash",
                "prev_hash",
            ]
            writer = csv.DictWriter(output, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(records)
            return output.getvalue()

        return json.dumps(records)

    def cache_stats(self) -> dict[str, int]:
        """Return cache hit/miss statistics and the current cache size."""
        self._ensure_runtime_state()
        return {
            "hits": self._cache_hits,
            "misses": self._cache_misses,
            "size": len(self._event_cache) + (1 if self._total_events_cache is not None else 0),
        }

    def invalidate_cache(self) -> None:
        """Clear cached events and total event counts."""
        self._event_cache.clear()
        self._total_events_cache = None
        self._cache_hits = 0
        self._cache_misses = 0

    # ── Governance ────────────────────────────────────────────────────────

    def set_global_max_logs(self, caller: str, new_max: int) -> None:
        """Set the global maximum log count (owner-only)."""
        self._invoke("set_global_max_logs", {
            "caller": caller,
            "new_max": new_max,
        })

    def set_event_max_logs(self, caller: str, event_type: str, new_max: int) -> None:
        """Set per-event-type max logs (owner-only)."""
        self._invoke("set_event_max_logs", {
            "caller": caller,
            "event_type": event_type,
            "new_max": new_max,
        })

    def remove_event_cap(self, caller: str, event_type: str) -> None:
        """Remove a per-event-type cap (owner-only)."""
        self._invoke("remove_event_cap", {
            "caller": caller,
            "event_type": event_type,
        })

    def transfer_ownership(self, caller: str, new_owner: str) -> None:
        """Transfer contract ownership (owner-only)."""
        self._invoke("transfer_ownership", {
            "caller": caller,
            "new_owner": new_owner,
        })

    # ── Metadata size cap (issue #67) ─────────────────────────────────────

    def set_metadata_max_size(self, caller: str, max_size: int) -> None:
        """Set the global metadata size cap (owner-only)."""
        self._invoke("set_metadata_max_size", {
            "caller": caller,
            "max_size": max_size,
        })

    def set_event_metadata_max_size(
        self, caller: str, event_type: str, max_size: int
    ) -> None:
        """Set per-event-type metadata size cap (owner-only)."""
        self._invoke("set_event_metadata_max_size", {
            "caller": caller,
            "event_type": event_type,
            "max_size": max_size,
        })

    def get_metadata_max_size(self, event_type: str) -> int:
        """Get the effective metadata size cap for a given event type."""
        result = self._invoke("get_metadata_max_size", {
            "event_type": event_type,
        })
        return self._parse_u32(result)

    # ── Signatures (issue #69) ────────────────────────────────────────────

    def get_event_signature(self, event_id: bytes) -> Optional[bytes]:
        """Return the stored 96-byte signature payload for an event."""
        try:
            result = self._invoke("get_event_signature", {
                "event_id": event_id.hex(),
            })
            if isinstance(result, dict):
                raw = list(result.values())[0]
                return base64.b64decode(raw) if raw else None
            return None
        except (ContractError, RPCError):
            return None

    # ── Integrity (issue #66) ─────────────────────────────────────────────

    def verify_integrity(self) -> bool:
        """Verify the full hash chain. Returns True if valid."""
        result = self._invoke("verify_integrity")
        if isinstance(result, dict):
            return list(result.values())[0] is True
        return bool(result)

    def verify_integrity_range(self, from_idx: int, to_idx: int) -> bool:
        """Verify a range of the hash chain."""
        result = self._invoke("verify_integrity_range", {
            "from": from_idx,
            "to": to_idx,
        })
        if isinstance(result, dict):
            return list(result.values())[0] is True
        return bool(result)

    # ── Utility ───────────────────────────────────────────────────────────

    @staticmethod
    def compute_event_id(
        contract_id: str,
        submitter: str,
        event_type: str,
        metadata: bytes,
        timestamp: int,
        index: int,
    ) -> bytes:
        """Recompute the content-addressed event ID off-chain.

        Matches `compute_event_id` in the contract (issue #70).
        """
        preimage = (
            contract_id.encode()
            + submitter.encode()
            + event_type.encode()  # use raw bytes; contract uses Symbol payload
            + metadata
            + struct.pack("<Q", timestamp)
            + struct.pack("<I", index)
        )
        return hashlib.sha256(preimage).digest()

    @staticmethod
    def verify_signature(
        event_id: bytes, pubkey: bytes, signature: bytes
    ) -> bool:
        """Verify an Ed25519 signature against an event ID.

        Args:
            event_id: 32-byte event ID (the signed message).
            pubkey: 32-byte Ed25519 public key.
            signature: 64-byte Ed25519 signature.

        Returns:
            True if the signature is valid for the given event ID.
        """
        try:
            from stellar_sdk.keypair import Keypair
            verified = Keypair.from_public_key(pubkey.hex()).verify(
                event_id, signature
            )
            return verified
        except Exception:
            return False
