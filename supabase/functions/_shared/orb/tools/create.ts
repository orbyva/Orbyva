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
import { instantFromLocalTime, ilikeOr, ilikePattern, num, str, unwrap } from "../helpers.ts";
import { lookupByName, lookupNature } from "../lookup.ts";
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
const ISO_MONTH = /^\d{4}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_PARCELAS = 48;

/** Espelha `buildFixedYearPlan` do app: fixa até dezembro do ano da data de início. */
function planoFixoAteDezembro(
  startIso: string,
  frequency: "Mensal" | "Anual"
): { installment_count: number; validity: string } {
  const year = Number(startIso.slice(0, 4));
  const month = Number(startIso.slice(5, 7));
  const validity = `${year}-12-31`;
  if (frequency === "Anual") return { installment_count: 1, validity };
  return { installment_count: Math.max(1, 12 - month + 1), validity };
}

function parcelaDoTotal(total: number, count: number): number {
  if (count <= 0) return total;
  return Math.round((total / count) * 100) / 100;
}

function mesDoOrcamento(date: string | undefined, today: string): string {
  if (!date) return `${today.slice(0, 7)}-01`;
  if (ISO_MONTH.test(date)) return `${date}-01`;
  if (ISO_DATE.test(date)) return `${date.slice(0, 7)}-01`;
  throw new OrbToolError(
    `O mês do orçamento precisa estar em YYYY-MM ou YYYY-MM-DD. Recebi "${date}".`
  );
}

function exigir(valor: string | undefined, campo: string, kind: string): string {
  if (!valor) {
    const dica =
      campo === "time" && kind === "event"
        ? 'Para criar um evento falta o horário. Chame ask_user ("Que horas?") com suggestions de horários e só então propose_create de novo com "time" em HH:MM.'
        : campo === "date" && kind === "event"
          ? 'Para criar um evento falta a data. Chame ask_user e só então propose_create de novo com "date" em YYYY-MM-DD.'
          : campo === "category" && kind === "trip"
            ? 'Para criar a viagem falta a cidade da 1ª parada em "category" (nome curto, ex.: "Teresina"). Chame ask_user se a pessoa não disse.'
            : `Para criar ${ORB_CREATE_LABELS[kind as OrbCreateKind]?.toLowerCase() ?? kind} falta "${campo}". Chame ask_user e só então propose_create de novo.`;
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

function padHora(valor: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(valor.trim());
  if (!m) return valor.trim();
  return `${m[1]!.padStart(2, "0")}:${m[2]}`;
}

function dinheiro(valor: number): string {
  return `R$ ${valor.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d)),/g, ".")}`;
}

function dataBr(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function diaAnterior(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(ano!, mes! - 1, dia!));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/** Cidade/região curta — nunca o parágrafo inteiro do pedido colado no campo. */
function cidadeCurta(valor: string | undefined, campo: string): string | undefined {
  if (!valor) return undefined;
  const t = valor.trim();
  if (!t) return undefined;
  if (
    t.length > 80 ||
    /[.!?]/.test(t) ||
    /\b(sa[ií]da|estadia|estarei|vou sair|gere um)\b/i.test(t)
  ) {
    throw new OrbToolError(
      `"${campo}" deve ser só o nome da cidade/região (ex.: "Teresina"), não o texto do pedido. ` +
        "Separe destino, origem, datas e horário nos campos certos; se faltar a cidade, chame ask_user."
    );
  }
  return t;
}

type ModoTransporteViagem = "flight" | "train" | "bus" | "car" | "other";

const ATIVIDADE_CATS = [
  "restaurant",
  "cafe",
  "bar",
  "attraction",
  "hotel",
  "park",
  "museum",
  "shop",
  "transport",
  "other",
] as const;

type AtividadeCat = (typeof ATIVIDADE_CATS)[number];

/** Rótulos PT-BR no cartão (o payload interno continua no enum em inglês). */
const ATIVIDADE_CAT_BR: Record<AtividadeCat, string> = {
  restaurant: "Restaurante",
  cafe: "Café",
  bar: "Bar",
  attraction: "Passeio",
  hotel: "Hotel",
  park: "Parque",
  museum: "Museu",
  shop: "Loja",
  transport: "Transporte",
  other: "Outro",
};

const ATIVIDADE_CAT_ALIAS: Record<string, AtividadeCat> = {
  restaurant: "restaurant",
  restaurante: "restaurant",
  cafe: "cafe",
  bar: "bar",
  attraction: "attraction",
  passeio: "attraction",
  atracao: "attraction",
  hotel: "hotel",
  park: "park",
  parque: "park",
  museum: "museum",
  museu: "museum",
  shop: "shop",
  loja: "shop",
  compras: "shop",
  transport: "transport",
  transporte: "transport",
  other: "other",
  outro: "other",
  outra: "other",
};

function normalizarCategoriaAtividade(raw: string | undefined): AtividadeCat {
  if (!raw?.trim()) return "attraction";
  const n = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return ATIVIDADE_CAT_ALIAS[n] ?? "other";
}

type AtividadeDoDia = {
  title: string;
  activity_time: string | null;
  arrival_time: string | null;
  category: AtividadeCat;
  sort_order: number;
};

function campoAtividadeDoDia(a: AtividadeDoDia): { label: string; value: string } {
  const horaLabel = a.activity_time
    ? a.arrival_time
      ? `${a.activity_time.slice(0, 5)}–${a.arrival_time.slice(0, 5)}`
      : a.activity_time.slice(0, 5)
    : "sem hora";
  return {
    label: horaLabel,
    value: `${a.title} · ${ATIVIDADE_CAT_BR[a.category]}`,
  };
}

/** Linhas do roteiro do dia: `HH:MM|título|categoria` ou `HH:MM-HH:MM|título|categoria`. */
function parseRoteiroDoDia(texto: string): AtividadeDoDia[] {
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^[-*•]\s*/, ""))
    .filter(Boolean);
  if (linhas.length === 0) {
    throw new OrbToolError(
      'Roteiro do dia precisa de description com uma atividade por linha (ex.: "09:00|Parque Zoobotânico|parque").'
    );
  }
  if (linhas.length > 12) {
    throw new OrbToolError("No máximo 12 atividades por dia no trip_day_plan.");
  }
  const saida: AtividadeDoDia[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]!;
    const partes = linha.split("|").map((p) => p.trim());
    let inicio: string | undefined;
    let fim: string | undefined;
    let titulo: string;
    let catBruta = "attraction";
    if (partes.length >= 2) {
      const faixa = partes[0]!;
      titulo = partes[1]!;
      if (partes[2]) catBruta = partes[2]!;
      const m = /^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/.exec(faixa);
      if (m) {
        inicio = conferirHora(padHora(m[1]!), "time");
        fim = conferirHora(padHora(m[2]!), "time");
      } else {
        inicio = conferirHora(padHora(faixa), "time");
      }
    } else {
      const m = /^(\d{1,2}:\d{2})\s+(.+)$/.exec(linha);
      if (!m) {
        throw new OrbToolError(
          `Linha de roteiro inválida: "${linha}". Use HH:MM|título|categoria (ex.: parque, museu).`
        );
      }
      inicio = conferirHora(padHora(m[1]!), "time");
      titulo = m[2]!.trim();
    }
    if (!titulo) {
      throw new OrbToolError(`Atividade na linha ${i + 1} sem título.`);
    }
    saida.push({
      title: titulo,
      activity_time: inicio ? `${inicio}:00`.slice(0, 8) : null,
      arrival_time: fim ? `${fim}:00`.slice(0, 8) : null,
      category: normalizarCategoriaAtividade(catBruta),
      sort_order: i,
    });
  }
  return saida;
}

