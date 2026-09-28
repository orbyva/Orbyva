import { useEffect, useRef, useState } from "react";

/**
 * # Fórmula matemática nas notas — `$…$` e `$$…$$` (feature 069)
 *
 * O `remark-math` (em `remarkPlugins.ts`) só parseia; quem desenha é o **KaTeX**, e ele chega por
 * `import("katex")` **dinâmico**, junto com o CSS dele. É o mesmo padrão do `MermaidBlock`: a
 * biblioteca só é baixada quando existe fórmula na tela, então nada disso entra no chunk da rota de
 * Notas (`npm run check:bundle`).
 *
 * Três escolhas que este arquivo carrega:
 *
 * 1. **`katex.render`, não `renderToString` + `innerHTML`.** A API de `render` monta nós de DOM de
 *    verdade dentro do elemento hospedeiro. Assim a invariante da 055 ("o preview não interpreta
 *    HTML") continua literalmente verdadeira — nenhum `dangerouslySetInnerHTML` aparece aqui.
 *    O hospedeiro é um elemento que o React renderiza **sempre vazio**: como nunca teve filhos em
 *    JSX, o React não reconcilia o que o KaTeX pôs lá dentro.
 * 2. **`throwOnError: true`, de propósito.** O padrão do KaTeX é engolir o erro e desenhar a
 *    fórmula quebrada em vermelho, o que faz o usuário achar que escreveu certo. Aqui, fórmula
 *    inválida mostra **o código-fonte** mais a mensagem do KaTeX — mesmo desenho de erro do
 *    `MermaidBlock`.
 * 3. **Enquanto carrega (e se o `import()` falhar), aparece o código-fonte**, não um esqueleto
 *    cinza: uma fórmula curta no meio do parágrafo não pode empurrar o texto duas vezes, e uma
 *    falha de rede degrada para algo legível em vez de um buraco.
 */

/** ` ```math ` e `$$…$$` — fórmula em bloco, centralizada na própria linha. */
export function MathBlock({
  code,
}: {
  code: string;
  /** Aceito pelo registry; o bloco de display já é decidido por quem chama. */
  className?: string;
}) {
  return <MathFormula source={code} display />;
}

/** `$…$` — fórmula no meio da frase, na linha de base do texto. */
export function InlineMath({ code }: { code: string }) {
  return <MathFormula source={code} display={false} />;
}

function MathFormula({ source, display }: { source: string; display: boolean }) {
  const [state, setState] = useState<MathState>({ status: "loading" });
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    void (async () => {
      let katex: typeof import("katex").default;
      try {
        katex = (await import("katex")).default;
        // O CSS mora no módulo lazy junto com o JS: sem ele a fórmula sai desalinhada.
        await import("katex/dist/katex.min.css");
      } catch {
        /**
         * O KaTeX não chegou (offline, chunk fora do ar). Não é erro do usuário e não faz sentido
         * mostrar mensagem de biblioteca para ele: fica o texto-fonte, que é markdown legível.
         */
        if (!cancelled) setState({ status: "unavailable" });
        return;
      }

      const host = hostRef.current;
      if (cancelled || !host) return;

      try {
        katex.render(source, host, {
          displayMode: display,
          // Ver comentário do topo: erro silencioso é pior do que erro visível.
          throwOnError: true,
          output: "html",
        });
        setState({ status: "ready" });
      } catch (error) {
        // Aqui, sim, o erro é do que foi escrito — e a mensagem do KaTeX diz onde.
        if (!cancelled) setState({ status: "error", message: mathErrorMessage(error) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source, display]);

  if (state.status === "error") {
    return (
      <MathError source={source} message={state.message} display={display} />
    );
  }

  // Enquanto carrega e quando o KaTeX não chegou, o que está na tela é o texto-fonte.
  const showingSource = state.status !== "ready";

  return (
    <span
      data-testid={display ? "math-display" : "math-inline"}
      className={
        display
          ? "markdown-math-display overflow-x-auto"
          : "markdown-math-inline"
      }
    >
      {/*
        Slot fixo: `false` ocupa a posição, então o hospedeiro abaixo continua sendo o mesmo nó de
        DOM quando o estado vira `ready` — se ele fosse remontado, o KaTeX desenharia no elemento
        velho e a fórmula sumiria da tela.
      */}
      {showingSource && <code className="markdown-math-source">{source}</code>}
      <span ref={hostRef} hidden={showingSource} />
    </span>
  );
}

/**
 * Fórmula inválida: o usuário vê o que escreveu e o motivo. Nunca um espaço em branco — perder a
 * fórmula da tela é pior do que mostrá-la torta.
 */
function MathError({
  source,
  message,
  display,
}: {
  source: string;
  message: string;
  display: boolean;
}) {
  return (
    <span
      role="alert"
      data-testid={display ? "math-display-error" : "math-inline-error"}
      className="markdown-math-error"
    >
      <span className="markdown-math-message">Fórmula inválida</span>
      <code className="markdown-math-source">{source}</code>
      <span className="markdown-math-message">{message}</span>
    </span>
  );
}

type MathState =
  | { status: "loading" }
  /** O KaTeX não carregou: fica o texto-fonte, sem mensagem de erro (não é culpa de quem escreveu). */
  | { status: "unavailable" }
  | { status: "ready" }
  | { status: "error"; message: string };

function mathErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Não foi possível desenhar esta fórmula.";
}
