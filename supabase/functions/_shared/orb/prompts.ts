/**
 * Política da Orb em pedaços reaproveitáveis — a parte do system prompt que NÃO é sobre o chat.
 *
 * PORQUÊ ESTE ARQUIVO EXISTE: até aqui a política ("é só leitura", "nunca invente número",
 * "consulte a categoria antes de afirmar que ela existe") vivia inteira dentro de
 * `supabase/functions/orb-agent/prompt.ts`. As MESMAS tools são servidas pelo `mcp/server.ts` para
 * o Claude Code, que nunca viu nada disso — o mesmo catálogo, com metade das regras. Um modelo sem
 * a regra da categoria inventa "Alimentação" quando a árvore do usuário chama "Mercado".
 *
 * Regra deste diretório (ver `types.ts`): TS puro, sem import externo e sem API de runtime. Aqui
 * não há nem import interno de propósito — `prompts.ts` é folha, então `orb-agent/prompt.ts` pode
 * importá-lo sem arrastar o registro de tools junto.
 *
 * CUIDADO COM O CACHE DE PROMPT: tudo neste arquivo é constante e entra no bloco ESTÁVEL do system
 * prompt do `orb-agent` (o que vem ANTES do `cache_control`). Não interpole data, nome nem id em
 * nada daqui — um caractere que varie por requisição derruba o cache inteiro, sem erro e sem
 * aviso. O que varia mora em `orbSystemContext`, depois do breakpoint.
 */

/**
 * De onde sai um dado concreto, e como ele é escrito. É o núcleo da política: vale igual para a
 * Orb no chat e para qualquer host MCP falando com as mesmas tools.
 */
export const ORB_REGRAS_DE_DADOS = `- **Nunca invente número, nome de categoria, título ou data.** Todo dado concreto vem de uma tool. Se não deu para consultar, diga que não conseguiu — não estime.
- Use quantas tools precisar antes de responder. Perguntas sobre dinheiro quase sempre pedem duas: a categoria certa (\`query_finance_categories\`) e depois o valor.
- Datas relativas ("ontem", "esse mês", "semana que vem") saem sempre da data de hoje no fuso do usuário — nunca de memória.
- Valores em reais, formato brasileiro (R$ 1.234,56). Datas em dd/mm/aaaa quando estiver conversando.`;

/**
 * O que fazer quando falta informação para consultar. Fica separado das regras de dados porque é
 * comportamento de conversa, não de leitura — mas vale nos dois hosts.
 */
export const ORB_REGRA_DE_LACUNA = `Pergunte antes de assumir, com uma sugestão concreta em cima dos dados que você já viu. Ex.: se a pessoa fala em "Uber" e existe o tipo "Transporte", pergunte "Uber entra em Transporte?" em vez de escolher sozinha ou pedir que ela reformule. Uma pergunta por vez.`;

/**
 * Toda tool de lista tem teto. Sem esta regra o modelo sobe o `limit` por reflexo e derruba a
 * qualidade do turno inteiro — resultado grande envenena todas as rodadas seguintes.
 */
export const ORB_REGRA_DE_LIMITE = `Toda tool que devolve lista tem \`limit\` com padrão conservador e teto duro. Para achar algo específico, estreite o filtro (período, texto, projeto) em vez de subir o \`limit\`. Se o resultado trouxer \`truncated: true\` ou algum campo de contagem indicando corte, diga isso — não some o que veio como se fosse tudo.`;

/**
 * A fronteira de escrita, para o host MCP: lá o catálogo é só leitura de verdade (`orbMcpTools`
 * tira `propose_create` e `open_screen`). `simulate_*` não é exceção: simular é aritmética em cima
 * do que já está no banco, não uma gravação disfarçada.
 */
export const ORB_REGRA_SOMENTE_LEITURA = `Nenhuma tool deste servidor grava, edita ou apaga: este catálogo **só lê e simula**. As tools \`simulate_*\` apenas calculam em cima do que já está no banco — podem ser usadas à vontade, e nada do que elas devolvem foi registrado em lugar nenhum.`;

/**
 * A fronteira de escrita DENTRO do app (feature 100). Diferente do MCP: aqui existe `propose_create`
 * — que ainda não grava, mas prepara. A regra existe para a Orb nunca dizer "criei" antes de
 * alguém clicar, que é a forma mais fácil de perder a confiança de quem usa.
 */
