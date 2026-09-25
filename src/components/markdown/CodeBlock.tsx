import { createElement, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Root, RootContent } from "hast";

/**
 * # Bloco de código colorido — ` ```ts ` (feature 069)
 *
 * Até aqui um fence saía em monoespaçada cinza: a 057 tirou o realce de propósito, por bundle.
 * Este componente o devolve **sem** pagar aquele preço: o `lowlight` chega por `import()`
 * dinâmico, então quem nunca abre uma nota com código nunca o baixa.
 *
 * ## Por que `lowlight` e não `highlight.js` direto
 *
 * `hljs.highlight().value` devolve **string de HTML**, que só entra na página por
 * `dangerouslySetInnerHTML`. O `lowlight` devolve a mesma análise em **hast** (árvore), e daqui ela
 * vira árvore React — `<span class="hljs-keyword">` de verdade, criado pelo React. É o que mantém
 * literalmente verdadeira a invariante da 055: o preview não interpreta HTML em lugar nenhum.
 * `shiki` foi descartado na hora do plano: qualidade melhor, megabytes de grammar/theme.
 *
 * ## Nada some por causa da cor
 *
 * Fence sem linguagem, linguagem que o `lowlight` não conhece, ou `import()` que falhou: o bloco
 * aparece igual, só sem cor. Erro de realce não é erro do texto — o código continua na tela,
 * copiável, em todos esses casos.
 *
 * O conjunto carregado é o `common` do lowlight (~37 linguagens: js, ts, python, bash, json, yaml,
 * sql, css, html, go, rust…), não o `all` (~190). O `all` engordaria o chunk em uma ordem de
 * grandeza para cobrir linguagens que ninguém escreve numa nota.
 */
export function CodeBlock({
  code,
  language,
}: {
  code: string;
  language: string | null;
}) {
  const highlighted = useHighlighted(code, language);

  return (
    <div className="markdown-code" data-testid="markdown-code">
      <div className="markdown-code-header">
        <span className="markdown-code-language">{language ?? ""}</span>
      </div>
      <pre>
        <code className={language ? `language-${language}` : undefined}>
          {highlighted ?? code}
        </code>
      </pre>
    </div>
  );
}

/**
 * A árvore colorida, ou `null` enquanto ela não existe — e `null` é um estado final legítimo
 * (sem linguagem, linguagem desconhecida, import que falhou). Quem chama desenha o texto puro.
 */
function useHighlighted(code: string, language: string | null): ReactNode | null {
  const [tree, setTree] = useState<Root | null>(null);

  useEffect(() => {
    setTree(null);
    if (!language) return;

    let cancelled = false;
    void (async () => {
      try {
        const lowlight = await loadLowlight();
        // Linguagem desconhecida não é erro: é um fence que fica sem cor.
        if (cancelled || !lowlight.registered(language)) return;
        const result = lowlight.highlight(language, code);
        if (!cancelled) setTree(result);
      } catch {
        // Chunk que não chegou também cai no texto puro, sem mensagem: o código está lá.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, language]);

  if (!tree) return null;
  return hastToReact(tree.children);
}

type Lowlight = ReturnType<typeof import("lowlight").createLowlight>;

/**
 * Uma instância por página, criada na primeira vez que um bloco de código aparece. Registrar as
 * ~37 gramáticas do `common` é o caro; fazer isso por bloco desenhado seria desperdício puro.
 */
let lowlightPromise: Promise<Lowlight> | null = null;

async function loadLowlight(): Promise<Lowlight> {
  if (!lowlightPromise) {
    lowlightPromise = import("lowlight").then(({ createLowlight, common }) =>
      createLowlight(common)
    );
  }
  try {
    return await lowlightPromise;
  } catch (error) {
    // Falha de rede não pode desligar a cor pelo resto da sessão: o próximo bloco tenta de novo.
    lowlightPromise = null;
    throw error;
  }
}

/**
 * hast → React. O `lowlight` só emite `span` com classe `hljs-*` e nós de texto; qualquer outra
 * tag é ignorada (ficam os filhos), o que fecha a porta para um dia uma gramática emitir algo
 * inesperado. Índice como `key` é seguro aqui: a árvore é recriada inteira a cada realce.
 */
function hastToReact(nodes: readonly RootContent[]): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.type === "text") return node.value;
    if (node.type !== "element") return null;

    const children = hastToReact(node.children);
    if (node.tagName !== "span") return children;

    return createElement(
      "span",
      { key: index, className: classNameOf(node.properties?.className) },
      children
    );
  });
}

function classNameOf(value: unknown): string | undefined {
  if (Array.isArray(value)) return value.join(" ");
  if (typeof value === "string") return value;
  return undefined;
}
