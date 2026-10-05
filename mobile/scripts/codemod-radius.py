"""Troca `borderRadius: <número>` pelo token de `Radius`.

- Raio igual à metade de `width`/`height` do mesmo bloco (círculo) ou 999 → `Radius.full`.
- 12 ou mais → `Radius.xl` (card do web, `rounded-xl`); 10 → `lg`; 8 e 9 → `md`; 6 e 7 → `sm`.
- 5 ou menos fica (barras finas de progresso), igual à regra do teste-guarda.

Uso: python3 scripts/codemod-radius.py <arquivo.tsx> [...]
"""

import re
import sys

RADIUS = re.compile(r"borderRadius: (\d+)\b")


def token(value: int, block: str) -> str | None:
    sizes = {int(n) for n in re.findall(r"\b(?:width|height): (\d+)\b", block)}
    if value == 999 or (value * 2 in sizes):
        return "Radius.full"
    if value >= 12:
        return "Radius.xl"
    if value >= 10:
        return "Radius.lg"
    if value >= 8:
        return "Radius.md"
    if value >= 6:
        return "Radius.sm"
    return None


def enclosing_block(src: str, pos: int) -> str:
    start = src.rfind("{", 0, pos)
    end = src.find("}", pos)
    return src[start:end]


def migrate(src: str) -> str:
    out, last = [], 0
    for m in RADIUS.finditer(src):
        name = token(int(m.group(1)), enclosing_block(src, m.start()))
        if name:
            out.append(src[last : m.start()] + f"borderRadius: {name}")
            last = m.end()
    src = "".join(out) + src[last:]
    if "Radius." in src and not re.search(r"import \{[^}]*\bRadius\b[^}]*\} from \"@/constants/theme\"", src):
        theme = re.search(r'import \{ ([\w, ]+) \} from "@/constants/theme";', src)
        if theme:
            parts = sorted(set(theme.group(1).split(", ")) | {"Radius"})
            src = src.replace(theme.group(0), f'import {{ {", ".join(parts)} }} from "@/constants/theme";')
        else:
            first_alias = re.search(r'^import .* from "@/.*";\n', src, re.M)
            line = 'import { Radius } from "@/constants/theme";\n'
            src = src[: first_alias.start()] + line + src[first_alias.start():] if first_alias else line + src
    return src


for path in sys.argv[1:]:
    with open(path, encoding="utf8") as fh:
        before = fh.read()
    after = migrate(before)
    if after != before:
        with open(path, "w", encoding="utf8") as fh:
            fh.write(after)
        print(f"migrado: {path}")