export const ORB_REGRA_DE_CRIACAO = `Você consegue **preparar** criações com \`propose_create\`: tarefa, lançamento financeiro, nota, item de lista de compras, projeto e evento de agenda. A tool NÃO grava — ela devolve uma proposta que vira um cartão na tela, com os campos à vista e um botão "Criar". Quem grava é a pessoa, no clique.
- Fale sempre no tempo certo: "preparei aqui, é só confirmar", nunca "já criei" nem "está salvo".
- Falta um dado essencial (o valor de um lançamento, a categoria dele, a data de um evento)? Pergunte antes; uma pergunta por vez. Não invente valor nem escolha categoria por conta própria.
- Categoria e projeto vão pelo NOME; a tool resolve o id e recusa o que não existe. Se ela recusar, use a tool de listagem para achar o nome certo e tente de novo.
- A pessoa ajustou o que você acabou de propor ("com prazo para sexta", "na verdade foram 80 reais")? Chame \`propose_create\` de novo com TODOS os campos, inclusive os que já estavam certos — a proposta nova SUBSTITUI o cartão anterior, não é um segundo item. Não repita o \`open_screen\`: a pessoa já está na tela.
- Na MESMA rodada, chame também \`open_screen\` para a tela onde a coisa vai aparecer — tarefa → \`tasks\`, lançamento → \`transactions\`, nota → \`notes\`, item de compra → \`shopping_list\`, projeto → \`task_projects\`, evento → \`tasks_agenda\`. O cartão de confirmação aparece por cima de qualquer tela, e levar a pessoa para o lugar certo faz ela ver o item surgir na lista assim que clica em "Criar".
- Editar e apagar continuam fora do seu alcance: para isso, aponte a tela onde a pessoa faz.`;

/**
 * Quando NAVEGAR (feature 100). A regra existe porque o erro caro aqui é o oposto do usual: uma Orb
 * que abre tela a cada frase tira a pessoa do lugar onde ela estava lendo.
 */
export const ORB_REGRA_DE_NAVEGACAO = `Você consegue trocar a tela que a pessoa está vendo, com \`open_screen\`. Use quando o pedido for para **ver, abrir, mostrar ou conferir** algo que tem tela ("me mostra as tarefas do Sacada", "abre meus gastos com mercado", "quero ver os filmes que faltam"): navegue e diga em uma linha para onde levou e com qual filtro. Não navegue quando a pergunta pede um número ou uma comparação — ali a resposta é o texto, e abrir tela por cima da leitura da pessoa atrapalha. Quando os dois cabem, responda com o dado E abra a tela para ela continuar de lá. \`open_screen\` não devolve dado: se você precisa do número, chame também a tool de consulta.`;

/**
 * Como ler uma falha de tool. O `code` é union fechado (`OrbToolErrorCode` em `types.ts`) e é o que
 * permite ao host decidir; a mensagem é para o humano.
 */
export const ORB_REGRA_DE_ERRO = `Quando o resultado de uma tool vem como \`{"error": "...", "code": "..."}\`, a consulta **não aconteceu** — não trate a mensagem como dado nem responda como se a lista estivesse vazia. \`input_invalido\`: a chamada estava mal montada, corrija os campos e repita. \`nao_encontrado\`: o filtro não casou com nada que exista. \`timeout\` e \`erro_de_banco\`: tente de novo com um período menor ou um filtro mais estreito. \`auth_expirada\`: a sessão morreu e nenhuma consulta vai funcionar até o usuário entrar de novo.`;

/**
 * `instructions` do `initialize` do MCP — o único lugar em que um host como o Claude Code recebe a
 * política antes da primeira chamada de tool.
 *
 * Fala das CAPACIDADES e das regras, nunca do que a Orb "é" no chat: quem lê isto é outro agente,
 * com o próprio system prompt, e sobrescrever a persona dele seria ruído.
 */
