"""Troca nomes de tema anteriores à 201 pelos do web nos arquivos passados (features 203–207).

Uso: python3 scripts/codemod-theme-names.py <arquivo>...
"""

import re
import sys

THEME = [
    ("textSecondary", "mutedForeground"),
    ("backgroundSelected", "border"),
    ("backgroundElement", "muted"),
    ("surface", "card"),
    ("danger", "destructive"),
    ("text", "foreground"),
]

RADIUS = [
    ("card", "xl"),
    ("input", "md"),
    ("control", "md"),
    ("chip", "full"),
]


def migrate(src: str) -> str:
    for old, new in THEME:
        src = re.sub(rf"\btheme\.{old}\b(?!\w)", f"theme.{new}", src)
        src = re.sub(rf'(themeColor=)(["\']){old}\2', rf"\1\g<2>{new}\2", src)
        if old not in ("text", "danger"):
            src = re.sub(rf'(["\']){old}\1', rf"\g<1>{new}\1", src)
    for old, new in RADIUS:
        src = re.sub(rf"\bRadius\.{old}\b", f"Radius.{new}", src)
    return src


for path in sys.argv[1:]:
    with open(path, encoding="utf8") as fh:
        before = fh.read()
    after = migrate(before)
    if after != before:
        with open(path, "w", encoding="utf8") as fh:
            fh.write(after)
        print(f"migrado: {path}")