function normalizarModoTransporte(raw: string | undefined): ModoTransporteViagem | undefined {
  if (!raw?.trim()) return undefined;
  const n = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (["car", "carro", "auto", "automovel"].includes(n)) return "car";
  if (["bus", "onibus", "ônibus"].includes(n) || n === "onibus") return "bus";
  if (["flight", "voo", "aviao", "avião", "airplane", "plane"].includes(n)) return "flight";
  if (["train", "trem", "metro", "metrô"].includes(n)) return "train";
  if (["other", "outro", "outra"].includes(n)) return "other";
  throw new OrbToolError(
    'Modo de deslocamento inválido. Use car|bus|flight|train|other, ou chame ask_user com suggestions ["Carro","Ônibus","Voo","Trem","Outro"].'
  );
}

const PRIORIDADE_BR: Record<string, string> = { low: "baixa", medium: "média", high: "alta" };

export const proposeCreate: OrbTool = {
  name: ORB_CREATE_TOOL_NAME,
  title: "Criar (com confirmação)",
  description:
    "Prepara criação ou ação com confirmação (não grava): tarefa, lançamento, nota, compra, projeto, evento, " +
    "recorrência, orçamento, categorias financeiras, pagamento/quitar, hábito (criar/check-in), filme/série, " +
    "episódio de série, livro, álbum, lugar, meta, medicação, consulta, veículo, abastecimento, manutenção, " +
    "viagem, gasto de viagem, atividade de roteiro, roteiro do dia. " +
    "Devolve cartão; a pessoa confirma. " +
    "Faltou dado → ask_user ANTES. Entidades pelo NOME na lista do usuário.",
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
          "Título: da tarefa, da nota, do item, do evento; nome do projeto; descrição do lançamento ou da recorrência.",
      },
      description: {
        type: "string",
        description:
          "Detalhe; na nota, é o corpo em markdown. Em trip_day_plan: uma atividade por linha " +
          "`HH:MM|título|categoria` com categoria em português (parque, museu, restaurante, passeio, café, bar, hotel, loja, transporte, outro). " +
          "Faixa opcional: `09:00-11:30|Museu|museu`.",
      },
      value: {
        type: "number",
        description:
          "Valor em reais (sempre positivo). Lançamento = valor do gasto; recorrência fixa = valor mensal; " +
          "recorrência parcelada (com installment_count) = valor TOTAL da compra; orçamento = valor planejado do mês.",
      },
      category: {
        type: "string",
        description:
          "Nome da categoria: financeira (lançamento, recorrência, orçamento) ou de compras (item). " +
          "Em trip: cidade/região da 1ª parada — só o nome curto (ex.: \"Teresina\"), nunca o parágrafo do pedido.",
      },
      project: { type: "string", description: "Nome do projeto ao qual isto pertence." },
      date: {
        type: "string",
        description:
          "Data em YYYY-MM-DD: prazo da tarefa, dia do lançamento/evento, início do pagamento da recorrência, " +
          "ou qualquer dia do mês do orçamento. Também aceita YYYY-MM só para orçamento. Em trip: início da viagem.",
      },
      time: {
        type: "string",
        description:
          "Hora em HH:MM: da tarefa ou do evento. No evento é OBRIGATÓRIA — se a pessoa não disse, NÃO chame esta tool: chame ask_user pedindo o horário. " +
          "Em trip: horário de saída da ida (ex.: 03:30).",
      },
      end_time: { type: "string", description: "Hora de término do evento (HH:MM)." },
      priority: { type: "string", enum: ["low", "medium", "high"], description: "Prioridade da tarefa." },
      duration_minutes: { type: "number", description: "Duração estimada da tarefa, em minutos." },
      quantity: { type: "number", description: "Quantidade do item de compra." },
      unit: { type: "string", description: "Unidade do item (kg, un, L)." },
      installment_count: {
        type: "number",
        description:
          "Número de parcelas (recorrência parcelada). Se informado, value é o TOTAL da compra e eu divido. " +
          "Sem isto, a recorrência é conta fixa (Mensal/Anual até dezembro do ano).",
      },
      frequency: {
        type: "string",
        description:
          "Frequência: recorrência financeira Mensal/Anual (sem installment_count); " +
          "hábito daily/weekly (ou diário/semanal). Padrão hábito: daily; padrão conta fixa: Mensal.",
      },
      due_day: {
        type: "number",
        description: "Dia do mês do vencimento da recorrência (1–31). Padrão: dia de date, ou 10.",
      },
      nature: {
        type: "string",
        description:
          "Natureza do tipo financeiro: Receita, Despesa ou Investimento. Obrigatória em finance_type.",
      },
      until: {
        type: "string",
        description:
          "Até quando (YYYY-MM ou YYYY-MM-DD): fim da replicação de orçamento (budget_replicate) ou fim da viagem (trip). " +
          "Se a pessoa não disse, chame ask_user antes.",
      },
      origin: {
        type: "string",
        description:
          "Em trip: origem/casa da ida e volta (ex.: \"Valparaíso\"). Só preencha se a pessoa disse de onde sai.",
      },
      transport_mode: {
        type: "string",
        enum: ["flight", "train", "bus", "car", "other"],
        description:
          "Em trip: meio do deslocamento ida/volta. Se a pessoa falou origem ou horário de saída e NÃO disse o meio, " +
          "NÃO invente — chame ask_user com suggestions [\"Carro\",\"Ônibus\",\"Voo\",\"Trem\",\"Outro\"] antes de propose_create.",
      },
      stop2: {
        type: "string",
        description:
          "Em trip: nome curto da 2ª parada (ex.: \"Elesbão Veloso\"). Só se a pessoa listou outra cidade no meio/fim.",
      },
      stop2_start: {
        type: "string",
        description:
          "Em trip: YYYY-MM-DD em que começa a 2ª parada. Obrigatório se stop2 estiver preenchido.",
      },
      installment_number: {
        type: "number",
        description:
          "Número da parcela a pagar (1-based) em recurring_payment. Se omitido e só houver uma " +
          "pendente, uso essa; se várias, chame ask_user.",
      },
      rating: {
        type: "number",
        description: "Nota 0–10 (filme, livro, álbum, lugar, episódio).",
      },
      page: {
        type: "number",
        description: "Página atual do livro (book_progress).",
      },
      content_status: {
        type: "string",
        description:
          "Status de conteúdo: filme (to_watch|watching|watched|abandoned), " +
          "livro (to_read|reading|read|abandoned), álbum (to_listen|listened). " +
          "Em goal_update: 'add'/'aporte' = incremento. " +
          "Em habit_create: 'health'/'saude' marca is_health; 'avoid' = anti-hábito. " +
          "Em vehicle_create: car|motorcycle (ou moto).",
      },
      km: {
        type: "number",
        description: "Quilometragem do odômetro (abastecimento, manutenção ou veículo novo).",
      },
      liters: {
        type: "number",
        description: "Litros abastecidos (fuel_log). Alternativa a quantity.",
      },
      year: {
        type: "number",
        description:
          "Ano do filme/série (movie_mark / series_episode) ou do veículo (vehicle_create).",
      },
      season: {
        type: "number",
        description: "Temporada (series_episode). Ex.: 2 para S02.",
      },
      episode: {
        type: "number",
        description: "Número do episódio (series_episode). Ex.: 5 para E05.",
      },
      times: {
        type: "string",
        description:
          "Horários da medicação separados por vírgula (ex.: \"08:00,20:00\"). medication_create.",
      },
      is_health: {
        type: "boolean",
        description: "Hábito de saúde (água, alimentação) — aparece no dashboard de Saúde.",
      },
    },
    required: ["kind"],
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const kind = str(input, "kind") as OrbCreateKind;
    const titulo = str(input, "title");
    const descricao = str(input, "description");
    const dateRaw = str(input, "date");
    // Orçamento e réplica aceitam YYYY-MM; os outros kinds exigem dia completo.
    const data =
      kind === "budget" || kind === "budget_delete" || kind === "budget_replicate"
        ? undefined
        : conferirData(dateRaw, "date");
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
    } else if (kind === "recurring") {
      const nome = exigir(titulo, "title", kind);
      const valorTotal = num(input, "value");
      if (valorTotal === undefined || valorTotal <= 0) {
        throw new OrbToolError(
          'Uma recorrência precisa de "value" maior que zero, em reais. Chame ask_user se a pessoa não disse o valor.'
        );
      }
      const categoria = exigir(str(input, "category"), "category", kind);
      const achada = await lookupByName(ctx, "finance_class", categoria);
      const inicioPagamento = data ?? ctx.today;
      const parcelas = num(input, "installment_count");
      const frequenciaBruta = str(input, "frequency");
      const frequency: "Mensal" | "Anual" =
        frequenciaBruta === "Anual" ? "Anual" : "Mensal";
      let dueDay = num(input, "due_day");
      if (dueDay === undefined) {
        dueDay = Number(inicioPagamento.slice(8, 10)) || 10;
      }
      if (dueDay < 1 || dueDay > 31) {
        throw new OrbToolError('O campo "due_day" precisa ser um dia entre 1 e 31.');
      }

      if (parcelas !== undefined) {
        if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > MAX_PARCELAS) {
          throw new OrbToolError(
            `Parcelas: informe installment_count entre 1 e ${MAX_PARCELAS}.`
          );
        }
        const valorParcela = parcelaDoTotal(valorTotal, parcelas);
        payload = {
          description: nome,
          value: valorParcela,
          class_id: Number(achada.id),
          frequency: "Mensal",
          validity: undefined,
          due_day: dueDay,
          installment_count: parcelas,
          payment_start_date: inicioPagamento,
          status: true,
        };
        campos.push({ label: "Compra parcelada", value: nome });
        campos.push({ label: "Total", value: dinheiro(valorTotal) });
        campos.push({
          label: "Parcelas",
          value: `${parcelas}x de ${dinheiro(valorParcela)}`,
        });
      } else {
        const plano = planoFixoAteDezembro(inicioPagamento, frequency);
        payload = {
          description: nome,
          value: valorTotal,
          class_id: Number(achada.id),
          frequency,
          validity: plano.validity,
          due_day: dueDay,
          installment_count: plano.installment_count,
          payment_start_date: inicioPagamento,
          status: true,
        };
        campos.push({ label: "Conta fixa", value: nome });
        campos.push({ label: "Valor", value: dinheiro(valorTotal) });
        campos.push({ label: "Frequência", value: frequency });
        campos.push({ label: "Até", value: dataBr(plano.validity) });
      }
      campos.push({ label: "Categoria", value: achada.label });
      campos.push({ label: "Início", value: dataBr(inicioPagamento) });
      campos.push({ label: "Vence dia", value: String(dueDay) });
    } else if (kind === "budget") {
      const valor = num(input, "value");
      if (valor === undefined || valor <= 0) {
        throw new OrbToolError(
          'Um orçamento precisa de "value" maior que zero, em reais. Chame ask_user se faltar o valor.'
        );
      }
      const categoria = exigir(str(input, "category"), "category", kind);
      const achada = await lookupByName(ctx, "finance_class", categoria);
      const tipo = achada.row.type as { id?: number | string; name?: string } | null;
      const typeId = tipo?.id;
      if (typeId === undefined || typeId === null) {
        throw new OrbToolError(
          `A categoria "${achada.label}" não tem tipo pai. Escolha outra subcategoria.`
        );
      }
      // date sem YYYY-MM puro: conferirData já recusou; mesDoOrcamento aceita YYYY-MM direto
      // via str(input,"date") sem passar por conferirData.
      const budgetMonth = mesDoOrcamento(dateRaw, ctx.today);
      payload = {
        type_id: Number(typeId),
        class_id: Number(achada.id),
        budget_month: budgetMonth,
        planned_value: valor,
      };
      campos.push({ label: "Orçamento", value: achada.label });
      if (tipo?.name) campos.push({ label: "Tipo", value: tipo.name });
      campos.push({ label: "Mês", value: budgetMonth.slice(0, 7) });
      campos.push({ label: "Planejado", value: dinheiro(valor) });
    } else if (kind === "finance_type") {
      const nome = exigir(titulo, "title", kind);
      const naturezaNome = exigir(str(input, "nature"), "nature", kind);
      const natureza = await lookupNature(ctx, naturezaNome);
      payload = { name: nome, nature_id: Number(natureza.id) };
      campos.push({ label: "Tipo", value: nome });
      campos.push({ label: "Natureza", value: natureza.label });
    } else if (kind === "finance_class") {
      const nome = exigir(titulo, "title", kind);
      const tipoNome = exigir(str(input, "category"), "category", kind);
      const tipo = await lookupByName(ctx, "finance_type", tipoNome);
      payload = { name: nome, type_id: Number(tipo.id) };
      campos.push({ label: "Subcategoria", value: nome });
      campos.push({ label: "Tipo pai", value: tipo.label });
    } else if (kind === "budget_delete") {
      const categoria = exigir(str(input, "category"), "category", kind);
      const achada = await lookupByName(ctx, "finance_class", categoria);
      const budgetMonth = mesDoOrcamento(dateRaw, ctx.today);
      const orcamento = await acharOrcamento(ctx, Number(achada.id), budgetMonth);
      payload = { id: orcamento.id };
      campos.push({ label: "Excluir", value: achada.label });
      campos.push({ label: "Mês", value: budgetMonth.slice(0, 7) });
      campos.push({ label: "Planejado", value: dinheiro(orcamento.planned_value) });
    } else if (kind === "budget_replicate") {
      const fromMonth = mesDoOrcamento(dateRaw, ctx.today);
      const untilRaw = str(input, "until");
      if (!untilRaw) {
        throw new OrbToolError(
          'Para replicar orçamento falta "until" (até quando). Chame ask_user com suggestions de meses.'
        );
      }
      const untilMonth = mesDoOrcamento(untilRaw, ctx.today);
      if (untilMonth < fromMonth) {
        throw new OrbToolError(
          `O mês final (${untilMonth.slice(0, 7)}) precisa ser igual ou depois do inicial (${fromMonth.slice(0, 7)}).`
        );
      }
      // missing_only é o default seguro; replace só se a pessoa pedir sobrescrever.
      const mode = "missing_only";
      payload = { from_month: fromMonth, until_month: untilMonth, mode };
      campos.push({ label: "De", value: fromMonth.slice(0, 7) });
      campos.push({ label: "Até", value: untilMonth.slice(0, 7) });
      campos.push({ label: "Modo", value: "só meses sem orçamento" });
    } else if (kind === "recurring_payment") {
      const nome = exigir(titulo, "title", kind);
      const recorrencia = await acharRecorrencia(ctx, nome);
      const pedida = num(input, "installment_number");
      const pagas = Array.isArray(recorrencia.paid_parcels)
        ? (recorrencia.paid_parcels as number[])
        : [];
      const total = recorrencia.installment_count;
      const parcela = escolherParcela(pedida, pagas, total);
      payload = {
        recurring_id: recorrencia.id,
        installment_number: parcela,
      };
      campos.push({ label: "Recorrência", value: recorrencia.description });
      campos.push({ label: "Parcela", value: String(parcela) });
      if (typeof recorrencia.value === "number") {
        campos.push({ label: "Valor", value: dinheiro(recorrencia.value) });
      }
    } else if (kind === "recurring_quit") {
      const nome = exigir(titulo, "title", kind);
      const recorrencia = await acharRecorrencia(ctx, nome);
      payload = { recurring_id: recorrencia.id };
      campos.push({ label: "Quitar", value: recorrencia.description });
      if (typeof recorrencia.value === "number") {
        campos.push({ label: "Valor", value: dinheiro(recorrencia.value) });
      }
    } else if (kind === "habit_checkin") {
      const nome = exigir(titulo, "title", kind);
      const habito = await acharPorNome(ctx, "habit", "name", nome, "hábito");
      const dia = data ?? ctx.today;
      payload = { habit_id: habito.id, date: dia, completed: true };
      campos.push({ label: "Hábito", value: String(habito.row.name ?? nome) });
      campos.push({ label: "Dia", value: dataBr(dia) });
    } else if (kind === "movie_mark") {
      const nome = exigir(titulo, "title", kind);
      let filme: { id: string; row: Record<string, unknown> } | null = null;
      try {
        filme = await acharPorNome(ctx, "movie", "title", nome, "filme/série", "imdb_id");
      } catch (erro) {
        if (!(erro instanceof OrbToolError) || erro.code !== "nao_encontrado") {
          throw erro;
        }
      }

      const STATUS_FILME: Record<string, string> = {
        to_watch: "to_watch",
        watching: "watching",
        watched: "watched",
        abandoned: "abandoned",
        "quero ver": "to_watch",
        lista: "to_watch",
        pendente: "to_watch",
        assistindo: "watching",
        visto: "watched",
        assistido: "watched",
        abandonei: "abandoned",
        abandonado: "abandoned",
      };
      const statusBruto = (str(input, "content_status") ?? "").trim().toLowerCase();
      const statusOk = statusBruto
        ? (STATUS_FILME[statusBruto] ??
          (["to_watch", "watching", "watched", "abandoned"].includes(statusBruto)
            ? statusBruto
            : null))
        : filme
          ? "watched"
          : "to_watch";
      if (!statusOk) {
        throw new OrbToolError(
          'Status de filme: to_watch, watching, watched ou abandoned (ou "quero ver" / "visto"). Chame ask_user.'
        );
      }
      const nota = num(input, "rating");
      const ano = num(input, "year");
      const watchedDate = data ?? (statusOk === "watched" ? ctx.today : undefined);
      const statusBr: Record<string, string> = {
        to_watch: "Quero ver",
        watching: "Assistindo",
        watched: "Visto",
        abandoned: "Abandonado",
      };

      if (filme) {
        payload = {
          imdb_id: filme.id,
          title: String(filme.row.title ?? nome),
          status: statusOk,
          rating: nota,
          notes: descricao,
          watched_date: watchedDate,
          is_new: false,
        };
        campos.push({ label: "Título", value: String(filme.row.title ?? nome) });
        campos.push({ label: "Ação", value: "atualizar na lista" });
        campos.push({ label: "Status", value: statusBr[statusOk] ?? statusOk });
      } else {
        payload = {
          title: nome,
          status: statusOk,
          rating: nota,
          notes: descricao,
          watched_date: watchedDate,
          is_new: true,
          year: ano,
        };
        campos.push({ label: "Título", value: nome });
        if (ano !== undefined) campos.push({ label: "Ano", value: String(ano) });
        campos.push({ label: "Ação", value: "adicionar à lista (busca no catálogo)" });
        campos.push({ label: "Status", value: statusBr[statusOk] ?? statusOk });
      }
      if (nota !== undefined) campos.push({ label: "Nota", value: String(nota) });
      if (watchedDate) campos.push({ label: "Data", value: dataBr(watchedDate) });
    } else if (kind === "book_progress") {
      const nome = exigir(titulo, "title", kind);
      let livro: { id: string; row: Record<string, unknown> } | null = null;
      try {
        livro = await acharPorNome(ctx, "book", "title", nome, "livro", "google_id");
      } catch (erro) {
        if (!(erro instanceof OrbToolError) || erro.code !== "nao_encontrado") {
          throw erro;
        }
      }
      const pagina = num(input, "page");
      const STATUS_LIVRO: Record<string, string> = {
        to_read: "to_read",
        reading: "reading",
        read: "read",
        abandoned: "abandoned",
        "quero ler": "to_read",
        lendo: "reading",
        li: "read",
        lido: "read",
        abandonei: "abandoned",
        abandonado: "abandoned",
      };
      const statusBruto = (str(input, "content_status") ?? "").trim().toLowerCase();
      let status = statusBruto
        ? (STATUS_LIVRO[statusBruto] ??
          (["to_read", "reading", "read", "abandoned"].includes(statusBruto)
            ? statusBruto
            : null))
        : undefined;
      if (statusBruto && !status) {
        throw new OrbToolError(
          'Status de livro: to_read, reading, read ou abandoned (ou "quero ler" / "lendo" / "li"). Chame ask_user.'
        );
      }
      if (!status && pagina !== undefined) status = "reading";
      if (!livro && !status) status = "to_read";
      if (
        livro &&
        !status &&
        pagina === undefined &&
        num(input, "rating") === undefined &&
        !descricao
      ) {
        throw new OrbToolError(
          "Para atualizar o livro diga a página, o status ou a nota. Chame ask_user se faltar."
        );
      }
      const statusBr: Record<string, string> = {
        to_read: "Quero ler",
        reading: "Lendo",
        read: "Lido",
        abandoned: "Abandonado",
      };
      if (livro) {
        payload = {
          google_id: livro.id,
          title: String(livro.row.title ?? nome),
          status,
          current_page: pagina,
          rating: num(input, "rating"),
          notes: descricao,
          is_new: false,
        };
        campos.push({ label: "Livro", value: String(livro.row.title ?? nome) });
        campos.push({ label: "Ação", value: "atualizar na estante" });
      } else {
        payload = {
          title: nome,
          status,
          current_page: pagina,
          rating: num(input, "rating"),
          notes: descricao,
          is_new: true,
        };
        campos.push({ label: "Livro", value: nome });
        campos.push({ label: "Ação", value: "adicionar à estante (busca no Google Books)" });
      }
      if (status) campos.push({ label: "Status", value: statusBr[status] ?? status });
      if (pagina !== undefined) campos.push({ label: "Página", value: String(pagina) });
    } else if (kind === "habit_create") {
      const nome = exigir(titulo, "title", kind);
      const freqBruta = (str(input, "frequency") ?? "daily").trim().toLowerCase();
      const FREQ: Record<string, "daily" | "weekly"> = {
        daily: "daily",
        diario: "daily",
        diário: "daily",
        dia: "daily",
        weekly: "weekly",
        semanal: "weekly",
        semana: "weekly",
      };
      const frequency = FREQ[freqBruta];
      if (!frequency) {
        throw new OrbToolError(
          'Frequência do hábito: daily ou weekly (diário/semanal). Chame ask_user se estiver em dúvida.'
        );
      }
      const statusHab = (str(input, "content_status") ?? "").trim().toLowerCase();
      const isHealth =
        input.is_health === true ||
        ["health", "saude", "saúde", "agua", "água", "alimentacao", "alimentação"].includes(
          statusHab
        );
      const kindHabito: "build" | "avoid" =
        statusHab === "avoid" || statusHab === "evitar" || statusHab === "anti" ? "avoid" : "build";
      const metaSemana =
        num(input, "quantity") ?? (frequency === "daily" ? 7 : 1);
      payload = {
        name: nome,
        frequency,
        target_per_week: metaSemana,
        kind: kindHabito,
        description: descricao,
        is_health: isHealth,
      };
      campos.push({ label: "Hábito", value: nome });
      campos.push({ label: "Frequência", value: frequency === "daily" ? "Diário" : "Semanal" });
      campos.push({ label: "Meta/semana", value: String(metaSemana) });
      if (isHealth) campos.push({ label: "Saúde", value: "sim" });
      if (kindHabito === "avoid") campos.push({ label: "Tipo", value: "anti-hábito" });
    } else if (kind === "vehicle_create") {
      const nome = exigir(titulo, "title", kind);
      const partes = nome.trim().split(/\s+/);
      const brandFromCat = str(input, "category");
      let brand: string;
      let model: string;
      if (brandFromCat) {
        brand = brandFromCat;
        model = nome;
      } else if (partes.length >= 2) {
        brand = partes[0];
        model = partes.slice(1).join(" ");
      } else {
        brand = nome;
        model = nome;
      }
      const tipoBruto = (str(input, "content_status") ?? "").trim().toLowerCase();
      const kindVeiculo =
        ["motorcycle", "moto", "motocicleta"].includes(tipoBruto) ? "motorcycle" : "car";
      const kmAtual = num(input, "km") ?? num(input, "quantity") ?? 0;
      const ano = num(input, "year");
      const placa = descricao?.match(/[A-Z]{3}-?\d[A-Z0-9]\d{2}/i)?.[0] ??
        (descricao && descricao.length <= 10 ? descricao : undefined);
      payload = {
        brand,
        model,
        kind: kindVeiculo,
        current_km: kmAtual,
        plate: placa,
        year: ano,
        notes: placa && descricao && descricao !== placa ? descricao : descricao && !placa ? descricao : undefined,
      };
      campos.push({ label: "Veículo", value: `${brand} ${model}` });
      campos.push({ label: "Tipo", value: kindVeiculo === "motorcycle" ? "Moto" : "Carro" });
      campos.push({ label: "Km", value: String(kmAtual) });
      if (placa) campos.push({ label: "Placa", value: placa });
      if (ano !== undefined) campos.push({ label: "Ano", value: String(ano) });
    } else if (kind === "series_episode") {
      const nome = exigir(titulo, "title", kind);
      let serie: { id: string; row: Record<string, unknown> } | null = null;
      try {
        serie = await acharPorNome(ctx, "movie", "title", nome, "série", "imdb_id");
      } catch (erro) {
        if (!(erro instanceof OrbToolError) || erro.code !== "nao_encontrado") {
          throw erro;
        }
      }
      let season = num(input, "season");
      let episode = num(input, "episode");
      const seBlob = `${nome} ${descricao ?? ""}`;
      const seMatch =
        seBlob.match(/s(?:eason)?\s*(\d+)\s*e(?:p(?:isode)?)?\s*(\d+)/i) ??
        seBlob.match(/(\d+)x(\d+)/i);
      if (seMatch) {
        if (season === undefined) season = Number(seMatch[1]);
        if (episode === undefined) episode = Number(seMatch[2]);
      }
      if (season === undefined || episode === undefined || season < 1 || episode < 1) {
        throw new OrbToolError(
          "Episódio precisa de temporada e número (season + episode, ou S02E05). Chame ask_user."
        );
      }
      const epNome = descricao && !/s\d+e\d+/i.test(descricao) ? descricao : undefined;
      const ano = num(input, "year");
      const nota = num(input, "rating");
      if (serie) {
        payload = {
          imdb_id: serie.id,
          title: String(serie.row.title ?? nome),
          season,
          episode,
          episode_name: epNome,
          rating: nota,
          notes: epNome ? undefined : descricao,
          is_new: false,
        };
        campos.push({ label: "Série", value: String(serie.row.title ?? nome) });
        campos.push({ label: "Ação", value: "marcar episódio" });
      } else {
        payload = {
          title: nome,
          season,
          episode,
          episode_name: epNome,
          rating: nota,
          notes: epNome ? undefined : descricao,
          is_new: true,
          year: ano,
        };
        campos.push({ label: "Série", value: nome });
        if (ano !== undefined) campos.push({ label: "Ano", value: String(ano) });
        campos.push({ label: "Ação", value: "adicionar série + marcar episódio (OMDb)" });
      }
      campos.push({ label: "Episódio", value: `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}` });
      if (epNome) campos.push({ label: "Título", value: epNome });
      if (nota !== undefined) campos.push({ label: "Nota", value: String(nota) });
    } else if (kind === "medication_create") {
      const nome = exigir(titulo, "title", kind);
      const timesRaw = str(input, "times") ?? hora;
      if (!timesRaw) {
        throw new OrbToolError(
          'Medicação precisa dos horários (times: "08:00,20:00" ou time). Chame ask_user.'
        );
      }
      const times = timesRaw
        .split(/[,;/]+/)
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => {
          const m = t.match(/^(\d{1,2}):(\d{2})$/);
          if (!m) {
            throw new OrbToolError(
              `Horário inválido "${t}". Use HH:MM. Chame ask_user.`
            );
          }
          return `${m[1].padStart(2, "0")}:${m[2]}`;
        });
      if (times.length === 0) {
        throw new OrbToolError("Informe ao menos um horário da dose. Chame ask_user.");
      }
      const doseAmount = num(input, "quantity") ?? num(input, "value");
      const doseUnit = str(input, "unit");
      const intervalDays = num(input, "installment_count") ?? 1;
      const started = data ?? ctx.today;
      payload = {
        name: nome,
        times: times.join(","),
        dose_amount: doseAmount,
        dose_unit: doseUnit,
        instructions: descricao,
        interval_days: intervalDays,
        started_on: started,
      };
      campos.push({ label: "Medicamento", value: nome });
      campos.push({ label: "Horários", value: times.join(", ") });
      if (doseAmount !== undefined) {
        campos.push({
          label: "Dose",
          value: doseUnit ? `${doseAmount} ${doseUnit}` : String(doseAmount),
        });
      }
      campos.push({ label: "Início", value: dataBr(started) });
      if (intervalDays > 1) {
        campos.push({ label: "Intervalo", value: `a cada ${intervalDays} dias` });
      }
    } else if (kind === "consultation_create") {
      const nome = exigir(titulo, "title", kind);
      const dia = exigir(data ?? ctx.today, "date", kind);
      payload = {
        title: nome,
        description: descricao,
        due_date: dia,
        due_time: hora ? `${hora}:00` : undefined,
      };
      campos.push({ label: "Consulta", value: nome });
      campos.push({
        label: "Quando",
        value: hora ? `${dataBr(dia)} às ${hora}` : dataBr(dia),
      });
      if (descricao) campos.push({ label: "Detalhe", value: descricao });
    } else if (kind === "album_wishlist") {
      const nome = exigir(titulo, "title", kind);
      const existentes = await buscarPorNome(ctx, "album", "title", nome, "musicbrainz_id");
      if (existentes.length > 1) {
        const nomes = existentes.map((row) => `"${row.title}"`).join(", ");
        throw new OrbToolError(
          `"${nome}" casa com mais de um álbum: ${nomes}. Chame ask_user com o nome exato.`
        );
      }
      if (existentes.length === 1) {
        const album = existentes[0];
        payload = {
          musicbrainz_id: String(album.musicbrainz_id),
          title: String(album.title),
          artists: Array.isArray(album.artists) ? album.artists.join(", ") : "",
          status: "to_listen",
          is_new: false,
        };
        campos.push({ label: "Álbum", value: String(album.title) });
        campos.push({ label: "Ação", value: "marcar como quero ouvir" });
      } else {
        const idManual = `manual-${slugId(nome)}`;
        const artistas = descricao ?? "";
        payload = {
          musicbrainz_id: idManual,
          title: nome,
          artists: artistas,
          status: "to_listen",
          is_new: true,
        };
        campos.push({ label: "Álbum", value: nome });
        if (artistas) campos.push({ label: "Artistas", value: artistas });
        campos.push({ label: "Ação", value: "adicionar à lista (quero ouvir)" });
      }
    } else if (kind === "place_visit") {
      const nome = exigir(titulo, "title", kind);
      const dia = data ?? ctx.today;
      const nota = num(input, "rating");
      const gasto = num(input, "value");
      const tipoBruto = str(input, "category") ?? "other";
      const PLACE_TYPES = [
        "restaurant",
        "cafe",
        "bar",
        "attraction",
        "hotel",
        "park",
        "museum",
        "shop",
        "other",
      ];
      const tipo = PLACE_TYPES.includes(tipoBruto) ? tipoBruto : "other";
      const existentes = await buscarPorNome(ctx, "place_visit", "name", nome, "id");
      if (existentes.length > 1) {
        const nomes = existentes.map((row) => `"${row.name}"`).join(", ");
        throw new OrbToolError(
          `"${nome}" casa com mais de um lugar: ${nomes}. Chame ask_user com o nome exato.`
        );
      }
      if (existentes.length === 1) {
        payload = {
          place_visit_id: String(existentes[0].id),
          name: String(existentes[0].name),
          visited_date: dia,
          rating: nota,
          notes: descricao,
          amount: gasto,
        };
        campos.push({ label: "Lugar", value: String(existentes[0].name) });
        campos.push({ label: "Ação", value: "nova visita" });
      } else {
        payload = {
          name: nome,
          type: tipo,
          status: "visited",
          visited_date: dia,
          rating: nota,
          notes: descricao,
          amount: gasto,
        };
        campos.push({ label: "Lugar", value: nome });
        campos.push({ label: "Tipo", value: tipo });
        campos.push({ label: "Ação", value: "cadastrar visita" });
      }
      campos.push({ label: "Quando", value: dataBr(dia) });
      if (nota !== undefined) campos.push({ label: "Nota", value: String(nota) });
      if (gasto !== undefined) campos.push({ label: "Gasto", value: dinheiro(gasto) });
    } else if (kind === "goal_update") {
      const nome = exigir(titulo, "title", kind);
      const meta = await acharPorNome(ctx, "personal_goal", "title", nome, "meta");
      const absoluto = num(input, "value");
      // Sem value = não dá para atualizar; aporte usa o mesmo campo value como incremento
      // quando content_status === "add" — senão value é o novo current_value.
      if (absoluto === undefined) {
        throw new OrbToolError(
          'Para atualizar a meta falta "value" (novo total ou aporte). Chame ask_user.'
        );
      }
      const modo = str(input, "content_status");
      if (modo === "add" || modo === "aporte") {
        payload = { goal_id: meta.id, add_value: absoluto };
        campos.push({ label: "Meta", value: String(meta.row.title ?? nome) });
        campos.push({ label: "Aporte", value: String(absoluto) });
      } else {
        payload = { goal_id: meta.id, current_value: absoluto };
        campos.push({ label: "Meta", value: String(meta.row.title ?? nome) });
        campos.push({ label: "Novo valor", value: String(absoluto) });
      }
    } else if (kind === "fuel_log") {
      const veiculoNome = exigir(str(input, "category") ?? titulo, "category", kind);
      const veiculo = await acharVeiculo(ctx, veiculoNome);
      const litros = num(input, "liters") ?? num(input, "quantity");
      const custo = num(input, "value");
      const km = num(input, "km");
      if (litros === undefined || litros <= 0) {
        throw new OrbToolError('Abastecimento precisa de "liters" (ou quantity) > 0. Chame ask_user.');
      }
      if (custo === undefined || custo <= 0) {
        throw new OrbToolError('Abastecimento precisa de "value" (custo total) > 0. Chame ask_user.');
      }
      if (km === undefined || km < 0) {
        throw new OrbToolError('Abastecimento precisa de "km" (odômetro). Chame ask_user.');
      }
      const dia = data ?? ctx.today;
      payload = {
        vehicle_id: veiculo.id,
        date: dia,
        liters: litros,
        total_cost: custo,
        km,
        station: descricao,
        notes: undefined,
      };
      campos.push({ label: "Veículo", value: veiculo.label });
      campos.push({ label: "Litros", value: String(litros) });
      campos.push({ label: "Total", value: dinheiro(custo) });
      campos.push({ label: "Km", value: String(km) });
      campos.push({ label: "Data", value: dataBr(dia) });
    } else if (kind === "maintenance") {
      const veiculoNome = exigir(str(input, "category") ?? titulo, "category", kind);
      const veiculo = await acharVeiculo(ctx, veiculoNome);
      const tipoBruto = str(input, "content_status") ?? titulo ?? "other";
      const tipo = normalizarManutencao(tipoBruto);
      const km = num(input, "km") ?? 0;
      const custo = num(input, "value");
      const dia = data ?? ctx.today;
      payload = {
        vehicle_id: veiculo.id,
        type: tipo,
        custom_type: tipo === "other" ? tipoBruto : undefined,
        service_date: dia,
        km_at_service: km,
        cost: custo,
        shop: descricao,
      };
      campos.push({ label: "Veículo", value: veiculo.label });
      campos.push({ label: "Serviço", value: tipo === "other" ? tipoBruto : tipo });
      campos.push({ label: "Data", value: dataBr(dia) });
      campos.push({ label: "Km", value: String(km) });
      if (custo !== undefined) campos.push({ label: "Custo", value: dinheiro(custo) });
    } else if (kind === "trip") {
      const nome = exigir(titulo, "title", kind);
      const inicio = exigir(data, "date", kind);
      const fimRaw = str(input, "until");
      const fim = fimRaw
        ? ISO_DATE.test(fimRaw)
          ? fimRaw
          : ISO_MONTH.test(fimRaw)
            ? `${fimRaw}-01`
            : undefined
        : inicio;
      if (!fim || !ISO_DATE.test(fim)) {
        throw new OrbToolError(
          'Viagem precisa de "until" (data fim em YYYY-MM-DD) ou usa a mesma data de início. Chame ask_user.'
        );
      }
      if (fim < inicio) {
        throw new OrbToolError("A data fim precisa ser igual ou depois do início.");
      }
      // Destino = nome curto da 1ª parada. Nunca usar description (vira lixão do prompt).
      const destino = cidadeCurta(
        exigir(str(input, "category"), "category", kind),
        "category"
      )!;
      const origem = cidadeCurta(str(input, "origin"), "origin");
      const saidaIda = hora; // já normalizada HH:MM via conferirHora
      const modo = normalizarModoTransporte(str(input, "transport_mode"));
      if ((origem || saidaIda) && !modo) {
        throw new OrbToolError(
          'A pessoa falou origem e/ou horário de saída, mas não o meio de deslocamento. ' +
            'Chame ask_user ("Vai de carro, ônibus, voo…?") com suggestions ["Carro","Ônibus","Voo","Trem","Outro"] ' +
            "e só então propose_create de novo com transport_mode."
        );
      }
      if (saidaIda && !origem) {
        throw new OrbToolError(
          'Há horário de saída da ida, mas falta "origin" (de onde sai). Chame ask_user.'
        );
      }
      const parada2 = cidadeCurta(str(input, "stop2"), "stop2");
      const parada2Inicio = conferirData(str(input, "stop2_start"), "stop2_start");
      if (parada2 && !parada2Inicio) {
        throw new OrbToolError(
          'Com stop2, informe stop2_start (YYYY-MM-DD). Chame ask_user se a pessoa não disse quando chega na 2ª cidade.'
        );
      }
      if (parada2Inicio && !parada2) {
        throw new OrbToolError('stop2_start sem stop2 — informe o nome curto da 2ª parada.');
      }
      if (parada2Inicio) {
        if (parada2Inicio <= inicio || parada2Inicio > fim) {
          throw new OrbToolError(
            "stop2_start precisa ser depois do início da viagem e no máximo no fim (until)."
          );
        }
      }
      const stops: Array<{
        name: string;
        start_date: string;
        end_date: string;
        sort_order: number;
      }> = [];
      if (parada2 && parada2Inicio) {
        const fimParada1 = diaAnterior(parada2Inicio);
        if (fimParada1 < inicio) {
          throw new OrbToolError("A 1ª parada ficaria sem dias — ajuste date / stop2_start.");
        }
        stops.push({
          name: destino,
          start_date: inicio,
          end_date: fimParada1,
          sort_order: 0,
        });
        stops.push({
          name: parada2,
          start_date: parada2Inicio,
          end_date: fim,
          sort_order: 1,
        });
      } else {
        stops.push({
          name: destino,
          start_date: inicio,
          end_date: fim,
          sort_order: 0,
        });
      }
      const destinoAgregado = stops.map((s) => s.name).join(" → ");
      const orcamento = num(input, "value");
      // Notes só se description for texto curto de verdade — nunca o dump do prompt.
      const descTrim = descricao?.trim();
      const notesSafe =
        descTrim &&
        descTrim.length <= 200 &&
        !/[.!?]/.test(descTrim) &&
        !/\b(sa[ií]da|estadia|estarei|vou sair|gere um)\b/i.test(descTrim) &&
        descTrim !== destino &&
        descTrim !== parada2
          ? descTrim
          : undefined;
      payload = {
        title: nome,
        start_date: inicio,
        end_date: fim,
        destination: destinoAgregado,
        budget: orcamento,
        status: "planning",
        notes: notesSafe,
        origin_label: origem,
        outbound_depart: saidaIda,
        transport_mode: modo,
        stop1_name: stops[0]!.name,
        stop1_start: stops[0]!.start_date,
        stop1_end: stops[0]!.end_date,
        stop2_name: stops[1]?.name,
        stop2_start: stops[1]?.start_date,
        stop2_end: stops[1]?.end_date,
      };
      campos.push({ label: "Viagem", value: nome });
      campos.push({
        label: "Parada 1",
        value: `${destino} (${dataBr(inicio)}–${dataBr(stops[0]!.end_date)})`,
      });
      if (stops[1]) {
        campos.push({
          label: "Parada 2",
          value: `${stops[1].name} (${dataBr(stops[1].start_date)}–${dataBr(stops[1].end_date)})`,
        });
      }
      if (origem) campos.push({ label: "Origem", value: origem });
      if (saidaIda) campos.push({ label: "Ida — saída", value: saidaIda });
      if (modo) {
        const modoBr: Record<ModoTransporteViagem, string> = {
          car: "Carro",
          bus: "Ônibus",
          flight: "Voo",
          train: "Trem",
          other: "Outro",
        };
        campos.push({ label: "Modo", value: modoBr[modo] });
      }
      campos.push({ label: "De", value: dataBr(inicio) });
      campos.push({ label: "Até", value: dataBr(fim) });
      if (orcamento !== undefined) campos.push({ label: "Orçamento", value: dinheiro(orcamento) });
    } else if (kind === "trip_expense") {
      const viagemNome = exigir(str(input, "project"), "project", kind);
      const descricaoGasto = exigir(titulo, "title", kind);
      const viagem = await acharPorNome(ctx, "trip", "title", viagemNome, "viagem");
      const valor = num(input, "value");
      if (valor === undefined || valor <= 0) {
        throw new OrbToolError('Gasto de viagem precisa de "value" > 0. Chame ask_user.');
      }
      const catBruta = str(input, "category") ?? "other";
      const EXP = ["transport", "lodging", "food", "activity", "shopping", "other"];
      const categoria = EXP.includes(catBruta) ? catBruta : "other";
      const dia = data ?? ctx.today;
      payload = {
        trip_id: viagem.id,
        description: descricaoGasto,
        amount: valor,
        category: categoria,
        expense_date: dia,
      };
      campos.push({ label: "Viagem", value: String(viagem.row.title ?? viagemNome) });
      campos.push({ label: "Gasto", value: descricaoGasto });
      campos.push({ label: "Valor", value: dinheiro(valor) });
      campos.push({ label: "Categoria", value: categoria });
      campos.push({ label: "Data", value: dataBr(dia) });
    } else if (kind === "trip_activity") {
      const viagemNome = exigir(str(input, "project"), "project", kind);
      const atividade = exigir(titulo, "title", kind);
      const viagem = await acharPorNome(ctx, "trip", "title", viagemNome, "viagem");
      const dia = exigir(data, "date", kind);
      const dayId = await acharDiaRoteiro(ctx, viagem.id, dia);
      const horaAtiv = str(input, "time");
      const categoria = normalizarCategoriaAtividade(str(input, "category"));
      payload = {
        day_id: dayId,
        trip_id: viagem.id,
        title: atividade,
        activity_time: horaAtiv ? `${horaAtiv}:00`.slice(0, 8) : undefined,
        category: categoria,
        notes: descricao,
        sort_order: 0,
      };
      campos.push({ label: "Viagem", value: String(viagem.row.title ?? viagemNome) });
      campos.push({ label: "Atividade", value: atividade });
      campos.push({ label: "Dia", value: dataBr(dia) });
      if (horaAtiv) campos.push({ label: "Hora", value: horaAtiv });
      campos.push({ label: "Tipo", value: ATIVIDADE_CAT_BR[categoria] });
    } else if (kind === "trip_day_plan") {
      const viagemNome = exigir(str(input, "project"), "project", kind);
      const dia = exigir(data, "date", kind);
      const corpo = exigir(descricao, "description", kind);
      const atividades = parseRoteiroDoDia(corpo);

      let viagem: { id: string; row: Record<string, unknown> } | null = null;
      try {
        viagem = await acharPorNome(ctx, "trip", "title", viagemNome, "viagem");
      } catch (erro) {
        // Viagem ainda só no cartão (mesmo turno) — não falha: propõe o roteiro em espera.
        if (!(erro instanceof OrbToolError) || erro.code !== "nao_encontrado") {
          throw erro;
        }
      }

      if (!viagem) {
        payload = {
          pending_trip_title: viagemNome,
          plan_date: dia,
          activities_json: JSON.stringify(atividades),
        };
        campos.push({ label: "Viagem", value: viagemNome });
        campos.push({ label: "Status", value: "Aguardando criar a viagem" });
        campos.push({ label: "Dia", value: dataBr(dia) });
        campos.push({ label: "Atividades", value: String(atividades.length) });
        for (const a of atividades) campos.push(campoAtividadeDoDia(a));
      } else {
        const dayId = await acharDiaRoteiro(ctx, viagem.id, dia);
        payload = {
          trip_id: viagem.id,
          day_id: dayId,
          plan_date: dia,
          activities_json: JSON.stringify(atividades),
        };
        campos.push({ label: "Viagem", value: String(viagem.row.title ?? viagemNome) });
        campos.push({ label: "Dia", value: dataBr(dia) });
        campos.push({ label: "Atividades", value: String(atividades.length) });
        for (const a of atividades) campos.push(campoAtividadeDoDia(a));
      }
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

async function acharOrcamento(
  ctx: OrbToolContext,
  classId: number,
  budgetMonth: string
): Promise<{ id: number; planned_value: number }> {
  const rows = unwrap<{ id: number; planned_value: number | string }[]>(
    await ctx.db
      .from("monthly_budget")
      .select("id, planned_value")
      .eq("user_id", ctx.userId)
      .eq("class_id", classId)
      .eq("budget_month", budgetMonth)
      .limit(2),
    "orçamentos"
  );
  if (rows.length === 0) {
    throw new OrbToolError(
      `Não achei orçamento dessa categoria em ${budgetMonth.slice(0, 7)}. Confira com query_budget_status.`,
      "nao_encontrado"
    );
  }
  if (rows.length > 1) {
    throw new OrbToolError(
      `Há mais de um orçamento dessa categoria em ${budgetMonth.slice(0, 7)}. Resolva na tela de Orçamento.`
    );
  }
  return { id: rows[0].id, planned_value: Number(rows[0].planned_value) || 0 };
}

async function acharRecorrencia(
  ctx: OrbToolContext,
  termo: string
): Promise<{
  id: string;
  description: string;
  value: number | null;
  installment_count: number | null;
  paid_parcels: unknown;
}> {
  const rows = unwrap<
    {
      id: string;
      description: string;
      value: number | null;
      installment_count: number | null;
      paid_parcels: unknown;
      status: boolean;
    }[]
  >(
    await ctx.db
      .from("recurring_transaction")
      .select("id, description, value, installment_count, paid_parcels, status")
      .eq("user_id", ctx.userId)
      .eq("status", true)
      .ilike("description", ilikePattern(termo))
      .order("description", { ascending: true })
      .limit(9),
    "recorrências"
  );

  if (rows.length === 0) {
    throw new OrbToolError(
      `Não achei recorrência ativa com "${termo}". Confira com query_recurring.`,
      "nao_encontrado"
    );
  }
  const exato = rows.find(
    (row) => row.description.toLowerCase() === termo.toLowerCase()
  );
  if (exato) return exato;
  if (rows.length > 1) {
    const nomes = rows.map((row) => `"${row.description}"`).join(", ");
    throw new OrbToolError(
      `"${termo}" casa com mais de uma recorrência: ${nomes}. Chame ask_user e use o nome exato.`
    );
  }
  return rows[0];
}

function escolherParcela(
  pedida: number | undefined,
  pagas: number[],
  total: number | null
): number {
  if (pedida !== undefined) {
    if (!Number.isInteger(pedida) || pedida < 1) {
      throw new OrbToolError('O campo "installment_number" precisa ser um inteiro ≥ 1.');
    }
    if (pagas.includes(pedida)) {
      throw new OrbToolError(
        `A parcela ${pedida} já está paga. Chame ask_user se quiser outra.`
      );
    }
    return pedida;
  }
  const teto = total && total > 0 ? total : Math.max(0, ...pagas, 0) + 12;
  const pendentes: number[] = [];
  for (let i = 1; i <= teto; i += 1) {
    if (!pagas.includes(i)) pendentes.push(i);
  }
  if (pendentes.length === 0) {
    throw new OrbToolError("Não há parcela pendente nessa recorrência.");
  }
  if (pendentes.length > 1) {
    throw new OrbToolError(
      `Há várias parcelas pendentes (${pendentes.slice(0, 6).join(", ")}…). ` +
        "Chame ask_user pedindo o número da parcela."
    );
  }
  return pendentes[0];
}

function slugId(texto: string): string {
  const base = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base || "album"}-${Date.now().toString(36)}`;
}

/**
 * Busca por nome (ilike) numa tabela do usuário. `idColumn` quando a PK não se chama `id`
 * (filme → imdb_id, livro → google_id, álbum → musicbrainz_id).
 */
async function buscarPorNome(
  ctx: OrbToolContext,
  table: string,
  column: string,
  termo: string,
  idColumn = "id"
): Promise<Record<string, unknown>[]> {
  const colunas = idColumn === "id" ? `id, ${column}` : `${idColumn}, ${column}`;
  // Álbum e livro trazem campos extras úteis no cartão.
  const extra =
    table === "album"
      ? ", artists"
      : table === "movie"
        ? ", type, status"
        : table === "book"
          ? ", authors, status, current_page"
          : "";
  return unwrap<Record<string, unknown>[]>(
    await ctx.db
      .from(table)
      .select(`${colunas}${extra}`)
      .eq("user_id", ctx.userId)
      .ilike(column, ilikePattern(termo))
      .order(column, { ascending: true })
      .limit(9),
    table
  );
}

async function acharPorNome(
  ctx: OrbToolContext,
  table: string,
  column: string,
  termo: string,
  oQue: string,
  idColumn = "id"
): Promise<{ id: string; row: Record<string, unknown> }> {
  const rows = await buscarPorNome(ctx, table, column, termo, idColumn);
  if (rows.length === 0) {
    throw new OrbToolError(
      `Não achei ${oQue} com "${termo}" na sua lista. ` +
        (table === "movie" || table === "book"
          ? "Cadastre antes na tela do módulo (open_screen) ou confirme o nome com ask_user."
          : "Confirme o nome com ask_user ou cadastre na tela."),
      "nao_encontrado"
    );
  }
  const exato = rows.find(
    (row) => String(row[column] ?? "").toLowerCase() === termo.toLowerCase()
  );
  if (exato) {
    return { id: String(exato[idColumn]), row: exato };
  }
  if (rows.length > 1) {
    const nomes = rows.map((row) => `"${String(row[column])}"`).join(", ");
    throw new OrbToolError(
      `"${termo}" casa com mais de um ${oQue}: ${nomes}. Chame ask_user e use o nome exato.`
    );
  }
  return { id: String(rows[0][idColumn]), row: rows[0] };
}

async function acharVeiculo(
  ctx: OrbToolContext,
  termo: string
): Promise<{ id: string; label: string }> {
  const rows = unwrap<
    { id: string; brand: string; model: string; plate: string | null; notes: string | null }[]
  >(
    await ctx.db
      .from("vehicle")
      .select("id, brand, model, plate, notes")
      .eq("user_id", ctx.userId)
      .or(ilikeOr(["brand", "model", "plate", "notes"], termo))
      .order("created_at", { ascending: true })
      .limit(9),
    "veículos"
  );
  if (rows.length === 0) {
    throw new OrbToolError(
      `Não achei veículo com "${termo}". Use query_vehicles ou ask_user com o apelido/placa.`,
      "nao_encontrado"
    );
  }
  const labelOf = (v: (typeof rows)[0]) =>
    [v.brand, v.model].filter(Boolean).join(" ") || v.plate || "Veículo";
  const termoLow = termo.toLowerCase();
  const exato = rows.find((v) => {
    const blob = [v.brand, v.model, v.plate, v.notes].filter(Boolean).join(" ").toLowerCase();
    return (
      blob === termoLow ||
      (v.model ?? "").toLowerCase() === termoLow ||
      (v.plate ?? "").toLowerCase() === termoLow ||
      (v.notes ?? "").toLowerCase() === termoLow
    );
  });
  if (exato) return { id: exato.id, label: labelOf(exato) };
  if (rows.length > 1) {
    const nomes = rows.map((v) => `"${labelOf(v)}"`).join(", ");
    throw new OrbToolError(
      `"${termo}" casa com mais de um veículo: ${nomes}. Chame ask_user com o nome exato.`
    );
  }
  return { id: rows[0].id, label: labelOf(rows[0]) };
}

async function acharDiaRoteiro(
  ctx: OrbToolContext,
  tripId: string,
  date: string
): Promise<string> {
  const rows = unwrap<{ id: string; date: string | null; day_number: number }[]>(
    await ctx.db
      .from("trip_itinerary_day")
      .select("id, date, day_number")
      .eq("trip_id", tripId)
      .eq("date", date)
      .limit(2),
    "dias do roteiro"
  );
  if (rows.length === 0) {
    throw new OrbToolError(
      `Não achei o dia ${date} no roteiro dessa viagem. Confira as datas da viagem (query) ou chame ask_user.`,
      "nao_encontrado"
    );
  }
  return rows[0].id;
}

const MANUTENCAO_ALIAS: Record<string, string> = {
  oleo: "oil",
  óleo: "oil",
  oil: "oil",
  pneu: "tires",
  pneus: "tires",
  tires: "tires",
  freio: "brakes",
  freios: "brakes",
  brakes: "brakes",
  bateria: "battery",
  battery: "battery",
  revisao: "general_service",
  revisão: "general_service",
  general_service: "general_service",
  filtro: "oil_filter",
  oil_filter: "oil_filter",
  air_filter: "air_filter",
  correia: "timing_belt",
  timing_belt: "timing_belt",
  other: "other",
};

function normalizarManutencao(bruto: string): string {
  const key = bruto.trim().toLowerCase();
  return MANUTENCAO_ALIAS[key] ?? "other";
}

export const createTools: OrbTool[] = [proposeCreate];