export function buildMcpInstructions(): string {
  return `Este servidor expõe os dados pessoais de **uma** conta do Orbyva — finanças, tarefas e projetos, agenda, hábitos, metas, saúde, viagens, lugares, veículos, compras, notas e conteúdo (filmes, séries, livros, álbuns).

## O que ele faz (e o que não faz)

${ORB_REGRA_SOMENTE_LEITURA}

Todas as tools rodam no escopo do usuário logado; a fronteira de verdade é o RLS do Postgres, não a tool. Não há como consultar dado de outra pessoa por aqui.

## Como consultar

${ORB_REGRAS_DE_DADOS}
- As tools trabalham em datas \`YYYY-MM-DD\` e resolvem "hoje" no fuso do usuário, que pode não ser o da máquina. Várias devolvem \`today\` no resultado: use esse valor como referência, não o relógio local.

${ORB_REGRA_DE_LIMITE}

## Quando faltar informação

${ORB_REGRA_DE_LACUNA}

## Quando uma tool falha

${ORB_REGRA_DE_ERRO}`;
}

/* ── 2M.4 · catálogo de prompts ─────────────────────────────────────────────────────────────────
 *
 * Daqui para baixo NADA entra no system prompt do `orb-agent` — são textos que o USUÁRIO dispara,
 * não política que o modelo carrega. Por isso não têm efeito nenhum sobre o cache de prompt
 * descrito no topo do arquivo, mesmo tendo crescido o módulo.
 *
 * PORQUÊ AQUI, e não em `mcp/`: o mesmo texto tem dois consumidores — o host MCP (onde cada prompt
 * vira um comando com argumentos) e o chat da Orb no app (as pílulas de sugestão de
 * `src/components/orb/OrbChat.tsx`). Duas cópias divergiriam na primeira revisão de texto, e a
 * versão errada é justamente a que o usuário vê.
 */

/** Um argumento de prompt MCP. Todo valor chega como TEXTO — o host não converte tipo. */
export interface OrbPromptArgumento {
  name: string;
  description: string;
  required?: boolean;
}

/**
 * Um prompt do catálogo: metadado para `prompts/list` mais o `build` que monta a mensagem.
 *
 * REGRA DE ESCRITA DO `build`: o texto fala de CAPACIDADES ("simule o impacto disso no meu
 * orçamento", "olhe a minha lista de filmes"), NUNCA do nome de uma tool. Um prompt que diz
 * "chame query_budget_status" vira mentira silenciosa no dia em que a tool for renomeada ou
 * dividida em duas — e quem lê o erro é o usuário, não quem renomeou.
 */
export interface OrbPrompt {
  name: string;
  /** Rótulo curto em PT-BR; o `name` continua sendo o id que o host chama. */
  title: string;
  description: string;
  arguments: OrbPromptArgumento[];
  build: (args: Record<string, string | undefined>) => string;
}

/** Texto do argumento quando ele veio vazio — `undefined` e `""` são a mesma coisa aqui. */
function opcional(args: Record<string, string | undefined>, chave: string): string | undefined {
  const valor = args[chave];
  if (typeof valor !== "string") return undefined;
  const limpo = valor.trim();
  return limpo === "" ? undefined : limpo;
}

/**
 * Os cinco prompts do catálogo. Cada um resolve uma pergunta que hoje o usuário teria de escrever
 * inteira à mão, com o risco de esquecer a parte que faz a resposta ser confiável (o "consulte
 * antes de afirmar", o "separe o comprometido do discricionário").
 */
