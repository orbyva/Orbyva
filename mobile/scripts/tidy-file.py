"""Arruma um arquivo depois das trocas das ondas, sem mudar comportamento.

- Remove de `StyleSheet.create({ … })` as entradas de primeiro nível sem `styles.nome` no arquivo.
- Tira do `import … from "react-native"` os nomes que ficaram sem uso.
- Junta os imports de primitivas (`@/components/ui` e `@/components/ui/<Arquivo>`) num só
  `import { … } from "@/components/ui"`, com exatamente as primitivas que o arquivo usa.

Uso: python3 scripts/tidy-file.py <arquivo.tsx> [...]
"""

import re
import sys
from pathlib import Path

UI_INDEX = Path(__file__).resolve().parent.parent / "src/components/ui/index.ts"
UI_EXPORTS = sorted({
    name.strip().split(" as ")[-1]
    for group in re.findall(r"export \{([^}]*)\}", UI_INDEX.read_text(encoding="utf8"))
    for name in group.split(",")
    if name.strip() and not name.strip().startswith("type ")
})


def entry_span(body: str, start: int) -> int:
    """Fim (exclusivo, incluindo a vírgula e a quebra) da entrada que começa em `start`."""
    depth, i = 0, start
    while i < len(body):
        c = body[i]
        if c in "{[(":
            depth += 1
        elif c in "}])":
            depth -= 1
        elif c == "," and depth == 0:
            end = i + 1
            return end + 1 if body[end : end + 1] == "\n" else end
        i += 1
    return len(body)


def prune(src: str) -> str:
    m = re.search(r"StyleSheet\.create\(\{\n", src)
    if not m:
        return src
    changed = True
    while changed:
        changed = False
        for e in re.finditer(r"^  (\w+): ", src[m.end():], re.M):
            name = e.group(1)
            if re.search(rf"styles(\.{name}\b|\[\"{name}\"\])", src):
                continue
            start = m.end() + e.start()
            end = m.end() + entry_span(src[m.end():], e.start())
            src = src[:start] + src[end:]
            changed = True
            break
    return src


def prune_rn_imports(src: str) -> str:
    m = re.search(r'import \{([^}]*)\} from "react-native";', src)
    if not m:
        return src
    rest = src[: m.start()] + src[m.end():]
    names = [n.strip() for n in m.group(1).split(",") if n.strip()]
    kept = [n for n in names if re.search(rf"\b{re.escape(n.replace('type ', '').split(' as ')[-1])}\b", rest)]
    if kept == names:
        return src
    if len(", ".join(kept)) <= 60:
        block = f'import {{ {", ".join(kept)} }} from "react-native";'
    else:
        block = "import {\n" + "".join(f"  {n},\n" for n in kept) + '} from "react-native";'
    return src[: m.start()] + block + src[m.end():]


def consolidate_ui_imports(src: str) -> str:
    """Um só import de `@/components/ui`; ignora arquivos dentro da própria pasta `ui`."""
    pattern = re.compile(r'^import \{([^}]*)\} from "@/components/ui(?:/\w+)?";\n', re.M)
    found = list(pattern.finditer(src))
    if not found:
        return src
    imported = {n.strip() for m in found for n in m.group(1).split(",") if n.strip()}
    if any(n not in UI_EXPORTS and not n.startswith("type ") for n in imported):
        return src
    body = pattern.sub("", src)
    used = [n for n in UI_EXPORTS if re.search(rf"<{n}\b|\b{n}\(", body)]
    types = sorted(n for n in imported if n.startswith("type "))
    names = used + types
    if not names:
        return body
    line = f'import {{ {", ".join(names)} }} from "@/components/ui";\n'
    first = found[0].start()
    return body[:first] + line + body[first:]


for path in sys.argv[1:]:
    with open(path, encoding="utf8") as fh:
        before = fh.read()
    after = prune_rn_imports(prune(before))
    if "/components/ui/" not in path:
        after = consolidate_ui_imports(after)
    if after != before:
        with open(path, "w", encoding="utf8") as fh:
            fh.write(after)
        print(f"limpo: {path}")
