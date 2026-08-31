import { useMemo } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { Element } from "hast";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { findBlockRenderer } from "@/components/markdown/blockRegistry";
import { CalloutBlock } from "@/components/markdown/CalloutBlock";
import {
  CALLOUT_TITLE_ATTR,
  CALLOUT_TYPE_ATTR,
  parseCalloutType,
} from "@/components/markdown/remarkCallout";
import { MARKDOWN_REMARK_PLUGINS } from "@/components/markdown/remarkPlugins";
import { MARKDOWN_REHYPE_PLUGINS } from "@/components/markdown/rehypePlugins";
import {
  MARKDOWN_PREVIEW_CLASS as PREVIEW_CLASS,
  MARKDOWN_TABLE_WRAPPER_CLASS,
} from "@/components/markdown/previewTypography";
import { TASK_INDEX_ATTR } from "@/components/markdown/rehypeTaskListIndex";
import { cn } from "@/lib/utils";

/**
 * Reexport: a tipografia mudou de arquivo na 067 (`markdown/previewTypography.ts`), o nome não.
 * Vários consumidores importam `MARKDOWN_PREVIEW_CLASS` daqui — e continuam podendo.
 */
/* eslint-disable-next-line react-refresh/only-export-components -- reexport de contrato: consumidores importam esta constante daqui desde a 055, e mudá-la de arquivo (067) não pode obrigá-los a trocar de import. */
export { MARKDOWN_PREVIEW_CLASS } from "@/components/markdown/previewTypography";

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
  onToggleTaskItem,
}: {
  content: string;
  className?: string;
  /**
   * Torna a checklist do GFM clicável (feature 067). Recebe o índice do checkbox — o mesmo que
   * `toggleTaskListItem(content, index)` espera — e é responsabilidade de quem passa reescrever o
   * Markdown e gravar.
   *
   * **Sem o handler, o checkbox continua `disabled`**, que é como a descrição de tarefa se
   * comporta: lá o Markdown é do campo de descrição, não um documento que o preview possa editar.
   */
  onToggleTaskItem?: (index: number) => void;
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
    () => ({
      ...BLOCK_REGISTRY_COMPONENTS,
      ...HEADING_COMPONENTS,
      ...CALLOUT_COMPONENTS,
      ...TABLE_COMPONENTS,
      ...taskListComponents(onToggleTaskItem),
      ...components,
    }),
    [components, onToggleTaskItem]
  );

  return (
    <div className={cn(PREVIEW_CLASS, className)}>
      <ReactMarkdown
        remarkPlugins={MARKDOWN_REMARK_PLUGINS}
        rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
        components={merged}
        urlTransform={urlTransform}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Tabela larga rola dentro do próprio container, em vez de esticar a página (feature 067).
 */
const TABLE_COMPONENTS: Components = {
  table(props) {
    const { children, ...rest } = withoutNode(props);
    return (
      <div className={MARKDOWN_TABLE_WRAPPER_CLASS}>
        <table {...rest}>{children}</table>
      </div>
    );
  },
};

/**
 * Checklist clicável (feature 067). Sem `onToggleTaskItem`, devolve exatamente o `<input>` que o
 * `remark-gfm` já produzia — desabilitado —, então nenhum consumidor antigo muda de comportamento.
 *
 * O índice vem do `rehypeTaskListIndex` (atributo no HTML), não de um contador de render.
 */
function taskListComponents(
  onToggleTaskItem?: (index: number) => void
): Components {
  return {
    input(props) {
      const rest = withoutNode(props);
      const index = Number((rest as Record<string, unknown>)[TASK_INDEX_ATTR]);

      if (
        !onToggleTaskItem ||
        rest.type !== "checkbox" ||
        !Number.isInteger(index)
      ) {
        return <input {...rest} />;
      }

      return (
        <input
          {...rest}
          disabled={false}
          // Controlado: o estado real é o Markdown, e ele só muda quando a gravação acontece.
          onChange={() => onToggleTaskItem(index)}
          className={cn("cursor-pointer", rest.className)}
        />
      );
    },
  };
}

/**
 * `> [!NOTE]` marcado pelo `remarkCallout` vira caixa; blockquote comum continua blockquote
 * (feature 067). A decisão de "é callout?" já foi tomada no parser — aqui só se lê o atributo.
 */
const CALLOUT_COMPONENTS: Components = {
  blockquote(props) {
    const record = props as unknown as Record<string, unknown>;
    const type = parseCalloutType(record[CALLOUT_TYPE_ATTR]);
    if (!type) {
      const { children, ...rest } = withoutNode(props);
      return <blockquote {...rest}>{children}</blockquote>;
    }
    const title = record[CALLOUT_TITLE_ATTR];
    return (
      <CalloutBlock type={type} title={typeof title === "string" ? title : undefined}>
        {props.children}
      </CalloutBlock>
    );
  },
};

/** Rótulo da âncora de título — o mesmo texto usado pelo teste, por isso vive numa constante. */
export const HEADING_ANCHOR_LABEL = "Link para esta seção";

/**
 * Título com âncora de link (feature 067). O `id` vem do `rehype-slug`
 * (`MARKDOWN_REHYPE_PLUGINS`); aqui só se acrescenta o `#` que aponta para ele.
 *
 * A âncora fica invisível até o hover/foco (`opacity-0` + `group-hover`), e não `hidden`: elemento
 * escondido de verdade sairia da árvore de acessibilidade e do alcance do teclado. `!no-underline`
 * é necessário porque a tipografia do preview sublinha todo `<a>` — este é o único link que não é
 * do usuário.
 */
function headingRenderer(Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") {
  return function Heading(
    props: ComponentPropsWithoutRef<typeof Tag> & { node?: Element }
  ) {
    const { children, className, ...rest } = withoutNode(props);
    return (
      <Tag {...rest} className={cn("group scroll-mt-20", className)}>
        {children}
        {rest.id ? (
          <a
            href={`#${rest.id}`}
            aria-label={HEADING_ANCHOR_LABEL}
            className="ml-1.5 align-middle text-muted-foreground opacity-0 transition-opacity !no-underline group-hover:opacity-100 focus-visible:opacity-100"
          >
            #
          </a>
        ) : null}
      </Tag>
    );
  };
}

const HEADING_COMPONENTS: Components = {
  h1: headingRenderer("h1"),
  h2: headingRenderer("h2"),
  h3: headingRenderer("h3"),
  h4: headingRenderer("h4"),
  h5: headingRenderer("h5"),
  h6: headingRenderer("h6"),
};

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
    // `className` vai junto: é por ela que o `MathBlock` sabe se a fórmula é inline ou de bloco.
    return (
      <Renderer
        code={blockCode(props.children)}
        className={props.className ?? undefined}
      />
    );
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
