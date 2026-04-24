"""Admin CLI for the beta-key list.

Usage (run from the ``backend`` directory so imports resolve)::

    python -m tools.beta_keys add "Alice (ACME)"            # unlimited
    python -m tools.beta_keys add "Bob" --days 30            # 30-day key
    python -m tools.beta_keys add "Carol" --note "internal"
    python -m tools.beta_keys list
    python -m tools.beta_keys revoke <key-or-label-prefix>
    python -m tools.beta_keys delete <key-or-label-prefix>

The ``add`` command prints the newly-generated key to stdout. Copy it
to the user you intend to give access to — the key is the bearer secret
that they will paste into the frontend gate.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Allow both "python -m tools.beta_keys ..." and direct "python tools/beta_keys.py"
_HERE = Path(__file__).resolve().parent
_BACKEND_ROOT = _HERE.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from auth import BetaKey, generate_key, load_keys, save_keys  # noqa: E402


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _expires_iso(days: int | None) -> str | None:
    if days is None:
        return None
    exp = datetime.now(timezone.utc) + timedelta(days=days)
    return exp.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _match(records: list[BetaKey], needle: str) -> list[BetaKey]:
    needle = needle.strip()
    if not needle:
        return []
    exact = [r for r in records if r.key == needle]
    if exact:
        return exact
    prefix = [
        r for r in records
        if r.key.startswith(needle) or r.label.lower().startswith(needle.lower())
    ]
    return prefix


def cmd_add(args: argparse.Namespace) -> int:
    records = load_keys()
    key = generate_key()
    record = BetaKey(
        key=key,
        label=args.label,
        created_at=_now_iso(),
        expires_at=_expires_iso(args.days),
        revoked=False,
        note=args.note or "",
    )
    records.append(record)
    save_keys(records)

    print("Created beta key:")
    print(f"  label:      {record.label}")
    print(f"  key:        {record.key}")
    print(f"  created_at: {record.created_at}")
    print(f"  expires_at: {record.expires_at or '(never)'}")
    if record.note:
        print(f"  note:       {record.note}")
    print()
    print("Give the *key* string above to the user. Keep a copy yourself if")
    print("you want to revoke it later.")
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    records = load_keys()
    if not records:
        print("(no keys defined — issue one with `python -m tools.beta_keys add LABEL`)")
        return 0
    now = datetime.now(timezone.utc)
    w_label = max(5, max(len(r.label) for r in records))
    header = f"{'STATUS':<8}  {'LABEL':<{w_label}}  {'EXPIRES':<22}  {'KEY PREVIEW':<14}  CREATED"
    print(header)
    print("-" * len(header))
    for r in records:
        if r.revoked:
            status = "revoked"
        elif r.is_expired(now):
            status = "expired"
        else:
            status = "active"
        preview = (r.key[:8] + "…") if len(r.key) > 9 else r.key
        expires = r.expires_at or "—"
        created = r.created_at or "—"
        print(f"{status:<8}  {r.label:<{w_label}}  {expires:<22}  {preview:<14}  {created}")
    return 0


def cmd_revoke(args: argparse.Namespace) -> int:
    records = load_keys()
    matches = _match(records, args.key_or_label)
    if not matches:
        print(f"No key matched '{args.key_or_label}'.", file=sys.stderr)
        return 1
    if len(matches) > 1 and not args.all:
        print(f"Ambiguous: {len(matches)} keys match. Pass --all or a longer prefix.", file=sys.stderr)
        for m in matches:
            print(f"  - {m.label}  ({m.key[:12]}…)", file=sys.stderr)
        return 1
    for m in matches:
        m.revoked = True
        print(f"Revoked: {m.label} ({m.key[:12]}…)")
    save_keys(records)
    return 0


def cmd_delete(args: argparse.Namespace) -> int:
    records = load_keys()
    matches = _match(records, args.key_or_label)
    if not matches:
        print(f"No key matched '{args.key_or_label}'.", file=sys.stderr)
        return 1
    if len(matches) > 1 and not args.all:
        print(f"Ambiguous: {len(matches)} keys match. Pass --all or a longer prefix.", file=sys.stderr)
        for m in matches:
            print(f"  - {m.label}  ({m.key[:12]}…)", file=sys.stderr)
        return 1
    keep = [r for r in records if r not in matches]
    for m in matches:
        print(f"Deleted: {m.label} ({m.key[:12]}…)")
    save_keys(keep)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="beta_keys", description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_add = sub.add_parser("add", help="Issue a new beta key.")
    p_add.add_argument("label", help="Human-readable label, e.g. \"Alice (ACME)\".")
    p_add.add_argument("--days", type=int, default=None,
                       help="Number of days the key is valid (omit for no expiry).")
    p_add.add_argument("--note", default="", help="Optional free-text note.")
    p_add.set_defaults(func=cmd_add)

    p_list = sub.add_parser("list", help="Show all beta keys.")
    p_list.set_defaults(func=cmd_list)

    p_rev = sub.add_parser("revoke", help="Mark a key as revoked (keeps it in the file).")
    p_rev.add_argument("key_or_label", help="Full key, key prefix, or label prefix.")
    p_rev.add_argument("--all", action="store_true", help="Revoke every matching record.")
    p_rev.set_defaults(func=cmd_revoke)

    p_del = sub.add_parser("delete", help="Remove a key record entirely.")
    p_del.add_argument("key_or_label", help="Full key, key prefix, or label prefix.")
    p_del.add_argument("--all", action="store_true", help="Delete every matching record.")
    p_del.set_defaults(func=cmd_delete)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
