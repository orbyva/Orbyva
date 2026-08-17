import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/** Tipografia do Markdown renderizado — compartilhada por descrição de tarefa e nota. */
export const MARKDOWN_PREVIEW_CLASS =
  "min-h-[80px] space-y-2 text-sm [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_del]:text-muted-foreground [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:font-medium [&_ul]:list-disc";

/**
 * Markdown + GFM (listas, tabela, riscado, checklist) renderizado.
 *
 * **HTML cru fica desligado de propósito.** `react-markdown` só interpreta HTML embutido com
 * `rehype-raw`, que este projeto não instala — é o que mantém o preview livre de XSS sem
 * dependência de sanitização. Nenhuma feature posterior pode ligar `rehype-raw` aqui sem, no mesmo
 * passo, adicionar `rehype-sanitize`; o mesmo vale para SVG vindo de fora do Markdown (mermaid na
 * 057, `exportToSvg` do Excalidraw na 058). Ver Decisões da feature 055.
 */
export function MarkdownPreview({
  content,
  className,
  components,
  urlTransform,
}: {
  content: string;
  className?: string;
  /**
   * Renderizadores por elemento, repassados ao `react-markdown` — é por aqui que o módulo de Notas
   * troca o `<a>` por wiki-link/chip de criar nota (feature 056), sem que este componente precise
   * saber o que é uma nota.
   */
  components?: Components;
  /**
   * Saneamento de URL. O padrão do `react-markdown` (`defaultUrlTransform`) já barra esquemas
   * perigosos como `javascript:`; quem sobrescrever **precisa** manter essa barreira e só abrir
   * exceção para esquemas próprios conhecidos — ver `NoteMarkdownPreview`.
   */
  urlTransform?: (url: string) => string;
}) {
  return (
    <div className={cn(MARKDOWN_PREVIEW_CLASS, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        urlTransform={urlTransform}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
