/**
 * Tool de CRIAÇÃO (feature 100) — monta e valida, mas não grava.
 *
 * O resultado é uma `OrbProposal`: o cartão que a tela mostra com "Criar" e "Descartar". Quem grava
 * é o client, pelo mesmo `src/api/*` do formulário manual (ver `../actions.ts` para o porquê).
 *
 * Todo id sai daqui resolvido no banco a partir do NOME que a pessoa falou — projeto, categoria de
 * finanças, categoria de compras. É o que impede a Orb de propor "lançar em class_id 42" e acertar
 * a categoria errada com cara de certeza.
 */

import type { OrbTool, OrbToolContext } from "../types.ts";
import { OrbToolError } from "../types.ts";
import { instantFromLocalTime, num, str } from "../helpers.ts";
import { lookupByName } from "../lookup.ts";
import {
  ORB_CREATE_KINDS,
  ORB_CREATE_LABELS,
  ORB_CREATE_TOOL_NAME,
  sanitizeOrbProposalPayload,
  type OrbCreateKind,
  type OrbProposal,
  type OrbProposalField,
} from "../actions.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function exigir(valor: string | undefined, campo: string, kind: string): string {
  if (!valor) {
    const dica =
      campo === "time" && kind === "event"
        ? 'Para criar um evento falta o horário. Pergunte ao usuário ("Que horas?") e só então chame de novo com "time" em HH:MM.'
        : campo === "date" && kind === "event"
          ? 'Para criar um evento falta a data. Pergunte ao usuário e só então chame de novo com "date" em YYYY-MM-DD.'
          : `Para criar ${ORB_CREATE_LABELS[kind as OrbCreateKind]?.toLowerCase() ?? kind} falta "${campo}". Pergunte ao usuário e chame de novo.`;
    throw new OrbToolError(dica);
  }
  return valor;
}

function conferirData(valor: string | undefined, campo: string): string | undefined {
  if (!valor) return undefined;
  if (!ISO_DATE.test(valor)) {
    throw new OrbToolError(`O campo "${campo}" precisa estar em YYYY-MM-DD. Recebi "${valor}".`);
  }
  return valor;
}

function conferirHora(valor: string | undefined, campo: string): string | undefined {
  if (!valor) return undefined;
  const curto = valor.slice(0, 5);
  if (!HORA.test(curto)) {
    throw new OrbToolError(`O campo "${campo}" precisa estar em HH:MM. Recebi "${valor}".`);
  }
  return curto;
}

function dinheiro(valor: number): string {
  return `R$ ${valor.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d)),/g, ".")}`;
}