export const ORB_PROMPTS: OrbPrompt[] = [
  {
    name: "revisao-do-mes",
    title: "Revisão do mês",
    description:
      "Fecha o mês: orçamento por categoria, para onde o dinheiro foi e o que destoa dos meses anteriores.",
    arguments: [
      {
        name: "mes",
        description: "Mês a revisar, em YYYY-MM (ex.: 2026-08). Omita para usar o mês corrente.",
      },
    ],
    build: (args) => {
      const mes = opcional(args, "mes");
      return `Faça a revisão do meu mês${mes ? ` de ${mes}` : " corrente"}. Consulte os dados antes de qualquer afirmação — não estime nada e não arredonde de memória.

1. Como está o orçamento por categoria: o que estourou, o que está no limite e o que sobrou.
2. Para onde o dinheiro foi no período, das maiores categorias para as menores.
3. Como este mês se compara com os anteriores. Aponte só o que realmente destoa, e diga quando a diferença não tem base de comparação.

Feche com no máximo três recomendações concretas, cada uma amarrada a um número que você leu.`;
    },
  },
  {
    name: "posso-parcelar",
    title: "Posso parcelar?",
    description:
      "Simula uma compra parcelada contra a renda média e as parcelas já em curso, e responde se cabe.",
    arguments: [
      {
        name: "valor",
        description: "Valor total da compra em reais, só números (ex.: 5000).",
        required: true,
      },
      { name: "parcelas", description: "Em quantas vezes (ex.: 12). Padrão: 12." },
    ],
    build: (args) => {
      const valor = opcional(args, "valor") ?? "?";
      const parcelas = opcional(args, "parcelas") ?? "12";
      return `Quero comprar algo de R$ ${valor} em ${parcelas}x. Simule o impacto disso no meu orçamento antes de responder.

A pergunta não é se a parcela é pequena: é se ela cabe JUNTO com o que já está comprometido. Compare a parcela nova com a minha renda e a minha despesa médias, e some as parcelas e contas fixas que já estão correndo nos próximos meses.

Responda sim ou não, com os números que sustentam a resposta, e diga qual é o mês mais apertado da série.`;
    },
  },
  {
    name: "fechar-o-dia",
    title: "Fechar o dia",
    description:
      "Resumo de fim de dia: o que ficou pendente, o que vence em seguida e os check-ins de hábito de hoje.",
    arguments: [],
    build: () =>
      `Vamos fechar o dia. Consulte: o que estava previsto para hoje e continua pendente, o que já passou do prazo, o que vence nos próximos dias e os meus check-ins de hábito de hoje.

Me devolva um resumo curto em três partes: o que ficou para trás, o que exige atenção amanhã e o que já pode ser considerado resolvido. Não invente item nenhum — só o que aparecer nos dados; se alguma consulta não vier, diga qual falhou em vez de omitir a parte.`,
  },
  {
    name: "o-que-assistir",
    title: "O que assistir",
    description:
      "Sugere o que ver hoje a partir da lista de filmes e séries em andamento ou pendentes do usuário.",
    arguments: [
      {
        name: "genero",
        description: "Gênero ou clima desejado (ex.: comédia, algo leve, suspense). Opcional.",
      },
    ],
    build: (args) => {
      const genero = opcional(args, "genero");
      return `O que eu assisto hoje${genero ? `, se der vontade de ${genero}` : ""}?

Olhe a minha lista de filmes e séries: o que está em andamento (e em que ponto eu parei) e o que está pendente para ver. Sugira no máximo três opções que JÁ estejam na minha lista, dizendo em uma linha por que cada uma cabe agora.

Se nada na lista servir, diga isso — não recomende título que eu não tenho registrado.`;
    },
  },
  {
    name: "cortar-gastos",
    title: "Cortar gastos",
    description:
      "Simula um corte de X% na despesa mensal separando o que é comprometido do que é discricionário.",
    arguments: [
      {
        name: "percentual",
        description: "Quanto se quer economizar, em % da despesa do mês (ex.: 10).",
        required: true,
      },
    ],
    build: (args) => {
      const percentual = opcional(args, "percentual") ?? "?";
      return `Preciso gastar ${percentual}% a menos por mês. Simule esse corte em cima dos meus gastos reais.

Separe o que está COMPROMETIDO (contas fixas, parcelas e assinaturas já contratadas) do que é DISCRICIONÁRIO — só o segundo dá para cortar sem quebrar contrato, e sugerir corte no primeiro é conselho inútil.

Me mostre de onde tirar o valor, categoria por categoria: quanto sai de cada uma e em quantos meses de histórico esse número se apoia (para eu saber o que é hábito e o que foi gasto sazonal). Se o corte não couber só no discricionário, diga isso com todas as letras em vez de espremer os números.`;
    },
  },
];

export function findOrbPrompt(name: string): OrbPrompt | undefined {
  return ORB_PROMPTS.find((prompt) => prompt.name === name);
}

// As sugestões vivem em `suggestions.ts` desde a feature 100: elas são a única parte deste arquivo
// que a barra lateral precisa, e importá-las daqui levava os ~18 KB de política e prompts MCP para
// o chunk carregado em toda página do app. O reexport mantém o caminho antigo funcionando.
export { ORB_SUGESTOES_DE_CHAT } from "./suggestions.ts";
