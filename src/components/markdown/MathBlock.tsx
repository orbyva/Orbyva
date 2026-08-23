import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { MATH_DISPLAY_CLASS } from "@/domain/notes/blockLanguage";

/**
 * Renderer de fórmula matemática — `$a^2 + b^2$` no meio da frase, `$$…$$` em bloco (feature 067).
 *
 * **O `import("katex")` é dinâmico pelo mesmo motivo do `MermaidBlock`.** Este componente vive no
 * chunk do `MarkdownPreview`, que a rota de Notas **e** a descrição de tarefa carregam; um import
 * estático colocaria o KaTeX (mais o CSS e a referência às fontes) no caminho de quem só quer ler
 * uma tarefa. É também por isso que a feature não usa `rehype-katex`: ele renderiza de forma
 * síncrona, e síncrono aqui significa estático.
 *
 * **Fórmula inválida é caso normal**, não exceção — `throwOnError: true` faz o KaTeX reclamar, e o
 * erro vira uma caixa legível no lugar da fórmula, sem derrubar o resto da nota.
 *
 * **Segurança**: `trust: false` (o padrão) desliga `\\href`, `\\url` e `\\includegraphics`, que são
 * os comandos capazes de injetar URL arbitrária; o resto da saída do KaTeX é markup gerado por ele
 * a partir de um AST próprio, nunca do HTML do usuário. É a mesma garantia em que o `rehype-katex`
 * se apoia, e por isso o `dangerouslySetInnerHTML` abaixo não reabre o buraco que a 055 fechou.
 */
export function MathBlock({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  const display = (className ?? "").split(/\s+/).includes(MATH_DISPLAY_CLASS);
  const [state, setState] = useState<MathState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    void (async () => {
      try {
        const [katex] = await Promise.all([
          import("katex").then((module) => module.default),
          import("katex/dist/katex.min.css"),
        ]);
        const html = katex.renderToString(code, {
          displayMode: display,
          throwOnError: true,
          output: "html",
        });
        if (cancelled) return;
        setState({ status: "ready", html });
      } catch (error) {
        if (cancelled) return;
        setState({ status: "error", message: mathErrorMessage(error) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, display]);

  if (state.status === "loading") {
    /**
     * O carregamento mostra a própria fórmula em texto, e não um esqueleto: é o conteúdo real, não
     * some da leitura, e o layout não pula quando o KaTeX chega.
     */
    return (
      <Container display={display} className="text-muted-foreground">
        {code}
      </Container>
    );
  }

  if (state.status === "error") {
    return (
      <span
        role="alert"
        className="inline-flex flex-wrap items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-xs text-destructive"
      >
        <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Fórmula inválida
        <span className="text-muted-foreground">{state.message}</span>
      </span>
    );
  }

  return (
    <Container
      display={display}
      // Markup gerado pelo KaTeX com `trust: false` — ver o comentário do componente.
      html={state.html}
    />
  );
}

/**
 * Fórmula em bloco rola sozinha quando é larga (matriz, integral comprida); a inline continua
 * sendo um `<span>` para não quebrar o parágrafo em dois.
 */
function Container({
  display,
  className,
  html,
  children,
}: {
  display: boolean;
  className?: string;
  html?: string;
  children?: string;
}) {
  const common = {
    "data-testid": display ? "math-display" : "math-inline",
    className: display
      ? `block overflow-x-auto py-1 text-center ${className ?? ""}`.trim()
      : `inline-block ${className ?? ""}`.trim(),
  };

  if (html !== undefined) {
    return <span {...common} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <span {...common}>{children}</span>;
}

type MathState =
  | { status: "loading" }
  | { status: "ready"; html: string }
  | { status: "error"; message: string };

function mathErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Não foi possível interpretar esta fórmula.";
}
