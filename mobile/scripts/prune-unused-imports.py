"""Remove os imports que o `tsc` aponta como sem uso (TS6133, `noUnusedLocals`).

Só mexe em import: nome numa lista multi-linha (`  Nome,`), import de um nome só ou nome dentro de
`import { … }` na mesma linha. Variável local sem uso é listada para revisão manual.

Uso (de `mobile/`): python3 scripts/prune-unused-imports.py
"""

import collections
import re
import subprocess

out = subprocess.run(["npx", "tsc", "--noEmit"], capture_output=True, text=True).stdout
todo = collections.defaultdict(list)
for line in out.splitlines():
    m = re.match(r"(.+?)\((\d+),\d+\): error TS6133: '(\w+)'", line)
    if m:
        todo[m[1]].append((int(m[2]), m[3]))

for path, items in todo.items():
    lines = open(path, encoding="utf8").read().split("\n")
    for number, name in sorted(items, reverse=True):
        text = lines[number - 1]
        if re.fullmatch(rf"\s+(type )?{name},", text):
            lines.pop(number - 1)
        elif re.fullmatch(rf"import (type )?(\{{ )?{name}( \}})? from \"[^\"]+\";", text):
            lines.pop(number - 1)
        elif re.match(r"import \{", text) and re.search(rf"\b{name}\b", text):
            lines[number - 1] = re.sub(rf"\b(type )?{name}, |, (type )?{name}\b", "", text)
        else:
            print(f"revisar: {path}:{number} {name} → {text.strip()}")
            continue
        print(f"removido: {path}:{number} {name}")
    with open(path, "w", encoding="utf8") as fh:
        fh.write("\n".join(lines))
