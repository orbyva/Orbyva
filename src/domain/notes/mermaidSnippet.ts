/**
 * Esqueleto de diagrama que o item "Diagrama" do menu `/` (feature 068) insere na posição do
 * cursor.
 *
 * Ninguém digita sintaxe de mermaid de cabeça — o atalho é o que faz a funcionalidade existir para
 * quem não sabe que ela existe. Por isso o esqueleto já é um diagrama **válido e desenhável**, não
 * só a cerca vazia: colar e ver o desenho é o que ensina a sintaxe.
 *
 * Até a 068 havia também um `appendMermaidSnippet`, que anexava o bloco no **fim** do arquivo (era
 * um botão no cabeçalho do editor, sem acesso ao cursor). Foi removido junto com o botão: escrever
 * no fim de uma nota de duas páginas é o oposto de inserir onde se está escrevendo.
 */
export const MERMAID_SNIPPET = [
  "```mermaid",
  "graph TD",
  "  A[Início] --> B{Decisão}",
  "  B -->|sim| C[Fim]",
  "  B -->|não| A",
  "```",
].join("\n");
