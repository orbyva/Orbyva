import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { LanguageSupport } from "@codemirror/language";
import { EditorView, keymap } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { markdownThemeExtension } from "@/components/codemirror/markdownTheme";
import { literalTabKeymap } from "@/components/codemirror/tabKeymap";
import { cn } from "@/lib/utils";

/**
 * Editor de Markdown **cru** sobre CodeMirror 6.
 *
 * O documento é a fonte da verdade e nunca é reescrito pelo editor: realce, live preview e
 * decorações são todos *view-only* (`Decoration.mark`/`replace`), então o que sai daqui em
 * `onChange` é byte a byte o que o usuário digitou — é a leitura literal de "MARKDOWN NA VEIA"
 * do prompt-mãe, e o motivo de a 056 ter descartado TipTap/Lexical (WYSIWYG que persiste JSON
 * próprio). Ver Decisões da feature 056.
 *
 * HTML embutido continua sem ser interpretado: aqui é texto num `contenteditable` do CodeMirror,
 * nunca `innerHTML`, e o preview (`MarkdownPreview`) segue sem `rehype-raw` (Decisões da 055).
 */
/**
 * Markdown estendido (GFM: tabela, tarefa, riscado) **sem** a fábrica `markdown()` do
 * `@codemirror/lang-markdown`.
 *
 * Motivo, medido: `markdown()` embute `@codemirror/lang-html` para o HTML dentro do Markdown, que
 * arrasta `lang-javascript` e `lang-css` junto — o chunk `codemirror` ia a 212 KB gzip, acima do
 * teto de 200 KB de vendor (`scripts/check-bundle-budget.mjs`). Montando o `LanguageSupport`
 * direto do `markdownLanguage`, o parser de Markdown fica inteiro (é dele que o live preview lê a
 * árvore de sintaxe) e os três parsers de linguagem saem do bundle: 212 KB → 139 KB gzip.
 *
 * O que se perde: realce de sintaxe *dentro* de bloco de código cercado (```js) e de tag HTML —
 * o texto continua lá, cru e monoespaçado, só não vem colorido por linguagem. Trade-off aceito:
 * HTML embutido nem é renderizado no preview (decisão de segurança da 055).
 *
 * `markdownKeymap` vem junto porque é o que continua lista/citação no Enter e apaga a marcação no
 * Backspace — comportamento de editor de notas, e não depende de nenhum parser de linguagem.
 */
const markdownSupport = new LanguageSupport(markdownLanguage, [
  keymap.of(markdownKeymap),
]);

export function MarkdownCodeEditor({
  value,
  onChange,
  label,
  placeholder,
  className,
  extensions,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Vira `aria-label` do `contenteditable` — é por ele que os testes e leitores de tela acham o campo. */
  label: string;
  placeholder?: string;
  className?: string;
  /** Extensões da feature que monta o editor (live preview, autocomplete de `[[`…). */
  extensions?: Extension[];
}) {
  const allExtensions = useMemo<Extension[]>(
    () => [
      markdownSupport,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": label }),
      markdownThemeExtension,
      literalTabKeymap,
      ...(extensions ?? []),
    ],
    [label, extensions]
  );

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      extensions={allExtensions}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        bracketMatching: false,
        // Fechar colchete sozinho mudaria o texto do usuário sem ele pedir — e `[[` é justamente
        // o que o autocomplete de wiki-link escuta.
        closeBrackets: false,
        autocompletion: true,
        // O app tem busca global própria (Ctrl+K); o painel de busca do CodeMirror só atrapalharia.
        searchKeymap: false,
      }}
      className={cn(
        "rounded-md border border-input bg-transparent shadow-sm focus-within:ring-1 focus-within:ring-ring",
        className
      )}
    />
  );
}
