"""Tiny structured feedback store.

Feedback lands in a JSONL file (one JSON object per line) so we get the
benefits of structured data (easy to `grep`, `jq`, or parse from Python)
without pulling in a database for what is, at beta scale, a low-volume
notebook of user comments.

Default file: ``backend/feedback.jsonl`` (gitignored).
Override with the ``BLUEBIRD_FEEDBACK_FILE`` environment variable when the
app is hosted on a read-only container image with a mounted volume.
"""

from __future__ import annotations

import json
import os
import threading
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


_DEFAULT_FEEDBACK_FILE = Path(__file__).resolve().parent / "feedback.jsonl"


def _feedback_file_path() -> Path:
    override = os.environ.get("BLUEBIRD_FEEDBACK_FILE")
    if override:
        return Path(override)
    return _DEFAULT_FEEDBACK_FILE


_lock = threading.Lock()


# Kept in sync with the frontend <select>. Unknown categories get normalised
# to "other" so we never reject a submission on a taxonomy mismatch.
ALLOWED_CATEGORIES = {"bug", "feature", "question", "praise", "other"}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


@dataclass
class FeedbackEntry:
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    created_at: str = field(default_factory=_utc_now_iso)
    label: str = ""           # beta-key label of the submitter
    category: str = "other"
    page: str = ""
    user_agent: str = ""
    message: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def append_entry(entry: FeedbackEntry) -> FeedbackEntry:
    """Append one feedback entry to the store. Returns the stored record."""
    # Normalise category before persisting.
    category = (entry.category or "other").strip().lower()
    if category not in ALLOWED_CATEGORIES:
        category = "other"
    entry.category = category

    # Trim obviously-abusive payloads. 8 KB of free text is plenty for
    # human-written feedback; anything longer is probably a mistake or
    # malicious and we truncate rather than reject (so the user's intent
    # still lands somewhere).
    if isinstance(entry.message, str) and len(entry.message) > 8000:
        entry.message = entry.message[:8000] + "\n\n[truncated]"

    path = _feedback_file_path()
    path.parent.mkdir(parents=True, exist_ok=True)

    line = json.dumps(entry.to_dict(), ensure_ascii=False) + "\n"
    with _lock:
        with path.open("a", encoding="utf-8") as f:
            f.write(line)
    return entry


def read_entries(limit: int | None = None) -> list[FeedbackEntry]:
    """Return recent feedback entries, newest first."""
    path = _feedback_file_path()
    if not path.exists():
        return []
    out: list[FeedbackEntry] = []
    with path.open("r", encoding="utf-8") as f:
        for raw in f:
            raw = raw.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if not isinstance(obj, dict):
                continue
            out.append(FeedbackEntry(
                id=str(obj.get("id") or uuid.uuid4().hex),
                created_at=str(obj.get("created_at") or ""),
                label=str(obj.get("label") or ""),
                category=str(obj.get("category") or "other"),
                page=str(obj.get("page") or ""),
                user_agent=str(obj.get("user_agent") or ""),
                message=str(obj.get("message") or ""),
            ))

    out.reverse()  # newest first
    if limit is not None and limit > 0:
        return out[:limit]
    return out


def count_entries() -> int:
    path = _feedback_file_path()
    if not path.exists():
        return 0
    n = 0
    with path.open("r", encoding="utf-8") as f:
        for raw in f:
            if raw.strip():
                n += 1
    return n
