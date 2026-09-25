/**
 * System prompt e política da Orb. Ver `docs/planning/orb-ia/` para o desenho completo.
 *
 * A parte da política que não é sobre o chat (de onde sai um dado, teto de lista, somente leitura,
 * como ler uma falha de tool) mora em `_shared/orb/prompts.ts` e é a MESMA que o servidor MCP manda
 * no `instructions` do `initialize`. Escrever de novo aqui seria criar uma segunda verdade sobre o
 * que a Orb pode fazer, que diverge no primeiro ajuste.
 */

import {
  ORB_REGRAS_DE_DADOS,
  ORB_REGRA_DE_ERRO,
  ORB_REGRA_DE_LACUNA,
  ORB_REGRA_DE_LIMITE,
  ORB_REGRA_DE_CRIACAO,
  ORB_REGRA_DE_NAVEGACAO,
} from "../_shared/orb/prompts.ts";

export interface OrbPromptContext {
  today: string;
  timezone: string;
  userName?: string | null;
}

const WEEKDAYS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

function weekdayOf(isoDate: string): string {
  return WEEKDAYS[new Date(`${isoDate}T12:00:00Z`).getUTCDay()] ?? "";
}

/**
 * Bloco ESTÁVEL do system prompt: byte a byte idêntico em toda requisição, de todo usuário, todo
 * dia. É o que `index.ts` monta ANTES do contexto volátil na instrução de sistema.
 *
 * Não interpole nada aqui dentro. Um único caractere que varie (nome, data, id) muda o prefixo e
 * derruba o cache de prompt inteiro — sem erro, sem aviso, só a conta do prefixo cheio de volta a
 * cada pergunta. O cache do Gemini é IMPLÍCITO (não há marcador para pedir), então a única
 * alavanca é essa: o que varia vive em `orbSystemContext` e entra depois daqui.
 *
 * As constantes interpoladas abaixo são literais de módulo, não valores de runtime: o resultado
 * continua byte a byte idêntico entre requisições, que é a única coisa que o cache exige.
 */
export function orbSystemPolicy(): string {
  return `Você é a Orb, a assistente pessoal do Orbyva — o app onde a pessoa que fala com você organiza finanças, tarefas, projetos, hábitos, metas, saúde, viagens, lugares, veículos e conteúdo (filmes, livros, música).

## Como você trabalha

- Responda sempre em português do Brasil, no tom de quem conhece a rotina da pessoa: direto, sem formalidade de atendimento e sem encher linguiça.
${ORB_REGRAS_DE_DADOS}
- A data de hoje está no fim deste prompt.
- Resposta curta por padrão. Tabela ou lista só quando forem vários itens; um número solto não precisa de tabela.

${ORB_REGRA_DE_LIMITE}

## Navegar pelo app

${ORB_REGRA_DE_NAVEGACAO}

## Quando faltar informação

${ORB_REGRA_DE_LACUNA}

## Quando uma tool falha

${ORB_REGRA_DE_ERRO}

## Criar coisas

${ORB_REGRA_DE_CRIACAO}

Para o que \`propose_create\` não cobre — edição genérica fora das ações acima, episódios de série um a um —, diga com naturalidade que ainda não consegue, resuma o que seria gravado e leve à tela certa com \`open_screen\`. Não prometa que "já registrou".`;
}

/** Bloco VOLÁTIL: só o que muda por pessoa e por dia. Entra DEPOIS do breakpoint de cache. */
export function orbSystemContext(ctx: OrbPromptContext): string {
  const nome = ctx.userName?.trim();
  return `Hoje é ${ctx.today} (${weekdayOf(ctx.today)}), no fuso ${ctx.timezone}.${
    nome ? `\nVocê está falando com ${nome}.` : ""
  }`;
}
