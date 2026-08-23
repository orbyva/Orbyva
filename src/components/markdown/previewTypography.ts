/**
 * # Tipografia do Markdown renderizado (feature 067)
 *
 * Isto era uma única string de ~30 utilitários dentro do `MarkdownPreview.tsx`, e o problema não era
 * o tamanho: era o que **faltava** nela. `blockquote`, `hr`, `h3`–`h6`, lista aninhada, `pre` e
 * nota de rodapé não tinham estilo nenhum — o Tailwind zera a folha do navegador, então uma citação
 * saía igual a um parágrafo e um `---` sumia da tela. Escrever bem depende de o texto renderizado
 * mostrar a hierarquia que o autor escreveu.
 *
 * O nome `MARKDOWN_PREVIEW_CLASS` continua igual e continua reexportado por `MarkdownPreview.tsx`,
 * de propósito: nenhum consumidor precisou mudar de import.
 *
 * As regras usam a sintaxe de seletor arbitrário do Tailwind (`[&_h3]:…`) porque quem gera esse
 * HTML é o `react-markdown` em tempo de execução — não há onde pendurar `className` elemento a
 * elemento sem escrever um `components` para cada tag.
 */
const TYPOGRAPHY = [
  // Base
  "min-h-[80px] space-y-2 text-sm",

  // Títulos: uma escala curta, porque nota não é página de marketing.
  "[&_h1]:text-base [&_h1]:font-semibold",
  "[&_h2]:text-sm [&_h2]:font-semibold",
  "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-muted-foreground",
  "[&_h4]:text-xs [&_h4]:font-semibold [&_h4]:uppercase [&_h4]:tracking-wide [&_h4]:text-muted-foreground",
  "[&_h5]:text-xs [&_h5]:font-semibold [&_h5]:text-muted-foreground",
  "[&_h6]:text-xs [&_h6]:font-medium [&_h6]:text-muted-foreground",

  // Inline
  "[&_a]:text-primary [&_a]:underline",
  "[&_del]:text-muted-foreground",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs",

  /**
   * Bloco de código. O `code` de dentro do `pre` **desfaz** o chip inline acima: com fundo e
   * padding próprios, cada linha do bloco viraria uma pílula cinza.
   */
  "[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:bg-muted/40 [&_pre]:p-3",
  "[&_pre_code]:block [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:leading-relaxed",

  // Listas, incluindo o aninhamento (marcador diferente por nível, como no Markdown impresso).
  "[&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-4",
  "[&_ul_ul]:list-[circle] [&_ul_ul_ul]:list-[square] [&_ol_ol]:list-[lower-alpha]",
  "[&_li>ul]:mt-1 [&_li>ol]:mt-1",
  // Checklist do GFM: sem marcador, e o checkbox alinhado com a primeira linha do texto.
  "[&_.contains-task-list]:list-none [&_.task-list-item]:ml-0",
  "[&_.task-list-item>input]:mr-1.5 [&_.task-list-item>input]:align-middle",

  // Citação e régua — os dois que sumiam por completo sem estilo.
  "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_hr]:my-4 [&_hr]:border-t [&_hr]:border-border",

  // Tabela. A largura fica com o wrapper rolável (ver `MARKDOWN_TABLE_WRAPPER_CLASS`).
  "[&_table]:w-full [&_table]:border-collapse",
  "[&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:font-medium",
  "[&_td]:border [&_td]:px-2 [&_td]:py-1",

  /**
   * Nota de rodapé do GFM. O parser já a produzia; sem estas regras ela aparecia como um `<ol>`
   * solto no fim do texto, do mesmo tamanho do corpo, sem nada indicando que era rodapé.
   */
  "[&_.footnotes]:mt-6 [&_.footnotes]:border-t [&_.footnotes]:pt-2 [&_.footnotes]:text-xs [&_.footnotes]:text-muted-foreground",
  "[&_[data-footnote-ref]]:text-primary [&_[data-footnote-ref]]:no-underline",
  "[&_[data-footnote-backref]]:no-underline",
].join(" ");

/** Tipografia do Markdown renderizado — compartilhada por descrição de tarefa e nota. */
export const MARKDOWN_PREVIEW_CLASS = TYPOGRAPHY;

/**
 * Wrapper de `<table>`.
 *
 * Sem ele, a primeira tabela de verdade que o usuário escrever estica a página inteira: `table` com
 * `w-full` e conteúdo largo empurra o layout, e a barra de rolagem horizontal aparece no `body`, não
 * na tabela. `overflow-x: auto` num container próprio mantém a rolagem dentro da tabela — é o bug
 * de layout mais provável desta feature, e o mais barato de evitar.
 */
export const MARKDOWN_TABLE_WRAPPER_CLASS = "w-full overflow-x-auto";
