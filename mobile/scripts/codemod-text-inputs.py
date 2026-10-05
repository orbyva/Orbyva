"""Troca `TextInput` com visual montado à mão pela primitiva equivalente.

Alvo: `<TextInput … style={[styles.X, …cores…]} />`. Estilo chamado `search` vira `SearchField`
(lupa + visual de campo); os demais viram `Input`. O visual de campo (altura, borda, raio, padding,
fonte) sai de `styles.X` porque a primitiva já resolve pelos tokens; o que sobra (margens) vai em
`style` do `SearchField` ou `containerStyle` do `Input`. `placeholderTextColor` some pelo mesmo motivo.

Uso: python3 scripts/codemod-text-inputs.py <arquivo.tsx> [...]
"""

import re
import sys

FIELD_LOOK = {"minHeight", "height", "borderRadius", "borderWidth", "paddingHorizontal", "fontSize"}
STYLE_ATTR = re.compile(r"\n\s*style=\{\[\s*styles\.(\w+),[\s\S]*?\]\}")


def strip_entry(src: str, name: str) -> tuple[str, bool]:
    """Remove o visual de campo de `styles.name`; devolve se sobrou alguma propriedade."""
    m = re.search(rf"\n  {name}: \{{\n([\s\S]*?)\n  \}},", src)
    if not m:
        return src, False
    kept = [l for l in m.group(1).split("\n") if l.strip().split(":")[0] not in FIELD_LOOK]
    if not kept:
        return src.replace(m.group(0), ""), False
    return src.replace(m.group(0), f"\n  {name}: {{\n" + "\n".join(kept) + "\n  },"), True


def migrate(src: str) -> str:
    names: dict[str, str] = {}

    def swap(m: re.Match) -> str:
        body = m.group(1)
        style = STYLE_ATTR.search(body)
        if not style:
            return m.group(0)
        name = style.group(1)
        tag = "SearchField" if name == "search" else "Input"
        names[name] = tag
        body = STYLE_ATTR.sub(f"\n__STYLE_{name}__", body, count=1)
        body = re.sub(r"\n\s*placeholderTextColor=\{[^}]*\}", "", body)
        return f"<{tag}{body}/>"

    src = re.sub(r"<TextInput(\s[\s\S]*?)/>", swap, src)
    for name, tag in names.items():
        src, kept = strip_entry(src, name)
        prop = "style" if tag == "SearchField" else "containerStyle"
        src = re.sub(
            rf"\n(\s*)__STYLE_{name}__",
            (rf"\n\1{prop}={{styles.{name}}}" if kept else ""),
            src,
        )

    if not re.search(r"<TextInput\b", src):
        src = re.sub(r"\n  TextInput,", "", src)
        src = re.sub(r"TextInput, ", "", src)
    if "SearchField" in names.values() and 'from "@/components/SearchField"' not in src:
        src = add_import(src, 'import { SearchField } from "@/components/SearchField";')
    if "Input" in names.values() and not re.search(r"import \{[^}]*\bInput\b[^}]*\} from \"@/components/ui", src):
        ui = re.search(r'import \{ ([\w, ]+) \} from "@/components/ui";', src)
        if ui:
            parts = sorted(set(ui.group(1).split(", ")) | {"Input"})
            src = src.replace(ui.group(0), f'import {{ {", ".join(parts)} }} from "@/components/ui";')
        else:
            src = add_import(src, 'import { Input } from "@/components/ui";')
    return src


def add_import(src: str, line: str) -> str:
    mod = re.search(r'from "([^"]+)"', line).group(1)
    imports = list(re.finditer(r'^import [\s\S]*?;\n', src, re.M))
    for m in imports:
        other = re.search(r'from "([^"]+)"', m.group(0))
        if other and other.group(1).startswith("@/") and other.group(1).lower() > mod.lower():
            return src[: m.start()] + line + "\n" + src[m.start():]
    last = [m for m in imports if '"@/' in m.group(0)] or imports
    return src[: last[-1].end()] + line + "\n" + src[last[-1].end():]


for path in sys.argv[1:]:
    with open(path, encoding="utf8") as fh:
        before = fh.read()
    after = migrate(before)
    if after != before:
        with open(path, "w", encoding="utf8") as fh:
            fh.write(after)
        print(f"migrado: {path}")
