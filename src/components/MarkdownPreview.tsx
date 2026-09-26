import { createElement, useMemo } from "react";
import type { JSX, ReactNode } from "react";
import type { Element } from "hast";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { findBlockRenderer } from "@/components/markdown/blockRegistry";
import { CalloutBlock } from "@/components/markdown/CalloutBlock";
import { CodeBlock } from "@/components/markdown/CodeBlock";
import { InlineMath } from "@/components/markdown/MathBlock";
import {
  CALLOUT_TITLE_ATTR,
  CALLOUT_TYPE_ATTR,
  parseCalloutType,
} from "@/components/markdown/remarkCallout";
import { MARKDOWN_REMARK_PLUGINS } from "@/components/markdown/remarkPlugins";
import { MARKDOWN_REHYPE_PLUGINS } from "@/components/markdown/rehypePlugins";
import { TASK_INDEX_ATTR } from "@/components/markdown/rehypeTaskIndex";
import {
  MARKDOWN_PREVIEW_CLASS as LEGACY_PREVIEW_TYPOGRAPHY,
  MARKDOWN_TABLE_WRAPPER_CLASS,
} from "@/components/markdown/previewTypography";
import { parseBlockLanguage } from "@/domain/notes/blockLanguage";
import { cn } from "@/lib/utils";

/**
 * Tipografia do Markdown renderizado — compartilhada por descrição de tarefa e nota.
 *
 * A folha rica mora em `src/index.css` (`.markdown-body`). O módulo `previewTypography` ainda
 * exporta classes Tailwind complementares; as duas vão no DOM. O export público é a classe da
 * folha CSS (069): quem faz `querySelector('.markdown-body')` e os testes de tipografia da agenda
 * dependem desse valor estável.
 */
export const MARKDOWN_PREVIEW_CLASS = "markdown-body";

