/**
 * # Checklist do Markdown, do lado do dado (feature 067)
 *
 * Clicar num `- [ ]` do preview precisa reescrever o Markdown de origem — e essa reescrita é a
 * parte perigosa da funcionalidade, não o clique. Um `content.replace("- [ ]", "- [x]")` ingênuo
 * marca o item errado, estraga indentação e altera exemplo dentro de bloco de código. Por isso a
 * lógica mora aqui, pura e testável, e não dentro do componente.
 *
 * **O índice é o mesmo que o navegador enxerga.** O que o usuário clica é o n-ésimo `<input
 * type="checkbox">` da tela, e a ordem dos checkboxes é a ordem dos itens no texto — desde que se
 * pule o que o GFM não transforma em checkbox: qualquer coisa dentro de bloco de código cercado.
 * Manter as duas contagens iguais é o contrato deste módulo.
 */

export type TaskListItem = {
  /** Posição na contagem de checkboxes da tela — o que o `onToggleTaskItem` recebe. */
  index: number;
  /** Linha (base 0) onde o item está no conteúdo. */
  line: number;
  checked: boolean;
  /** Texto do item, sem o marcador de lista nem o `[ ]`. */
  text: string;
};

/**
 * Item de lista com checkbox: espaço à vontade, marcador de citação opcional (`>`), marcador de
 * lista (`-`, `*`, `+`, `1.`, `1)`), e o `[ ]`/`[x]` seguido de espaço ou fim de linha — que é o
 * que o GFM exige para virar checkbox de verdade.
 *
 * O `\r?$` do fim não é decoração: em JavaScript `.` não casa `\r` e `$` (sem a flag `m`) não para
 * antes dele, então sem isso um arquivo com quebra de linha do Windows não teria checkbox nenhum.
 */
const TASK_ITEM_RE =
  /^([ \t]*(?:>[ \t]?)*[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+\[)([ xX])(\][ \t]?)(.*)\r?$/;

/** Cerca de bloco de código (``` ou ~~~), já sem os `>` de uma citação. */
const FENCE_RE = /^[ \t]{0,3}(`{3,}|~{3,})/;
/** Prefixo de citação, para olhar a linha "como se" ela não estivesse dentro de um `>`. */
const QUOTE_PREFIX_RE = /^[ \t]*(?:>[ \t]?)*/;

/**
 * Todos os checkboxes do conteúdo, na mesma ordem em que aparecem na tela.
 *
 * Checkbox dentro de bloco de código **não entra**: ali ele é texto de exemplo, o GFM não o
 * transforma em `<input>`, e contá-lo desalinharia todos os índices seguintes.
 */
export function extractTaskListItems(content: string): TaskListItem[] {
  const items: TaskListItem[] = [];
  let index = 0;

  eachContentLine(content, (line, lineNumber) => {
    const match = TASK_ITEM_RE.exec(line);
    if (!match) return;
    items.push({
      index: index++,
      line: lineNumber,
      checked: match[2] !== " ",
      text: match[4].trim(),
    });
  });

  return items;
}

/**
 * Marca/desmarca o checkbox de índice `index` e devolve o conteúdo novo.
 *
 * O resto do arquivo sai **byte a byte igual**: só o caractere de dentro dos colchetes muda. Isso
 * importa porque o retorno vai direto para o autosave da nota — qualquer normalização aqui (aparar
 * espaço, trocar `*` por `-`, reescrever quebra de linha) seria uma edição que o usuário não pediu.
 *
 * Índice fora de faixa devolve o conteúdo original, sem exceção: o preview pode estar uma
 * renderização atrás do texto, e travar a nota por causa disso seria pior que não fazer nada.
 */
export function toggleTaskListItem(content: string, index: number): string {
  if (!Number.isInteger(index) || index < 0) return content;

  const lines = content.split("\n");
  let seen = -1;
  let target = -1;

  eachContentLine(content, (line, lineNumber) => {
    if (target !== -1) return;
    if (!TASK_ITEM_RE.test(line)) return;
    if (++seen === index) target = lineNumber;
  });

  if (target === -1) return content;

  const match = TASK_ITEM_RE.exec(lines[target]);
  if (!match) return content;

  // Só o caractere de dentro dos colchetes muda; o resto da linha é recortado da original, para
  // não haver como reescrever sem querer o que veio depois.
  const [, prefix, state] = match;
  const line = lines[target];
  lines[target] =
    prefix + (state === " " ? "x" : " ") + line.slice(prefix.length + 1);
  return lines.join("\n");
}

/**
 * Percorre as linhas que contam como conteúdo, pulando o interior de bloco de código cercado.
 *
 * A cerca é reconhecida mesmo dentro de citação (` > ``` `), e fechar exige o mesmo caractere e
 * pelo menos o mesmo comprimento da abertura — a regra do CommonMark, que é o que impede uma linha
 * com três crases dentro de um bloco aberto com quatro de fechá-lo cedo demais.
 */
function eachContentLine(
  content: string,
  onLine: (line: string, lineNumber: number) => void
): void {
  const lines = content.split("\n");
  let openFence: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bare = line.replace(QUOTE_PREFIX_RE, "");
    const fence = FENCE_RE.exec(bare)?.[1];

    if (openFence) {
      if (
        fence &&
        fence[0] === openFence[0] &&
        fence.length >= openFence.length &&
        bare.slice(fence.length).trim() === ""
      ) {
        openFence = null;
      }
      continue;
    }

    if (fence) {
      openFence = fence;
      continue;
    }

    onLine(line, i);
  }
}
