import { useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { sanitizeSvgMarkup } from "@/components/markdown/sanitizeSvg";
import { useIsDarkTheme } from "@/hooks/useIsDarkTheme";

/**
 * Renderer do bloco ` ```mermaid ` — flowchart, sequência, gantt, ER e o resto do que o mermaid
 * desenha, escritos em texto dentro da própria nota (feature 057).
 *
 * **O `import("mermaid")` é dinâmico de propósito.** O mermaid é a maior dependência do app; com
 * import estático ele entraria no bundle da rota de notas e estouraria o orçamento
 * (`npm run check:bundle`). Assim ele só é baixado quando existe um bloco mermaid na tela — e o
 * próprio mermaid ainda faz code-split por tipo de diagrama, então só vem o tipo usado.
 *
 * **`securityLevel: "strict"`** é a barreira de segurança: desliga rótulo em HTML (`htmlLabels`) e
 * faz o mermaid sanitizar o texto do usuário. O SVG que ele devolve ainda passa por
 * `sanitizeSvgMarkup` antes de entrar na página — ver Decisões da 057 e o comentário de
 * `sanitizeSvg.ts`.
 *
 * **Sintaxe inválida é caso normal**, não exceção: `mermaid.parse` valida antes de desenhar e o
 * erro vira uma caixa legível no lugar do diagrama. O resto da nota continua renderizando.
 */
export function MermaidBlock({ code }: { code: string }) {
  const [state, setState] = useState<MermaidState>({ status: "loading" });
  const isDark = useIsDarkTheme();
  const idRef = useRef<string>("");
  if (!idRef.current) idRef.current = `orbyva-mermaid-${++mermaidSeq}`;

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          // Nunca afrouxar sem, no mesmo commit, adicionar sanitização de HTML de verdade.
          securityLevel: "strict",
          theme: isDark ? "dark" : "default",
          fontFamily: "inherit",
        });
        // `parse` lança em sintaxe inválida — é o que separa "erro do usuário" de "app quebrado".
        await mermaid.parse(code);
        const { svg } = await mermaid.render(idRef.current, code);
        if (cancelled) return;
        setState({ status: "ready", svg: sanitizeSvgMarkup(svg) });
      } catch (error) {
        if (cancelled) return;
        setState({ status: "error", message: mermaidErrorMessage(error) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, isDark]);

  if (state.status === "loading") {
    return (
      <Skeleton
        role="status"
        aria-label="Desenhando diagrama"
        className="h-32 w-full"
      />
    );
  }

  if (state.status === "error") {
    return (
      <div
        role="alert"
        className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2"
      >
        <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
          <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
          Diagrama inválido
        </p>
        <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <div
      // O SVG já passou por `securityLevel: "strict"` do mermaid e por `sanitizeSvgMarkup`.
      dangerouslySetInnerHTML={{ __html: state.svg }}
      data-testid="mermaid-diagram"
      className="overflow-x-auto [&_svg]:h-auto [&_svg]:max-w-full"
    />
  );
}

type MermaidState =
  | { status: "loading" }
  | { status: "ready"; svg: string }
  | { status: "error"; message: string };

/**
 * O id vai parar dentro do SVG **e** em seletores de CSS que o mermaid gera; `useId` devolve algo
 * como `:r3:`, que não é seletor válido. Contador de módulo resolve e ainda garante unicidade entre
 * blocos da mesma nota.
 */
let mermaidSeq = 0;

function mermaidErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Não foi possível desenhar este diagrama.";
}

// `useIsDarkTheme` vivia aqui e virou `@/hooks/useIsDarkTheme` quando o canvas (058) precisou do
// mesmo sinal: alternar o tema redesenha o diagrama com as cores certas.