const PREVIEW_CLASS = cn(LEGACY_PREVIEW_TYPOGRAPHY, MARKDOWN_PREVIEW_CLASS);

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
  onToggleTask,
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
  /**
   * Torna a checklist do GFM clicável. Recebe o índice do checkbox — o mesmo que
   * `toggleTaskListItem(content, index)` espera — e é responsabilidade de quem passa reescrever o
   * Markdown e gravar.
   *
   * **Sem o handler, o checkbox continua `disabled`**, que é como a descrição de tarefa se
   * comporta: lá o Markdown é do campo de descrição, não um documento que o preview possa editar.
   *
   * `onToggleTask` é o mesmo contrato sob o nome da feature 070.
   */
  onToggleTaskItem?: (index: number) => void;
  onToggleTask?: (index: number) => void;
}) {
  const toggleTask = onToggleTask ?? onToggleTaskItem;

  /**
   * Os renderers do registry entram **antes** dos do consumidor: quem passa `components` continua
   * podendo sobrescrever qualquer elemento, `code`/`pre` inclusive.
   */
  const merged = useMemo<Components>(
    () => ({
      ...BLOCK_REGISTRY_COMPONENTS,
      ...TYPOGRAPHY_COMPONENTS,
      ...CALLOUT_COMPONENTS,
      ...(toggleTask ? taskCheckboxComponents(toggleTask) : null),
      ...components,
    }),
    [components, toggleTask]
  );

  return (
    <div className={cn(PREVIEW_CLASS, className)}>
      <ReactMarkdown
        remarkPlugins={MARKDOWN_REMARK_PLUGINS}
        rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
        remarkRehypeOptions={REMARK_REHYPE_OPTIONS}
        components={merged}
        urlTransform={urlTransform}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Rótulos das footnotes do GFM. Sem isto o `mdast-util-gfm-footnote` escreve "Footnotes" e
 * "Back to reference 1" — texto em inglês, invisível na tela mas lido em voz alta por leitor de
 * tela num app inteiro em português.
 */
const REMARK_REHYPE_OPTIONS = {
  footnoteLabel: "Notas de rodapé",
  footnoteBackLabel: (referenceIndex: number) =>
    `Voltar à referência ${referenceIndex + 1}`,
};

/**
 * Ponte entre o Markdown e o registry de blocos (feature 057): ` ```<lang> ` com renderer
 * registrado é desenhado por ele; sem renderer, nada muda em relação ao comportamento anterior.
 */
const BLOCK_REGISTRY_COMPONENTS: Components = {
  code(props) {
    /**
     * `$…$` chega como código **inline** com a classe `math-inline`. Ele precisa ser
     * desviado antes do registry: lá dentro a linguagem também é `math`, e o bloco de display
     * quebraria a linha no meio da frase.
     */
    if (isInlineMath(props.className)) {
      return <InlineMath code={blockCode(props.children)} />;
    }
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
   * fonte monoespaçada, que amassam um SVG. Fence comum (com ou sem linguagem) é desenhado pelo
   * `CodeBlock`, que continua entregando um `<pre><code>` por dentro — a diferença é o cabeçalho,
   * o botão de copiar e a cor.
   *
   * O bloco é decidido **aqui**, e não no override de `code`, porque só o `<pre>` distingue fence
   * de código inline: os dois chegam como `<code>`, e um fence sem linguagem não tem nem
   * `className` para diferenciar.
   */
  pre(props) {
    if (hasRegisteredBlock(props.node)) return <>{props.children}</>;
    const fence = readFence(props.node);
    if (fence) {
      // Os children já passaram pelo `rehype-highlight` (spans `hljs-*`); o CodeBlock só
      // acrescenta cabeçalho/copiar em volta, sem re-realçar.
      return (
        <CodeBlock code={fence.code} language={fence.language}>
          <pre>
            {props.children}
          </pre>
        </CodeBlock>
      );
    }
    const { children, ...rest } = withoutNode(props);
    return <pre {...rest}>{children}</pre>;
  },
};

/**
 * Overrides de tipografia que **não** cabem em CSS: mudam a árvore, não a aparência.
 * O resto da folha mora em `.markdown-body`, em `src/index.css`.
 */
const TYPOGRAPHY_COMPONENTS: Components = {
  h1: headingComponent("h1"),
  h2: headingComponent("h2"),
  h3: headingComponent("h3"),
  h4: headingComponent("h4"),
  h5: headingComponent("h5"),
  h6: headingComponent("h6"),
  /**
   * Tabela larga rola dentro de si, nunca na página. Sem este embrulho, uma tabela de nota com
   * muitas colunas empurra o layout inteiro e cria scroll horizontal no `body` — que, além de feio,
   * quebra a leitura no celular. É CSS demais para o `<table>` sozinho: `overflow-x` não funciona
   * em elemento de tabela, precisa de um bloco em volta.
   */
  table(props) {
    const { children, ...rest } = withoutNode(props);
    return (
      <div className={cn(MARKDOWN_TABLE_WRAPPER_CLASS, "markdown-table-scroll")}>
        <table {...rest}>{children}</table>
      </div>
    );
  },
};

/**
 * `> [!NOTE]` marcado pelo `remarkCallout` vira caixa; blockquote comum continua blockquote.
 * A decisão de "é callout?" já foi tomada no parser — aqui só se lê o atributo. Título opcional
 * (dialeto Obsidian) vem em `data-callout-title`.
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

/**
 * Título com âncora `#` ao lado. O `id` já vem no nó, posto por `rehypeHeadingIds`
 * (que é quem enxerga a nota inteira e desempata títulos repetidos); aqui só se desenha o link
 * para ele.
 *
 * A âncora é escrita **em JSX**, e não posta na árvore pelo plugin, porque um `<a>` vindo da
 * árvore passaria pelo override de `a` de quem consome o preview — no módulo de Notas, o do
 * wiki-link (056), que manda link externo abrir em outra aba. Âncora de seção tem que rolar a
 * página, não abrir aba.
 *
 * Título da seção de rodapé (`id="footnote-label"`, invisível) não ganha `#`: ele não é um lugar
 * para onde alguém queira mandar link.
 */
/** Rótulo da âncora de título — o mesmo texto usado pelos testes de heading. */
export const HEADING_ANCHOR_LABEL = "Link para esta seção";

function headingComponent(tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") {
  return function Heading(props: JSX.IntrinsicElements[typeof tag] & { node?: Element }) {
    const { children, className, ...rest } = withoutNode(props);
    const id = typeof rest.id === "string" ? rest.id : undefined;
    const anchored = id && id !== FOOTNOTE_LABEL_ID;

    return createElement(
      tag,
      {
        ...rest,
        // `group` habilita o hover da âncora (estilo master) sem brigar com a folha CSS.
        className: cn(className, anchored && "group"),
      },
      children,
      anchored ? (
        <a
          key="anchor"
          className="markdown-heading-anchor opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          href={`#${id}`}
          /**
           * Fora da árvore de acessibilidade, como o GitHub faz. O nome acessível de um título
           * inclui o texto dos descendentes: sem isto, todo `<h2>Seção</h2>` passaria a se chamar
           * "Seção Link para esta seção" para um leitor de tela.
           */
          aria-hidden="true"
          tabIndex={-1}
          title={HEADING_ANCHOR_LABEL}
        >
          #
        </a>
      ) : null
    );
  };
}

/**
 * Checkbox de tarefa clicável. O índice vem do `rehypeTaskIndex`, que numerou as caixas na mesma
 * ordem em que `toggleTaskListItem` as conta no texto.
 *
 * O `<input>` continua **controlado pelo markdown**: `checked` vem do documento e o clique só
 * avisa quem edita o texto. Se a escrita de volta falhar, a caixa volta sozinha para o que está
 * escrito, em vez de mentir na tela.
 *
 * Sem `readOnly` de propósito, mesmo a caixa não sendo editável pelo DOM: o `@testing-library/
 * user-event` se recusa a clicar em campo `readOnly` (e um clique que o teste não consegue dar é um
 * clique que ninguém garante). O `onChange` já basta para o React não reclamar de campo controlado.
 */
function taskCheckboxComponents(onToggleTask: (index: number) => void): Components {
  return {
    input(props) {
      const { node, ...rest } = props;
      const index = readTaskIndex(node);
      if (rest.type !== "checkbox" || index === null) {
        return <input {...rest} />;
      }
      return (
        <input
          {...rest}
          disabled={false}
          aria-label={`Tarefa ${index + 1}`}
          className="cursor-pointer"
          onChange={() => onToggleTask(index)}
        />
      );
    },
  };
}

function readTaskIndex(node: Element | undefined): number | null {
  const value = node?.properties?.[TASK_INDEX_ATTR];
  if (typeof value === "number") return value;
  if (typeof value === "string" && value !== "") return Number(value);
  return null;
}

/** O `remark-gfm` põe este `id` no rótulo invisível da seção de notas de rodapé. */
const FOOTNOTE_LABEL_ID = "footnote-label";

/**
 * A classe que o `remark-math` põe no `$…$`. É dele, não nossa — por isso a constante mora ao lado
 * de quem a lê, com o nome do plugin no comentário.
 */
const MATH_INLINE_CLASS = "math-inline";

function isInlineMath(className?: string): boolean {
  if (!className) return false;
  return className.split(/\s+/).includes(MATH_INLINE_CLASS);
}

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
  const code = fenceCode(node);
  if (!code) return false;
  return findBlockRenderer(classNameOf(code)) !== null;
}

/**
 * O conteúdo cru do fence, lido do hast: texto e linguagem (`null` quando o fence não declarou
 * nenhuma). `null` inteiro quando o `<pre>` não embrulha um `<code>` — o que não acontece vindo do
 * Markdown, mas é a saída honesta se um dia acontecer.
 */
function readFence(
  node: Element | undefined
): { code: string; language: string | null } | null {
  const code = fenceCode(node);
  if (!code) return null;
  return {
    code: hastText(code).replace(/\n$/, ""),
    language: parseBlockLanguage(classNameOf(code)),
  };
}

function fenceCode(node: Element | undefined): Element | null {
  const child = node?.children?.[0];
  if (!child || child.type !== "element" || child.tagName !== "code") return null;
  return child;
}

function classNameOf(node: Element): string | null {
  const className = node.properties?.className;
  if (Array.isArray(className)) return className.join(" ");
  if (typeof className === "string") return className;
  return null;
}

/** Todo o texto do nó, na ordem — dentro de um fence isso é o código inteiro. */
function hastText(node: Element): string {
  let text = "";
  for (const child of node.children) {
    if (child.type === "text") text += child.value;
    else if (child.type === "element") text += hastText(child);
  }
  return text;
}
