import { useCallback, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { markdownSupport } from "@/components/codemirror/markdownLanguage";
import { markdownLivePreview } from "@/components/codemirror/livePreview";
import { markdownThemeExtension } from "@/components/codemirror/markdownTheme";
import { literalTabKeymap } from "@/components/codemirror/tabKeymap";
import { markdownFormatKeymap } from "@/components/codemirror/formatKeymap";
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
 * Constante de módulo, não objeto inline: `basicSetup` entra nas dependências do efeito que
 * reconfigura o editor no `@uiw/react-codemirror`. Um literal novo a cada render dispararia
 * `StateEffect.reconfigure` toda vez — o que, entre outras coisas, fechava o popup do autocomplete
 * assim que qualquer estado da página mudasse (o indicador "Salvando…", por exemplo).
 */
const BASIC_SETUP = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
  bracketMatching: false,
  // Fechar colchete sozinho mudaria o texto do usuário sem ele pedir — e `[[` é justamente o que o
  // autocomplete de wiki-link escuta.
  closeBrackets: false,
  autocompletion: true,
  /**
   * Busca **dentro** da nota (`Mod-f`), religada na 068.
   *
   * Estava desligada desde a 056 com a justificativa de bundle e de que o app já tem busca global
   * (Ctrl+K) — mas as duas buscas respondem perguntas diferentes: a global acha *a nota*, esta acha
   * *o trecho*. Numa nota de duas páginas, não ter busca é o oposto de escrita sofisticada.
   *
   * O custo medido foi ~0: o `@codemirror/search` já entrava no chunk por causa do
   * `highlightSelectionMatches` do `basicSetup`; o que estava fora era só o keymap (ver Notas da
   * 068).
   */
  searchKeymap: true,
} as const;

export function MarkdownCodeEditor({
  value,
  onChange,
  label,
  placeholder,
  className,
  extensions,
  onViewReady,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Vira `aria-label` do `contenteditable` — é por ele que os testes e leitores de tela acham o campo. */
  label: string;
  placeholder?: string;
  className?: string;
  /** Extensões da feature que monta o editor (live preview, autocomplete de `[[`…). */
  extensions?: Extension[];
  /**
   * Entrega a `EditorView` recém-criada (feature 068).
   *
   * É por ela que a barra de ferramentas roda os comandos de formatação — os mesmos dos atalhos.
   * Sem isso, a barra teria que editar o texto por fora, via `value`/`onChange`, e aí perderia a
   * posição do cursor e a seleção, que é justamente o que um comando de formatação precisa saber.
   */
  onViewReady?: (view: EditorView) => void;
}) {
  /**
   * O `onChange` precisa ter identidade estável **e** aplicar o estado de forma síncrona.
   *
   * O CodeMirror despacha suas transações fora do sistema de eventos do React, então o `setState`
   * disparado aqui seria agendado, não aplicado. Digitando rápido, o `value` que volta para o
   * `@uiw/react-codemirror` fica atrás do documento — e o sync interno dele, 200 ms depois da
   * última tecla, reescreve o documento com esse valor atrasado, **apagando as últimas letras**
   * (reproduzido em teste: o documento voltava para "ver [[" enquanto o estado do React já era
   * "ver [[mate"). `flushSync` mantém prop e documento no mesmo passo.
   *
   * A identidade estável importa porque `onChange` está nas dependências do efeito que reconfigura
   * as extensões: uma função nova a cada render faria o editor se reconfigurar por tecla digitada.
   */
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const handleChange = useCallback((next: string) => {
    flushSync(() => onChangeRef.current(next));
  }, []);

  // Mesma razão do `onChange` acima: identidade estável, senão o `@uiw/react-codemirror` recria o
  // editor a cada render de quem o hospeda.
  const onViewReadyRef = useRef(onViewReady);
  onViewReadyRef.current = onViewReady;
  const handleCreateEditor = useCallback((view: EditorView) => {
    onViewReadyRef.current?.(view);
  }, []);

  const allExtensions = useMemo<Extension[]>(
    () => [
      markdownSupport,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": label }),
      markdownLivePreview,
      markdownThemeExtension,
      literalTabKeymap,
      // Atalhos de formatação (068). O catálogo é o mesmo que a barra do editor de notas usa —
      // ver `formatKeymap.ts`.
      markdownFormatKeymap,
      ...(extensions ?? []),
    ],
    [label, extensions]
  );

  return (
    <CodeMirror
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      extensions={allExtensions}
      onCreateEditor={handleCreateEditor}
      basicSetup={BASIC_SETUP}
      className={cn(
        "rounded-md border border-input bg-transparent shadow-sm focus-within:ring-1 focus-within:ring-ring",
        className
      )}
    />
  );
}
