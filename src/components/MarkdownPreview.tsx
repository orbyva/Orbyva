import { useMemo } from "react";
import type { ReactNode } from "react";
import type { Element } from "hast";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { findBlockRenderer } from "@/components/markdown/blockRegistry";
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
  /**
   * Os renderers do registry entram **antes** dos do consumidor: quem passa `components` continua
   * podendo sobrescrever qualquer elemento, `code`/`pre` inclusive.
   */
  const merged = useMemo<Components>(
    () => ({ ...BLOCK_REGISTRY_COMPONENTS, ...components }),
    [components]
  );

  return (
    <div className={cn(MARKDOWN_PREVIEW_CLASS, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={merged}
        urlTransform={urlTransform}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Ponte entre o Markdown e o registry de blocos (feature 057): ` ```<lang> ` com renderer
 * registrado é desenhado por ele; sem renderer, nada muda em relação ao comportamento anterior.
 */
const BLOCK_REGISTRY_COMPONENTS: Components = {
  code(props) {
    const Renderer = findBlockRenderer(props.className);
    if (!Renderer) {
      const { children, ...rest } = withoutNode(props);
      return <code {...rest}>{children}</code>;
    }
    return <Renderer code={blockCode(props.children)} />;
  },
  /**
   * O renderer traz o container dele — deixá-lo dentro do `<pre>` herdaria `white-space: pre` e
   * fonte monoespaçada, que amassam um SVG. Bloco sem renderer continua no `<pre>` de sempre.
   */
  pre(props) {
    if (hasRegisteredBlock(props.node)) return <>{props.children}</>;
    const { children, ...rest } = withoutNode(props);
    return <pre {...rest}>{children}</pre>;
  },
};

/** `node` é o nó do hast, não um atributo de DOM — repassá-lo ao elemento vira warning do React. */
function withoutNode<T extends { node?: Element }>(props: T): Omit<T, "node"> {
  const rest = { ...props };
  delete rest.node;
  return rest;
}

/** Texto cru do fence, sem a quebra de linha final que o Markdown sempre acrescenta. */
function blockCode(children: ReactNode): string {
  if (typeof children === "string") return children.replace(/\n$/, "");
  if (Array.isArray(children)) return children.map(blockCode).join("");
  return "";
}

/** O `<pre>` embrulha um `<code>` de linguagem registrada? A pergunta é feita no hast, não no DOM. */
function hasRegisteredBlock(node: Element | undefined): boolean {
  const child = node?.children?.[0];
  if (!child || child.type !== "element" || child.tagName !== "code") return false;
  const className = child.properties?.className;
  const asString = Array.isArray(className)
    ? className.join(" ")
    : typeof className === "string"
      ? className
      : null;
  return findBlockRenderer(asString) !== null;
}
