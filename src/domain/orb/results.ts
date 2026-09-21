/**
 * De resultado de tool para CARTÃO (feature 100).
 *
 * A Orb consultava e a tela mostrava a mesma tabela genérica para tudo — 12 tarefas, 30 filmes e um
 * orçamento estourado saíam com a mesma cara de dump. Aqui cada tool ganha um adaptador que traduz
 * o resultado para uma das quatro formas visuais (`cards`, `carousel`, `rows`, `bars`), e o
 * componente desenha.
 *
 * Duas regras que valem para todo adaptador:
 *
 * 1. **O nome da tool é a chave**, e não um campo novo no payload: o que o servidor manda para o
 *    modelo não pode crescer para a tela ficar bonita. Campo que existe SÓ para a UI vem com o
 *    prefixo `ui_` e é retirado antes de o resultado chegar ao modelo (`stripUiFields`).
 * 2. **Nada de confiar na forma.** O que chega aqui é o `summary` do SSE, que o servidor pode ter
 *    resumido (`{truncated: true, itens: 40}`) e que vem de uma função publicada que pode estar mais
 *    velha que este bundle. Adaptador que não reconhece o formato devolve `null`, e a tela cai no
 *    JSON/tabela de antes — nunca quebra a conversa.
 */

import { formatBRL, formatDateBR } from "@/lib/currency";

export type OrbBadgeTone = "neutro" | "atencao" | "erro" | "ok" | "destaque";

export interface OrbBadge {
  label: string;
  tone?: OrbBadgeTone;
}

export interface OrbCardItem {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  badges?: OrbBadge[];
  /** Caminho interno para onde o cartão leva. Sempre relativo, sempre uma tela do app. */
  to?: string;
}

export interface OrbPosterItem {
  id: string;
  title: string;
  image?: string | null;
  subtitle?: string;
  badge?: OrbBadge;
  to?: string;
}

export interface OrbRowItem {
  id: string;
  title: string;
  subtitle?: string;
  value?: string;
  valueTone?: OrbBadgeTone;
  to?: string;
}

export interface OrbBarItem {
  id: string;
  label: string;
  value: string;
  /** 0 a 1; acima de 1 a barra satura e o tom vira o de estouro. */
  ratio: number;
  tone?: OrbBadgeTone;
  hint?: string;
}

export type OrbResultView =
  | { kind: "cards"; items: OrbCardItem[]; note?: string }
  | { kind: "carousel"; items: OrbPosterItem[]; note?: string }
  | { kind: "rows"; items: OrbRowItem[]; note?: string }
  | { kind: "bars"; items: OrbBarItem[]; note?: string };

type Registro = Record<string, unknown>;

function ehRegistro(valor: unknown): valor is Registro {
  return Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
}

function lista(resultado: unknown, chave: string): Registro[] | null {
  if (!ehRegistro(resultado)) return null;
  const bruto = resultado[chave];
  if (!Array.isArray(bruto)) return null;
  const itens = bruto.filter(ehRegistro);
  return itens.length === bruto.length ? itens : null;
}

function texto(item: Registro, chave: string): string | undefined {
  const valor = item[chave];
  return typeof valor === "string" && valor.trim() !== "" ? valor : undefined;
}

function numero(item: Registro, chave: string): number | undefined {
  const valor = item[chave];
  return typeof valor === "number" && Number.isFinite(valor) ? valor : undefined;
}

function idDe(item: Registro, indice: number, ...chaves: string[]): string {
  for (const chave of chaves) {
    const valor = item[chave];
    if (typeof valor === "string" && valor) return valor;
  }
  return `item-${indice}`;
}

/** Link de busca: leva para a tela com o termo já no campo, que é o mais perto de "abrir o item". */
function buscaEm(rota: string, termo: string | undefined): string | undefined {
  if (!termo) return undefined;
  return `${rota}?q=${encodeURIComponent(termo)}`;
}

/** Aviso quando a lista foi cortada — a mesma verdade que o modelo recebe, na tela. */
function nota(resultado: unknown, total: number): string | undefined {
  if (!ehRegistro(resultado)) return undefined;
  if (resultado.truncated === true) return `Mostrando ${total} — a lista foi cortada.`;
  return undefined;
}

