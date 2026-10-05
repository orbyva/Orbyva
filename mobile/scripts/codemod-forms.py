"""Leva o padrão de formulário anterior à 202 para as primitivas (features 203–207).

- `<TextInput … style={inputStyle}>` → `<Input …>` (sem `placeholderTextColor`/`style` de campo);
- `<DateField … style={inputStyle} />` → sem o `style`;
- `<FormButton tone="primary">` → `<Button size="lg">`, `tone="danger"` → `variant="destructive"`,
  `tone="neutral"`/sem tone → `variant="outline"`; `busy` → `loading`; `compact` → `size="sm"`;
- remove o `const inputStyle = [...]`, o `function Field` local e os estilos que só eles usavam;
- acerta os imports de `@/components/ui`.

O que sobrar fora do padrão o teste-guarda aponta e é tratado à mão.
Uso: python3 scripts/codemod-forms.py <arquivo>...
"""

import re
import sys
from pathlib import Path

DEAD_STYLES = ["input", "primary", "primaryLabel", "danger", "dangerLabel", "field", "fieldError"]


def strip_input_style(attr: str) -> str:
    attr = re.sub(r"\n\s*placeholderTextColor=\{[^}]*\}", "", attr)
    attr = re.sub(r"\n\s*style=\{inputStyle\}", "", attr)
    attr = re.sub(r"style=\{\[inputStyle,\s*([^\]]+)\]\}", r"style={\1}", attr)
    return attr


UI_INDEX = Path(__file__).resolve().parent.parent / "src/components/ui/index.ts"
UI_EXPORTS = sorted({
    name.strip().split(" as ")[-1]
    for group in re.findall(r"export \{([^}]*)\}", UI_INDEX.read_text(encoding="utf8"))
    for name in group.split(",")
    if name.strip() and not name.strip().startswith("type ")
})


def migrate(src: str) -> str:
    if "inputStyle" in src:
        src = re.sub(r"\n  const inputStyle = \[[\s\S]*?\n  \];\n", "\n", src, count=1)
        src = re.sub(
            r"<TextInput(\s[\s\S]*?)/>",
            lambda m: "<Input" + strip_input_style(m.group(1)) + "/>"
            if "inputStyle" in m.group(1)
            else m.group(0),
            src,
        )
        src = re.sub(r"(<DateField[\s\S]*?)\s*style=\{inputStyle\}", r"\1", src)

    def button(m: re.Match) -> str:
        line_start = src.rfind("\n", 0, m.start()) + 1
        indent = re.match(r"\s*", src[line_start:m.start()]).group(0)
        attrs = m.group(1)
        tone = re.search(r'tone="(\w+)"', attrs)
        attrs = re.sub(r'\n?\s*tone="\w+"', "", attrs)
        attrs = attrs.replace("busy=", "loading=")
        compact = re.search(r"\n?\s*\bcompact\b(?!=)", attrs)
        attrs = re.sub(r"\n?\s*\bcompact\b(?!=)", "", attrs)
        flex = re.search(r"\n?\s*\bflex\b(?!=)", attrs)
        attrs = re.sub(r"\n?\s*\bflex\b(?!=)", "", attrs)
        kind = tone.group(1) if tone else "neutral"
        extra = []
        if kind == "danger":
            extra.append('variant="destructive"')
        elif kind != "primary":
            extra.append('variant="outline"')
        if compact:
            extra.append('size="sm"')
        elif kind == "primary":
            extra.append('size="lg"')
        if flex:
            extra.append("style={{ flex: 1 }}")
        inner = indent + "  "
        if "\n" in attrs.strip():
            body = "\n" + "\n".join(l for l in attrs.strip("\n").rstrip().split("\n") if l.strip())
        else:
            parts = re.findall(r'\w+=(?:"[^"]*"|\{(?:[^{}]|\{[^{}]*\})*\})|\w+', attrs)
            body = "".join(f"\n{inner}{p}" for p in parts)
        body += "".join(f"\n{inner}{e}" for e in extra)
        return f"<Button{body}\n{indent}/>"

    src = re.sub(r"<FormButton(\s[\s\S]*?)/>", button, src)

    src = re.sub(r"\nfunction Field\(\{[\s\S]*?\n\}\n", "\n", src, count=1)

    for name in DEAD_STYLES:
        if re.search(rf"styles\.{name}\b", src):
            continue
        src = re.sub(rf"\n  {name}: \{{[^{{}}]*\}},", "", src)
        src = re.sub(rf"\n  {name}: \{{[^{{}}]*\{{[^{{}}]*\}}[^{{}}]*\}},", "", src)

    used = sorted(n for n in UI_EXPORTS if re.search(rf"<{n}\b|\b{n}\(", src))
    src = re.sub(r'import \{ Banner \} from "@/components/ui/Banner";\n', "", src)
    src = re.sub(r'import \{ FormButton \} from "@/components/ui/FormButton";\n', "", src)
    src = re.sub(r'import \{ ([\w, ]+) \} from "@/components/ui/FormSection";\n', "", src)
    src = re.sub(r'import \{ ([\w, ]+) \} from "@/components/ui";\n', "", src)
    if used:
        anchor = re.search(r'import \{ ThemedView \} from "@/components/themed-view";\n', src) or \
            re.search(r'import \{ ThemedText \} from "@/components/themed-text";\n', src)
        line = f'import {{ {", ".join(used)} }} from "@/components/ui";\n'
        if anchor:
            src = src[: anchor.end()] + line + src[anchor.end():]
        else:
            first = re.search(r"^import .*\n", src, re.M)
            src = src[: first.end()] + line + src[first.end():]

    if not re.search(r"<TextInput\b", src):
        src = re.sub(r"\n  TextInput,", "", src)
    if "type ReactNode" in src and not re.search(r"\bReactNode\b(?!,? ?\} from)", src.split("from \"react\"", 1)[-1]):
        src = src.replace(", type ReactNode", "")
    return src


def prune_rn_imports(src: str) -> str:
    """Tira do `import { … } from "react-native"` os nomes que o arquivo não usa mais."""
    m = re.search(r'import \{([^}]*)\} from "react-native";', src)
    if not m:
        return src
    rest = src[: m.start()] + src[m.end():]
    names = [n.strip() for n in m.group(1).split(",") if n.strip()]
    kept = []
    for n in names:
        bare = n.replace("type ", "").split(" as ")[-1].strip()
        if re.search(rf"\b{re.escape(bare)}\b", rest):
            kept.append(n)
    if kept == names:
        return src
    block = "import {\n" + "".join(f"  {n},\n" for n in kept) + '} from "react-native";'
    return src[: m.start()] + block + src[m.end():]


for path in sys.argv[1:]:
    with open(path, encoding="utf8") as fh:
        before = fh.read()
    after = prune_rn_imports(migrate(before))
    if after != before:
        with open(path, "w", encoding="utf8") as fh:
            fh.write(after)
        print(f"migrado: {path}")
