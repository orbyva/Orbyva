/**
 * Esqueleto de diagrama que o botão "Inserir diagrama" do editor joga na nota.
 *
 * Ninguém digita sintaxe de mermaid de cabeça — o atalho é o que faz a funcionalidade existir para
 * quem não sabe que ela existe. Por isso o esqueleto já é um diagrama **válido e desenhável**, não
 * só a cerca vazia: colar e ver o desenho é o que ensina a sintaxe.
 */
export const MERMAID_SNIPPET = [
  "```mermaid",
  "graph TD",
  "  A[Início] --> B{Decisão}",
  "  B -->|sim| C[Fim]",
  "  B -->|não| A",
  "```",
].join("\n");

/**
 * Acrescenta o esqueleto ao fim do conteúdo, separado por uma linha em branco (o Markdown precisa
 * dela para não grudar o bloco no parágrafo anterior) e sem empilhar linhas vazias quando o texto
 * já termina em branco. Nota vazia recebe só o esqueleto.
 */
export function appendMermaidSnippet(content: string): string {
  const body = content.replace(/\s+$/, "");
  if (!body) return `${MERMAID_SNIPPET}\n`;
  return `${body}\n\n${MERMAID_SNIPPET}\n`;
}