const STATUS_DE_TAREFA: Record<string, OrbBadge> = {
  todo: { label: "A fazer", tone: "neutro" },
  doing: { label: "Fazendo", tone: "destaque" },
  done: { label: "Concluída", tone: "ok" },
};

const PRIORIDADE: Record<string, OrbBadge> = {
  high: { label: "Alta", tone: "erro" },
  medium: { label: "Média", tone: "atencao" },
  low: { label: "Baixa", tone: "neutro" },
};

const STATUS_DE_FILME: Record<string, string> = {
  to_watch: "Quero ver",
  watching: "Assistindo",
  watched: "Visto",
  abandoned: "Abandonado",
};

const STATUS_DE_LIVRO: Record<string, string> = {
  to_read: "Quero ler",
  reading: "Lendo",
  read: "Lido",
  abandoned: "Abandonado",
};

function prazoDeTarefa(item: Registro): string | undefined {
  const data = texto(item, "due_date");
  if (!data) return undefined;
  const hora = texto(item, "due_time");
  return hora ? `${formatDateBR(data)} · ${hora.slice(0, 5)}` : formatDateBR(data);
}

const ADAPTADORES: Record<string, (resultado: unknown) => OrbResultView | null> = {
  query_tasks: (resultado) => {
    const tarefas = lista(resultado, "tasks");
    if (!tarefas) return null;
    return {
      kind: "cards",
      note: nota(resultado, tarefas.length),
      items: tarefas.map((tarefa, indice) => {
        const badges: OrbBadge[] = [];
        const status = texto(tarefa, "status");
        if (status && STATUS_DE_TAREFA[status]) badges.push(STATUS_DE_TAREFA[status]);
        const prioridade = texto(tarefa, "priority");
        if (prioridade && PRIORIDADE[prioridade]) badges.push(PRIORIDADE[prioridade]);
        if (tarefa.overdue === true) badges.push({ label: "Atrasada", tone: "erro" });
        const minutos = numero(tarefa, "estimated_duration_minutes");
        return {
          id: idDe(tarefa, indice, "id"),
          title: texto(tarefa, "title") ?? "Sem título",
          subtitle: prazoDeTarefa(tarefa),
          meta: minutos ? `${minutos} min` : undefined,
          badges,
          to: buscaEm("/tasks", texto(tarefa, "title")),
        };
      }),
    };
  },

  query_projects: (resultado) => {
    const projetos = lista(resultado, "projects");
    if (!projetos) return null;
    return {
      kind: "cards",
      items: projetos.map((projeto, indice) => {
        const abertas = numero(projeto, "tasks_open") ?? 0;
        const feitas = numero(projeto, "tasks_done") ?? 0;
        const id = idDe(projeto, indice, "id");
        return {
          id,
          title: texto(projeto, "name") ?? "Projeto",
          subtitle: texto(projeto, "description"),
          meta: `${abertas} abertas · ${feitas} concluídas`,
          badges: texto(projeto, "status") ? [{ label: texto(projeto, "status")! }] : undefined,
          to: projeto.id ? `/tasks?project=${encodeURIComponent(id)}` : undefined,
        };
      }),
    };
  },

  query_movies: (resultado) => {
    const filmes = lista(resultado, "movies");
    if (!filmes) return null;
    return {
      kind: "carousel",
      note: nota(resultado, filmes.length),
      items: filmes.map((filme, indice) => {
        const status = texto(filme, "status");
        const ano = numero(filme, "year") ?? texto(filme, "year");
        return {
          id: idDe(filme, indice, "imdb_id", "id"),
          title: texto(filme, "title") ?? "Sem título",
          image: texto(filme, "ui_poster") ?? null,
          subtitle: ano ? String(ano) : undefined,
          badge: status ? { label: STATUS_DE_FILME[status] ?? status } : undefined,
          to: buscaEm("/movies", texto(filme, "title")),
        };
      }),
    };
  },

  query_books: (resultado) => {
    const livros = lista(resultado, "books");
    if (!livros) return null;
    return {
      kind: "carousel",
      note: nota(resultado, livros.length),
      items: livros.map((livro, indice) => {
        const autores = livro.authors;
        const autor = Array.isArray(autores) && typeof autores[0] === "string" ? autores[0] : undefined;
        const status = texto(livro, "status");
        const pagina = numero(livro, "current_page");
        const total = numero(livro, "page_count");
        return {
          id: idDe(livro, indice, "google_id", "id"),
          title: texto(livro, "title") ?? "Sem título",
          image: texto(livro, "ui_cover") ?? null,
          subtitle: autor ?? (pagina && total ? `${pagina}/${total} páginas` : undefined),
          badge: status ? { label: STATUS_DE_LIVRO[status] ?? status } : undefined,
          to: buscaEm("/books", texto(livro, "title")),
        };
      }),
    };
  },

  query_transactions: (resultado) => {
    const lancamentos = lista(resultado, "transactions");
    if (!lancamentos) return null;
    return {
      kind: "rows",
      note: nota(resultado, lancamentos.length),
      items: lancamentos.map((linha, indice) => {
        const valor = numero(linha, "value");
        const natureza = texto(linha, "nature");
        const data = texto(linha, "date");
        return {
          id: idDe(linha, indice, "id"),
          title: texto(linha, "description") ?? "Lançamento",
          subtitle: [data ? formatDateBR(data.slice(0, 10)) : null, texto(linha, "category")]
            .filter(Boolean)
            .join(" · "),
          value: valor === undefined ? undefined : formatBRL(valor),
          valueTone: natureza === "Receita" ? "ok" : natureza === "Despesa" ? "erro" : "neutro",
          to: buscaEm("/finance/transactions", texto(linha, "description")),
        };
      }),
    };
  },

  query_recurring: (resultado) => {
    const recorrencias = lista(resultado, "recurring");
    if (!recorrencias) return null;
    return {
      kind: "rows",
      items: recorrencias.map((linha, indice) => {
        const valor = numero(linha, "value");
        const pagas = numero(linha, "installments_paid");
        const total = numero(linha, "installments_total");
        const dia = numero(linha, "due_day");
        return {
          id: idDe(linha, indice, "id"),
          title: texto(linha, "description") ?? "Recorrência",
          subtitle: [
            dia ? `vence dia ${dia}` : null,
            total ? `${pagas ?? 0}/${total} parcelas` : null,
            texto(linha, "category"),
          ]
            .filter(Boolean)
            .join(" · "),
          value: valor === undefined ? undefined : formatBRL(valor),
          valueTone: texto(linha, "nature") === "Receita" ? "ok" : "neutro",
          to: "/finance/recurring",
        };
      }),
    };
  },

  query_budget_status: (resultado) => {
    const orcamentos = lista(resultado, "budgets");
    if (!orcamentos) return null;
    return {
      kind: "bars",
      items: orcamentos.map((linha, indice) => {
        const planejado = numero(linha, "planned_value") ?? 0;
        const gasto = numero(linha, "spent_value") ?? 0;
        const percentual = numero(linha, "percentage_used");
        const status = texto(linha, "status");
        return {
          id: idDe(linha, indice, "class_name", "type_name"),
          label: texto(linha, "class_name") ?? texto(linha, "type_name") ?? "Categoria",
          value: `${formatBRL(gasto)} de ${formatBRL(planejado)}`,
          ratio: planejado > 0 ? gasto / planejado : percentual ? percentual / 100 : 0,
          tone:
            status === "ESTOUROU" ? "erro" : status === "ATENÇÃO" || status === "QUASE" ? "atencao" : "ok",
          hint: status ?? undefined,
        };
      }),
    };
  },

  query_spend_by_category: (resultado) => {
    const quebra = lista(resultado, "breakdown");
    if (!quebra) return null;
    const maior = quebra.reduce((maximo, item) => Math.max(maximo, numero(item, "total") ?? 0), 0);
    return {
      kind: "bars",
      note: nota(resultado, quebra.length),
      items: quebra.slice(0, 12).map((item, indice) => {
        const total = numero(item, "total") ?? 0;
        return {
          id: idDe(item, indice, "category", "type"),
          label: texto(item, "category") ?? texto(item, "type") ?? "Categoria",
          value: formatBRL(total),
          ratio: maior > 0 ? total / maior : 0,
          tone: texto(item, "nature") === "Receita" ? "ok" : "destaque",
          hint: numero(item, "count") ? `${numero(item, "count")} lançamentos` : undefined,
        };
      }),
    };
  },

  query_places: (resultado) => {
    const lugares = lista(resultado, "places");
    if (!lugares) return null;
    return {
      kind: "cards",
      note: nota(resultado, lugares.length),
      items: lugares.map((lugar, indice) => {
        const nota10 = numero(lugar, "rating");
        const visitado = texto(lugar, "status") === "visited";
        return {
          id: idDe(lugar, indice, "id"),
          title: texto(lugar, "name") ?? "Lugar",
          subtitle: texto(lugar, "address") ?? texto(lugar, "type"),
          meta: nota10 ? `nota ${nota10}` : undefined,
          badges: [{ label: visitado ? "Visitado" : "Quero ir", tone: visitado ? "ok" : "destaque" }],
          to: buscaEm("/places", texto(lugar, "name")),
        };
      }),
    };
  },

  query_notes: (resultado) => {
    const notas = lista(resultado, "notes");
    if (!notas) return null;
    return {
      kind: "cards",
      items: notas.map((nota_, indice) => {
        const id = idDe(nota_, indice, "id");
        const atualizada = texto(nota_, "updated_at");
        return {
          id,
          title: texto(nota_, "title") ?? "Nota sem título",
          subtitle: texto(nota_, "content_preview") ?? texto(nota_, "content"),
          meta: atualizada ? formatDateBR(atualizada.slice(0, 10)) : undefined,
          badges: nota_.is_canvas === true ? [{ label: "Canvas", tone: "destaque" }] : undefined,
          to: nota_.id ? `/notes/${encodeURIComponent(id)}` : undefined,
        };
      }),
    };
  },

  query_trips: (resultado) => {
    const viagens = lista(resultado, "trips");
    if (!viagens) return null;
    return {
      kind: "cards",
      note: nota(resultado, viagens.length),
      items: viagens.map((viagem, indice) => {
        const id = idDe(viagem, indice, "id");
        const inicio = texto(viagem, "start_date");
        const fim = texto(viagem, "end_date");
        const faltam = numero(viagem, "days_until_start");
        return {
          id,
          title: texto(viagem, "title") ?? "Viagem",
          subtitle: texto(viagem, "destination"),
          meta: inicio && fim ? `${formatDateBR(inicio)} → ${formatDateBR(fim)}` : undefined,
          badges: [
            texto(viagem, "status") ? { label: texto(viagem, "status")! } : null,
            faltam !== undefined && faltam >= 0
              ? { label: faltam === 0 ? "hoje" : `em ${faltam} dias`, tone: "destaque" }
              : null,
          ].filter((badge): badge is OrbBadge => badge !== null) as OrbBadge[],
          to: viagem.id ? `/travel/${encodeURIComponent(id)}` : undefined,
        };
      }),
    };
  },

  query_habits: (resultado) => {
    const habitos = lista(resultado, "habits");
    if (!habitos) return null;
    return {
      kind: "cards",
      items: habitos.map((habito, indice) => {
        const feitosNaSemana = numero(habito, "done_last_7_days") ?? 0;
        const meta = numero(habito, "target_per_week");
        return {
          id: idDe(habito, indice, "id"),
          title: texto(habito, "name") ?? "Hábito",
          subtitle: texto(habito, "description"),
          meta: meta ? `${feitosNaSemana}/${meta} na semana` : `${feitosNaSemana} nos últimos 7 dias`,
          badges: [
            habito.done_today === true
              ? { label: "Feito hoje", tone: "ok" as const }
              : { label: "Falta hoje", tone: "atencao" as const },
          ],
          to: "/habits",
        };
      }),
    };
  },

  query_goals: (resultado) => {
    const metas = lista(resultado, "goals");
    if (!metas) return null;
    return {
      kind: "bars",
      items: metas.map((meta, indice) => {
        const alvo = numero(meta, "target_value") ?? 0;
        const atual = numero(meta, "current_value") ?? 0;
        const unidade = texto(meta, "unit") ?? "";
        return {
          id: idDe(meta, indice, "id"),
          label: texto(meta, "title") ?? "Meta",
          value: `${atual}${unidade ? ` ${unidade}` : ""} de ${alvo}`,
          ratio: alvo > 0 ? atual / alvo : 0,
          tone: meta.overdue === true ? "erro" : atual >= alvo && alvo > 0 ? "ok" : "destaque",
          hint: texto(meta, "deadline") ? `até ${formatDateBR(texto(meta, "deadline")!)}` : undefined,
        };
      }),
    };
  },

  query_shopping_list: (resultado) => {
    const grupos = lista(resultado, "groups");
    if (!grupos) return null;
    const itens: OrbRowItem[] = [];
    grupos.forEach((grupo) => {
      const categoria = texto(grupo, "category_name");
      const linhas = Array.isArray(grupo.items) ? grupo.items.filter(ehRegistro) : [];
      linhas.forEach((linha, indice) => {
        const quantidade = numero(linha, "quantity");
        const unidade = texto(linha, "unit");
        itens.push({
          id: idDe(linha, itens.length + indice, "id"),
          title: texto(linha, "title") ?? "Item",
          subtitle: categoria,
          value: quantidade ? `${quantidade}${unidade ? ` ${unidade}` : ""}` : undefined,
          valueTone: texto(linha, "status") === "pending" ? "atencao" : "ok",
          to: "/shopping-list",
        });
      });
    });
    if (itens.length === 0) return null;
    return { kind: "rows", items: itens, note: nota(resultado, itens.length) };
  },

  query_upcoming: (resultado) => {
    const itens = lista(resultado, "items");
    if (!itens) return null;
    return {
      kind: "rows",
      items: itens.map((item, indice) => {
        const data = texto(item, "date");
        const faltam = numero(item, "days_until");
        const valor = numero(item, "value");
        return {
          id: `${idDe(item, indice, "id")}-${indice}`,
          title: texto(item, "title") ?? "Compromisso",
          subtitle: [data ? formatDateBR(data) : null, texto(item, "detail")]
            .filter(Boolean)
            .join(" · "),
          value: valor !== undefined ? formatBRL(valor) : faltam !== undefined ? rotuloDeDias(faltam) : undefined,
          valueTone: faltam !== undefined && faltam <= 0 ? "erro" : "neutro",
        };
      }),
    };
  },
  /**
   * Navegação: a tela já trocou sozinha quando este cartão aparece. A linha existe para quem
   * continuou conversando e quer voltar — e para deixar VISÍVEL que a Orb mexeu na tela, em vez de
   * a troca acontecer sem rastro.
   */
  open_screen: (resultado) => {
    if (!ehRegistro(resultado)) return null;
    const caminho = texto(resultado, "path");
    const rotulo = texto(resultado, "label");
    if (!caminho || !rotulo) return null;
    const aplicados = Array.isArray(resultado.applied)
      ? resultado.applied.filter((item): item is string => typeof item === "string")
      : [];
    return {
      kind: "rows",
      items: [
        {
          id: "orb-navegacao",
          title: `Abrir ${rotulo}`,
          subtitle: aplicados.length > 0 ? aplicados.join(" · ") : undefined,
          to: caminho,
          valueTone: "destaque",
        },
      ],
    };
  },
};

function rotuloDeDias(dias: number): string {
  if (dias < 0) return `${Math.abs(dias)}d atrás`;
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  return `em ${dias}d`;
}

/**
 * A visão de um resultado de tool, ou `null` quando não há adaptador (ou quando o resultado não
 * casou com o formato esperado). `null` NÃO é erro: é o sinal para a tela mostrar o resultado como
 * antes, em tabela.
 */
export function orbResultView(toolName: string, resultado: unknown): OrbResultView | null {
  const adaptador = ADAPTADORES[toolName];
  if (!adaptador) return null;
  try {
    const visao = adaptador(resultado);
    if (!visao || visao.items.length === 0) return null;
    return visao;
  } catch {
    // Adaptador é código de apresentação sobre dado que veio da rede: uma exceção aqui não pode
    // derrubar a conversa inteira — a tabela de antes continua valendo como saída.
    return null;
  }
}

/** Tools que sabem virar cartão — usada pelo painel de capacidades e pelos testes. */
export const ORB_TOOLS_COM_CARTAO = Object.keys(ADAPTADORES);
