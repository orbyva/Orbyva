"""Troca cor literal em `StyleSheet` de texto por `themeColor` do token equivalente.

Para cada entrada `nome: { color: "#…", … }` cuja cor está em COLOR_TOKEN:
- sem uso no arquivo → entrada removida (estilo morto);
- `style={styles.nome}` → `themeColor="token"`;
- `style={cond ? styles.nome : undefined}` → `themeColor={cond ? "token" : undefined}`.
A cor sai da entrada; se a entrada ficar vazia, ela some. Outros usos ficam para revisão manual.

Uso: python3 scripts/codemod-literal-colors.py <arquivo.tsx> [...]
"""

import re
import sys

COLOR_TOKEN = {
    "#E11D48": "destructive",
    "#0B0F1A": "primaryForeground",
    "#FFFFFF": "primaryForeground",
    "#D97706": "warning",
    "#16A34A": "success",
}

ENTRY = re.compile(r'\n(  )(\w+): \{ color: "(#[0-9A-Fa-f]{6})"(?:, ([^{}]*?))? \},')


def migrate(src: str) -> tuple[str, list[str]]:
    leftovers = []
    for m in list(ENTRY.finditer(src)):
        indent, name, hex_, rest = m.groups()
        token = COLOR_TOKEN.get(hex_.upper())
        if not token:
            continue
        direct = rf"style=\{{styles\.{name}\}}"
        cond = rf"style=\{{([^{{}}?]+?) \? styles\.{name} : undefined\}}"
        total = len(re.findall(rf"styles\.{name}\b", src))
        handled = len(re.findall(direct, src)) + len(re.findall(cond, src))
        if total != handled:
            leftovers.append(f"{name} ({total - handled} uso(s) fora do padrão)")
            continue
        keep = rf" style={{styles.{name}}}" if rest else ""
        keep_cond = rf" style={{\1 ? styles.{name} : undefined}}" if rest else ""
        src = re.sub(direct, f'themeColor="{token}"{keep}', src)
        src = re.sub(cond, rf'themeColor={{\1 ? "{token}" : undefined}}{keep_cond}', src)
        src = re.sub(
            r'(\n\s*)themeColor="(\w+)"(\s+)themeColor=\{([^{}?]+?) \? "(\w+)" : undefined\}',
            r'\1themeColor={\4 ? "\5" : "\2"}',
            src,
        )
        replacement = f"\n  {name}: {{ {rest} }}," if rest and total else ""
        src = src.replace(m.group(0), replacement)
    return src, leftovers


for path in sys.argv[1:]:
    with open(path, encoding="utf8") as fh:
        before = fh.read()
    after, leftovers = migrate(before)
    if after != before:
        with open(path, "w", encoding="utf8") as fh:
            fh.write(after)
        print(f"migrado: {path}")
    for item in leftovers:
        print(f"  revisar: {item}")
