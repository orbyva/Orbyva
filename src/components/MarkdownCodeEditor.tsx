import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { markdownSupport } from "@/components/codemirror/markdownLanguage";
import { markdownLivePreview } from "@/components/codemirror/livePreview";
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
      markdownLivePreview,
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
