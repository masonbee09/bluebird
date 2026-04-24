"""Admin CLI for the user-feedback log.

Usage (run from the ``backend`` directory)::

    python -m tools.feedback list              # last 20, newest first
    python -m tools.feedback list --limit 100
    python -m tools.feedback list --category bug
    python -m tools.feedback tail              # raw JSONL tail (last 10)
    python -m tools.feedback stats             # count by category
"""

from __future__ import annotations

import argparse
import json
import sys
import textwrap
from collections import Counter
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_BACKEND_ROOT = _HERE.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from feedback import count_entries, read_entries  # noqa: E402


def _fmt_wrap(text: str, indent: str = "    ", width: int = 92) -> str:
    wrapped = []
    for paragraph in text.splitlines() or [""]:
        if not paragraph:
            wrapped.append("")
            continue
        wrapped.extend(textwrap.wrap(
            paragraph,
            width=width,
            initial_indent=indent,
            subsequent_indent=indent,
            break_long_words=False,
            break_on_hyphens=False,
        ) or [indent])
    return "\n".join(wrapped)


def cmd_list(args: argparse.Namespace) -> int:
    entries = read_entries(limit=args.limit)
    if args.category:
        wanted = args.category.lower()
        entries = [e for e in entries if e.category == wanted]

    if not entries:
        print("(no feedback yet)")
        return 0

    for e in entries:
        header = f"[{e.created_at}]  {e.category.upper():<8}  {e.label or '(unknown)'}"
        if e.page:
            header += f"    @ {e.page}"
        print(header)
        print(_fmt_wrap(e.message))
        print()
    return 0


def cmd_tail(args: argparse.Namespace) -> int:
    # Raw JSONL — handy for piping into jq.
    entries = read_entries(limit=args.limit)
    for e in entries:
        print(json.dumps(e.to_dict(), ensure_ascii=False))
    return 0


def cmd_stats(_args: argparse.Namespace) -> int:
    entries = read_entries()
    counter = Counter(e.category for e in entries)
    total = count_entries()
    print(f"total entries: {total}")
    if not counter:
        return 0
    print()
    for cat, n in counter.most_common():
        print(f"  {cat:<10} {n}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="feedback", description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_list = sub.add_parser("list", help="Pretty-print feedback entries, newest first.")
    p_list.add_argument("--limit", type=int, default=20)
    p_list.add_argument("--category", default=None,
                        help="Filter: bug / feature / question / praise / other.")
    p_list.set_defaults(func=cmd_list)

    p_tail = sub.add_parser("tail", help="Emit the N most recent entries as JSONL.")
    p_tail.add_argument("--limit", type=int, default=10)
    p_tail.set_defaults(func=cmd_tail)

    p_stats = sub.add_parser("stats", help="Show totals per category.")
    p_stats.set_defaults(func=cmd_stats)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
