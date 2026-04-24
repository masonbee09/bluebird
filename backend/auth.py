"""Beta-key access control for the Blue Bird API.

Keys live on disk in a JSON file next to ``main.py`` (default name
``beta_keys.json``). The file is intentionally kept out of version control —
the shipped ``beta_keys.example.json`` documents the schema.

Schema::

    {
        "keys": [
            {
                "key": "<opaque string>",
                "label": "Alice (ACME Surveying)",
                "created_at": "2026-04-23T12:00:00Z",
                "expires_at": "2026-05-23T12:00:00Z"  // or null
                "revoked": false,
                "note": "optional free text"
            },
            ...
        ]
    }

The module is deliberately small — no hashing, no database — because for a
beta gate the bar is "a random scraper cannot run the solver", not "state-
actor-grade auth". Keys are treated as bearer secrets transmitted over HTTPS.
"""

from __future__ import annotations

import json
import os
import secrets
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from fastapi import Header, HTTPException, status  # type: ignore


# ── File locations ─────────────────────────────────────────────────────────

# The keys file path can be overridden via BLUEBIRD_KEYS_FILE (useful when
# deploying behind a read-only image with a mounted secrets volume).
_DEFAULT_KEYS_FILE = Path(__file__).resolve().parent / "beta_keys.json"


def _keys_file_path() -> Path:
    override = os.environ.get("BLUEBIRD_KEYS_FILE")
    if override:
        return Path(override)
    return _DEFAULT_KEYS_FILE


# Writes are cheap but concurrent read/modify/write from the CLI and the
# server must not interleave. A process-local lock is enough because the
# intended deployment model is a single uvicorn process.
_lock = threading.Lock()


# ── Data model ─────────────────────────────────────────────────────────────

@dataclass
class BetaKey:
    key: str
    label: str = ""
    created_at: str | None = None
    expires_at: str | None = None
    revoked: bool = False
    note: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "created_at": self.created_at,
            "expires_at": self.expires_at,
            "revoked": self.revoked,
            "note": self.note,
        }

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "BetaKey":
        return cls(
            key=str(raw.get("key", "")),
            label=str(raw.get("label", "") or ""),
            created_at=raw.get("created_at"),
            expires_at=raw.get("expires_at"),
            revoked=bool(raw.get("revoked", False)),
            note=str(raw.get("note", "") or ""),
        )

    def is_expired(self, now: datetime | None = None) -> bool:
        if not self.expires_at:
            return False
        try:
            exp = datetime.fromisoformat(self.expires_at.replace("Z", "+00:00"))
        except ValueError:
            return False
        now = now or datetime.now(timezone.utc)
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        return now >= exp


# ── File I/O ───────────────────────────────────────────────────────────────

def load_keys() -> list[BetaKey]:
    path = _keys_file_path()
    if not path.exists():
        return []
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return []
    records = data.get("keys", []) if isinstance(data, dict) else []
    if not isinstance(records, list):
        return []
    return [BetaKey.from_dict(r) for r in records if isinstance(r, dict)]


def save_keys(records: Iterable[BetaKey]) -> None:
    path = _keys_file_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"keys": [r.to_dict() for r in records]}
    tmp = path.with_suffix(path.suffix + ".tmp")
    with _lock:
        with tmp.open("w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp, path)


def generate_key() -> str:
    """Generate a URL-safe, ~32-byte random token."""
    return "bb_" + secrets.token_urlsafe(24)


# ── Validation ─────────────────────────────────────────────────────────────

@dataclass
class ValidationResult:
    ok: bool
    reason: str = ""
    label: str = ""
    expires_at: str | None = None


def find_key(raw: str) -> BetaKey | None:
    raw = (raw or "").strip()
    if not raw:
        return None
    for rec in load_keys():
        if secrets.compare_digest(rec.key, raw):
            return rec
    return None


def validate(raw: str) -> ValidationResult:
    rec = find_key(raw)
    if rec is None:
        return ValidationResult(ok=False, reason="unknown")
    if rec.revoked:
        return ValidationResult(ok=False, reason="revoked")
    if rec.is_expired():
        return ValidationResult(ok=False, reason="expired")
    return ValidationResult(
        ok=True,
        label=rec.label,
        expires_at=rec.expires_at,
    )


# ── FastAPI dependency ────────────────────────────────────────────────────

def require_api_key(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> BetaKey:
    """Reject the request unless ``X-API-Key`` carries a live beta key.

    An empty ``beta_keys.json`` (i.e. no keys configured) is treated as a
    firmly-closed gate: the server will reject every call until the operator
    issues at least one key with the CLI. This is intentional — it prevents
    an accidentally-empty config from exposing the API.
    """
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-API-Key header.",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    rec = find_key(x_api_key)
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key.",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    if rec.revoked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This API key has been revoked.",
        )
    if rec.is_expired():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This API key has expired.",
        )
    return rec
