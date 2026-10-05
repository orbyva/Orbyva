"""Troca o estado vazio montado à mão pela primitiva `EmptyState`.

Alvo: `<View style={styles.empty}>` com um `ThemedText type="smallBold"` (título) e, opcionalmente,
um `ThemedText themeColor="mutedForeground"` (descrição). Título/descrição podem ser texto (inclusive
quebrado em linhas) ou uma expressão `{…}`. O ícone sai de ICONS pelo trecho do caminho do arquivo.

Uso: python3 scripts/codemod-empty-states.py <arquivo.tsx> [...]
"""

import re
import sys

ICONS = [
    ("shopping", "cart-outline"),
    ("notes", "document-text-outline"),
    ("projects", "folder-open-outline"),
    ("links", "link-outline"),
    ("tasks", "checkbox-outline"),
    ("Tasks", "checkbox-outline"),
    ("travel", "airplane-outline"),
    ("health", "medkit-outline"),
    ("habits", "repeat-outline"),
    ("goals", "flag-outline"),
    ("books", "book-outline"),
    ("movies", "film-outline"),
    ("music", "musical-notes-outline"),
    ("cars", "car-outline"),
]

BLOCK = re.compile(
    r'(?P<i>[ ]*)<View style=\{styles\.empty\}>\n'
    r'\s*<ThemedText type="smallBold">(?P<title>[\s\S]*?)</ThemedText>\n'
    r'(?:\s*<ThemedText themeColor="mutedForeground">(?P<desc>[\s\S]*?)</ThemedText>\n)?'
    r'\s*</View>'
)


def prop(name: str, raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("{") and raw.endswith("}"):
        return f"{name}={raw}"
    text = " ".join(raw.split())
    return f'{name}="{text}"' if '"' not in text else f"{name}={{{text!r}}}"


def migrate(src: str, path: str) -> str:
    icon = next((icon for key, icon in ICONS if key in path), "file-tray-outline")

    def swap(m: re.Match) -> str:
        i = m["i"]
        lines = [f'icon="{icon}"', prop("title", m["title"])]
        if m["desc"]:
            lines.append(prop("description", m["desc"]))
        return f"{i}<EmptyState\n" + "".join(f"{i}  {l}\n" for l in lines) + f"{i}/>"

    return BLOCK.sub(swap, src)


for path in sys.argv[1:]:
    with open(path, encoding="utf8") as fh:
        before = fh.read()
    after = migrate(before, path)
    if after != before:
        if not re.search(r"import \{[^}]*\bEmptyState\b", after):
            ui = re.search(r'import \{ ([\w, ]+) \} from "@/components/ui";', after)
            if ui:
                parts = sorted(set(ui.group(1).split(", ")) | {"EmptyState"}, key=str.lower)
                after = after.replace(ui.group(0), f'import {{ {", ".join(parts)} }} from "@/components/ui";')
            else:
                anchor = 'import { ThemedText } from "@/components/themed-text";\n'
                after = after.replace(anchor, anchor + 'import { EmptyState } from "@/components/ui";\n', 1)
        with open(path, "w", encoding="utf8") as fh:
            fh.write(after)
        print(f"migrado: {path}")
