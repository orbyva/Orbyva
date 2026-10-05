/**
 * Instrução do modelo de imagem para gerar uma versão da Orb. Puro. A parte fixa vem antes e o
 * pedido do usuário no fim, como em `orb-agent/prompt.ts`: o volátil vai por último.
 */

const ORB_IMAGE_INSTRUCTION = [
  "Gere a imagem de uma versão da Orb, a assistente de IA do app Orbyva.",
  "A Orb é uma esfera: o assunto é sempre uma esfera única, centralizada, ocupando a maior parte do quadro.",
  "Formato quadrado 1:1, pensado para aparecer pequeno, como avatar redondo.",
  "Fundo liso de uma cor só, sem cenário, sem degradê de fundo e sem padrão xadrez imitando transparência.",
  "Sem texto, sem letras, sem logotipo e sem marca d'água.",
  "Saída em PNG.",
  "Se vierem imagens de referência, use-as como inspiração de cor, textura e estilo — a forma continua sendo a esfera.",
].join("\n");

export function buildOrbImagePrompt(userPrompt: string): string {
  return `${ORB_IMAGE_INSTRUCTION}\n\nPedido do usuário:\n${userPrompt.trim()}`;
}
