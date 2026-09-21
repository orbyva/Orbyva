/**
 * Tool de NAVEGAÇÃO (feature 100): a Orb abre a tela certa do app, já filtrada.
 *
 * É a única tool cujo efeito não é devolver dado, e sim mudar o que a pessoa está vendo. Por isso
 * ela não monta caminho livre: o catálogo de `../navigation.ts` diz quais telas existem e quais
 * filtros cada uma lê, o client valida o caminho contra o MESMO catálogo antes de navegar, e nome
 * de projeto/etiqueta/viagem/nota vira id aqui, com uma consulta ao banco — nunca por chute do
 * modelo.
 */

import type { OrbTool } from "../types.ts";
import { OrbToolError } from "../types.ts";
import { str } from "../helpers.ts";
import { lookupByName, type OrbLookupKind } from "../lookup.ts";
import {
  buildOrbNavigationTarget,
  describeOrbScreens,
  findOrbScreen,
  normalizeOrbFilterValue,
  ORB_NAVIGATION_TOOL_NAME,
  ORB_SCREEN_IDS,
  type OrbNavField,
  type OrbScreen,
} from "../navigation.ts";

/** Campos da tool que são filtro de URL, na ordem em que entram no rótulo. */
const CAMPOS_DE_FILTRO: OrbNavField[] = [
  "project",
  "search",
  "status",
  "view",
  "priority",
  "tag",
  "nature",
  "tab",
  "today",
];

/** Recusa filtro que a tela não lê, dizendo o que ela aceita — o modelo corrige na rodada seguinte. */
function conferirFiltrosAceitos(screen: OrbScreen, input: Record<string, unknown>): void {
  const aceitos = new Set(screen.filters.map((filtro) => filtro.field));
  for (const campo of CAMPOS_DE_FILTRO) {
    const valor = input[campo];
    if (valor === undefined || valor === null || `${valor}`.trim() === "") continue;
    if (aceitos.has(campo)) continue;
    const lista = screen.filters.map((filtro) => filtro.field).join(", ");
    throw new OrbToolError(
      `A tela "${screen.id}" não filtra por "${campo}". Ela aceita: ${lista || "nenhum filtro"}. ` +
        `Chame de novo sem esse campo, ou escolha outra tela.`
    );
  }
}

/** Valor de conjunto fechado que não casa vira erro, não filtro silenciosamente ignorado. */
function conferirValores(screen: OrbScreen, valores: Partial<Record<OrbNavField, string>>): void {
  for (const filtro of screen.filters) {
    const bruto = valores[filtro.field];
    if (bruto === undefined) continue;
    if (!filtro.values) continue;
    if (normalizeOrbFilterValue(filtro, bruto) !== undefined) continue;
    throw new OrbToolError(
      `O campo "${filtro.field}" da tela "${screen.id}" aceita apenas: ${filtro.values.join(", ")}. Recebi "${bruto}".`
    );
  }
}

export const openScreen: OrbTool = {
  name: ORB_NAVIGATION_TOOL_NAME,
  title: "Abrir tela",
  description:
    "Leva a pessoa para uma tela do Orbyva AGORA, já com filtro e busca aplicados — é navegação de verdade, a tela troca na frente dela. " +
    "Use quando o pedido for para ver, abrir, mostrar ou conferir algo numa tela ('me mostra as tarefas do Sacada', 'abre meus gastos com mercado'). " +
    "Para responder um número ou uma lista dentro da conversa, use as tools de consulta — esta não devolve dado. " +
    "Pode ser chamada junto com uma consulta no mesmo turno: consulte para responder e abra a tela para a pessoa continuar de lá.\n\n" +
    "Telas:\n" +
    describeOrbScreens(),
  inputSchema: {
    type: "object",
    properties: {
      screen: {
        type: "string",
        enum: [...ORB_SCREEN_IDS],
        description: "Id da tela, da lista acima.",
      },
      item: {
        type: "string",
        description:
          "Só para telas de detalhe (project_detail, trip_detail, note_detail): nome (ou id) do item a abrir.",
      },
      project: {
        type: "string",
        description: "Nome (ou id) do projeto, quando a tela filtra por projeto.",
      },
      search: { type: "string", description: "Texto que vai para o campo de busca da tela." },
      status: {
        type: "string",
        description:
          "Recorte por situação. Os valores mudam por tela (tarefas: pending/done/all; lugares: to_visit/visited; filmes: to_watch/watching/watched/abandoned; livros: to_read/reading/read/abandoned).",
      },
      view: {
        type: "string",
        enum: ["lista", "kanban", "gantt", "agenda"],
        description: "Aba da lista de tarefas.",
      },
      priority: {
        type: "string",
        enum: ["low", "medium", "high"],
        description: "Prioridade, na lista de tarefas.",
      },
      tag: { type: "string", description: "Nome (ou id) da etiqueta, na lista de tarefas." },
      nature: {
        type: "string",
        enum: ["Receita", "Despesa", "Investimento"],
        description: "Natureza do lançamento, em transações.",
      },
      tab: { type: "string", description: "Aba dentro da tela, quando ela tem abas." },
      today: {
        type: "boolean",
        description: "true abre a lista de tarefas já no recorte de hoje/atrasadas.",
      },
    },
    required: ["screen"],
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const id = str(input, "screen") ?? "";
    const screen = findOrbScreen(id);
    if (!screen) {
      throw new OrbToolError(
        `Não existe a tela "${id}". Escolha uma destas: ${ORB_SCREEN_IDS.join(", ")}.`,
        "nao_encontrado"
      );
    }

    conferirFiltrosAceitos(screen, input);

    const valores: Partial<Record<OrbNavField, string>> = {};
    const rotulos: Partial<Record<OrbNavField, string>> = {};

    const busca = str(input, "search");
    if (busca) valores.search = busca;
    for (const campo of ["status", "view", "priority", "nature", "tab"] as const) {
      const valor = str(input, campo);
      if (valor) valores[campo] = valor;
    }
    if (input.today === true) valores.today = "1";

    conferirValores(screen, valores);

    // Resolução no banco só depois da validação barata: nome errado não deve custar uma consulta.
    const projeto = str(input, "project");
    if (projeto && screen.filters.some((filtro) => filtro.field === "project")) {
      const resolvido = await lookupByName(ctx, "project", projeto);
      valores.project = resolvido.id;
      rotulos.project = resolvido.label;
    }

    const etiqueta = str(input, "tag");
    if (etiqueta && screen.filters.some((filtro) => filtro.field === "tag")) {
      const resolvida = await lookupByName(ctx, "tag", etiqueta);
      valores.tag = resolvida.id;
      rotulos.tag = resolvida.label;
    }

    let entityId: string | undefined;
    let entityLabel: string | undefined;
    if (screen.entity) {
      const termo = str(input, "item") ?? (screen.entity === "project" ? projeto : undefined);
      if (!termo) {
        throw new OrbToolError(
          `A tela "${screen.id}" abre um item específico: mande "item" com o nome ${
            screen.entity === "project" ? "do projeto" : screen.entity === "trip" ? "da viagem" : "da nota"
          }.`
        );
      }
      const resolvido = await lookupByName(ctx, screen.entity as OrbLookupKind, termo);
      entityId = resolvido.id;
      entityLabel = resolvido.label;
    }

    return buildOrbNavigationTarget({ screen, entityId, entityLabel, values: valores, labels: rotulos });
  },
};

export const navigationTools: OrbTool[] = [openScreen];