function dataBr(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

const PRIORIDADE_BR: Record<string, string> = { low: "baixa", medium: "média", high: "alta" };

export const proposeCreate: OrbTool = {
  name: ORB_CREATE_TOOL_NAME,
  title: "Criar (com confirmação)",
  description:
    "Prepara a criação de uma tarefa, lançamento financeiro, nota, item de lista de compras, projeto ou evento de agenda. " +
    "NÃO grava: devolve uma proposta que aparece como cartão na tela, e a pessoa confirma com um clique — é ela quem grava. " +
    "Diga isso ao responder ('preparei aqui, é só confirmar'), nunca 'já criei'. " +
    "Se faltar um dado essencial (o valor de um lançamento, a categoria dele), pergunte antes em vez de inventar. " +
    "Projeto e categoria vão pelo NOME; eu resolvo o id e recuso se não existir.",
  annotations: {
    // A proposta não grava nada, mas também não é uma leitura idempotente qualquer: é o começo de
    // uma escrita, e um host MCP precisa saber disso para pedir confirmação.
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },
  inputSchema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: [...ORB_CREATE_KINDS],
        description: "O que criar.",
      },
      title: {
        type: "string",
        description:
          "Título: da tarefa, da nota, do item, do evento; nome do projeto; descrição do lançamento.",
      },
      description: { type: "string", description: "Detalhe; na nota, é o corpo em markdown." },
      value: { type: "number", description: "Valor em reais, só para lançamento (sempre positivo)." },
      category: {
        type: "string",
        description:
          "Nome da categoria: financeira (lançamento) ou de compras (item). Eu resolvo o id.",
      },
      project: { type: "string", description: "Nome do projeto ao qual isto pertence." },
      date: { type: "string", description: "Data em YYYY-MM-DD: prazo da tarefa, dia do lançamento ou do evento." },
      time: {
        type: "string",
        description:
          "Hora em HH:MM: da tarefa ou do evento. No evento é OBRIGATÓRIA — se a pessoa não disse, NÃO chame a tool: pergunte o horário antes.",
      },
      end_time: { type: "string", description: "Hora de término do evento (HH:MM)." },
      priority: { type: "string", enum: ["low", "medium", "high"], description: "Prioridade da tarefa." },
      duration_minutes: { type: "number", description: "Duração estimada da tarefa, em minutos." },
      quantity: { type: "number", description: "Quantidade do item de compra." },
      unit: { type: "string", description: "Unidade do item (kg, un, L)." },
    },
    required: ["kind"],
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const kind = str(input, "kind") as OrbCreateKind;
    const titulo = str(input, "title");
    const descricao = str(input, "description");
    const data = conferirData(str(input, "date"), "date");
    const hora = conferirHora(str(input, "time"), "time");
    const fim = conferirHora(str(input, "end_time"), "end_time");

    const campos: OrbProposalField[] = [];
    let payload: Record<string, unknown> = {};

    if (kind === "task") {
      const nome = exigir(titulo, "title", kind);
      const prioridade = str(input, "priority");
      const minutos = num(input, "duration_minutes");
      payload = {
        title: nome,
        description: descricao,
        status: "todo",
        priority: prioridade,
        due_date: data,
        due_time: hora ? `${hora}:00` : undefined,
        estimated_duration: minutos,
      };
      campos.push({ label: "Tarefa", value: nome });
      if (data) campos.push({ label: "Prazo", value: hora ? `${dataBr(data)} às ${hora}` : dataBr(data) });
      if (prioridade) campos.push({ label: "Prioridade", value: PRIORIDADE_BR[prioridade] ?? prioridade });
      if (minutos) campos.push({ label: "Estimativa", value: `${minutos} min` });
      await comProjeto(ctx, input, payload, campos);
    } else if (kind === "transaction") {
      const nome = exigir(titulo, "title", kind);
      const valor = num(input, "value");
      if (valor === undefined || valor <= 0) {
        throw new OrbToolError(
          'Um lançamento precisa de "value" maior que zero, em reais. Pergunte o valor ao usuário.'
        );
      }
      const categoria = exigir(
        str(input, "category"),
        "category",
        kind
      );
      const achada = await lookupByName(ctx, "finance_class", categoria);
      const tipo = achada.row.type as { name?: string; nature?: { name?: string } } | null;

      payload = {
        description: nome,
        value: valor,
        class_id: Number(achada.id),
        // Sem data, hoje. `transaction_at` é timestamp e a tela grava com hora; meio-dia evita que
        // o fuso jogue o lançamento para o dia anterior.
        transaction_at: `${data ?? ctx.today}T12:00:00.000Z`,
      };
      campos.push({ label: "Lançamento", value: nome });
      campos.push({ label: "Valor", value: dinheiro(valor) });
      campos.push({
        label: "Categoria",
        value: `${achada.label}${tipo?.nature?.name ? ` (${tipo.nature.name})` : ""}`,
      });
      campos.push({ label: "Data", value: dataBr(data ?? ctx.today) });
    } else if (kind === "note") {
      const nome = exigir(titulo, "title", kind);
      payload = { title: nome, content: descricao ?? "" };
      campos.push({ label: "Nota", value: nome });
      if (descricao) {
        campos.push({
          label: "Conteúdo",
          value: descricao.length > 160 ? `${descricao.slice(0, 160)}…` : descricao,
        });
      }
      await comProjeto(ctx, input, payload, campos);
    } else if (kind === "shopping_item") {
      const nome = exigir(titulo, "title", kind);
      const quantidade = num(input, "quantity");
      const unidade = str(input, "unit");
      payload = {
        title: nome,
        description: descricao,
        quantity: quantidade,
        unit: unidade,
        status: "pending",
      };
      campos.push({ label: "Item", value: nome });
      if (quantidade) {
        campos.push({ label: "Quantidade", value: `${quantidade}${unidade ? ` ${unidade}` : ""}` });
      }
      const categoria = str(input, "category");
      if (categoria) {
        const achada = await lookupByName(ctx, "shopping_category", categoria);
        payload.shopping_category_id = achada.id;
        campos.push({ label: "Categoria", value: achada.label });
      }
    } else if (kind === "project") {
      const nome = exigir(titulo, "title", kind);
      payload = { name: nome, description: descricao, status: "active" };
      campos.push({ label: "Projeto", value: nome });
      if (descricao) campos.push({ label: "Descrição", value: descricao });
    } else if (kind === "event") {
      const nome = exigir(titulo, "title", kind);
      const dia = exigir(data, "date", kind);
      const inicio = exigir(hora, "time", kind);
      // Com fuso explícito: `starts_at` é `timestamptz` e um horário sem offset seria lido como UTC
      // pelo Postgres — o evento das 14:00 cairia às 11:00 na agenda de quem está em São Paulo.
      payload = {
        title: nome,
        starts_at: instantFromLocalTime(dia, inicio, ctx.timezone),
        ends_at: fim ? instantFromLocalTime(dia, fim, ctx.timezone) : undefined,
      };
      campos.push({ label: "Evento", value: nome });
      campos.push({
        label: "Quando",
        value: `${dataBr(dia)} às ${inicio}${fim ? ` — ${fim}` : ""}`,
      });
      await comProjeto(ctx, input, payload, campos);
    } else {
      throw new OrbToolError(
        `Não sei criar "${kind}". Tipos: ${ORB_CREATE_KINDS.join(", ")}.`,
        "nao_encontrado"
      );
    }

    const limpo = sanitizeOrbProposalPayload(kind, payload);
    if (!limpo) {
      // Rede de segurança: se o payload não passa na MESMA validação que o client vai rodar, o
      // erro aparece aqui (onde o modelo pode corrigir) e não como um cartão morto na tela.
      throw new OrbToolError(
        `Não consegui montar ${ORB_CREATE_LABELS[kind].toLowerCase()} com esses dados. Confira os campos obrigatórios.`
      );
    }

    const proposta: OrbProposal = {
      kind,
      label: ORB_CREATE_LABELS[kind],
      fields: campos,
      payload: limpo,
    };
    return {
      ...proposta,
      status: "aguardando_confirmacao",
      note: "Nada foi gravado. O cartão está na tela do usuário esperando o clique em Criar.",
    };
  },
};

/** Projeto é opcional em tarefa, nota e evento — quando vem, vem pelo nome. */
async function comProjeto(
  ctx: OrbToolContext,
  input: Record<string, unknown>,
  payload: Record<string, unknown>,
  campos: OrbProposalField[]
): Promise<void> {
  const projeto = str(input, "project");
  if (!projeto) return;
  const achado = await lookupByName(ctx, "project", projeto);
  payload.project_id = achado.id;
  campos.push({ label: "Projeto", value: achado.label });
}

export const createTools: OrbTool[] = [proposeCreate];
