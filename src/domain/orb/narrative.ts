/**
 * Linha de raciocínio da Orb: cada chamada de tool vira uma frase em português ("Simulei R$ 5.000,00
 * em 12x…") em vez de nome técnico, parâmetros e JSON. Os detalhes técnicos continuam na tela, atrás
 * de um toggle — aqui só se decide o que a pessoa lê primeiro.
 *
 * SEM IMPORT de propósito: o mobile tem uma cópia byte a byte em `mobile/src/domain/orb/narrative.ts`
 * (o Metro não resolve o registry) e `__tests__/narrative.test.ts` falha se as duas divergirem. O rótulo
 * da tool entra por parâmetro, para cada lado usar o seu `orbToolLabel`.
 */

export interface OrbPassoDeTool {
  id: string;
  name: string;
  input?: Record<string, unknown>;
  status: "running" | "ok" | "error";
  summary?: unknown;
}

export interface OrbPassoNarrado {
  id: string;
  status: OrbPassoDeTool["status"];
  /** Frase principal: "Consultei suas tarefas". */
  titulo: string;
  /** Complemento com o número que importa: "12 encontradas · de 01/09 a 30/09/2026". */
  detalhe: string | null;
  /**
   * Falha seguida de uma tentativa bem-sucedida da mesma tool no mesmo turno. A Orb se corrigiu:
   * mostrar como erro faria a resposta boa parecer quebrada.
   */
  corrigido: boolean;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const INTEIRO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MES = /^(\d{4})-(\d{2})$/;

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function numero(fonte: Record<string, unknown> | undefined, chave: string): number | null {
  const valor = fonte?.[chave];
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

function texto(fonte: Record<string, unknown> | undefined, chave: string): string | null {
  const valor = fonte?.[chave];
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}

function dinheiro(valor: number): string {
  return BRL.format(valor);
}

/** `2026-10` → `out/2026`. Fora do formato devolve o texto como veio. */
function mesCurto(ym: string): string {
  const casamento = ISO_MES.exec(ym);
  if (!casamento) return ym;
  return `${MESES[Number(casamento[2]) - 1] ?? casamento[2]}/${casamento[1]}`;
}

function dataCurta(iso: string): string {
  const casamento = ISO_DATE.exec(iso);
  return casamento ? `${casamento[3]}/${casamento[2]}/${casamento[1]}` : iso;
}

/** "de 01/09 a 30/09/2026" — o ano só aparece no fim quando os dois são do mesmo ano. */
function periodo(inicio: string | null, fim: string | null): string | null {
  if (!inicio || !fim) return null;
  const a = ISO_DATE.exec(inicio);
  const b = ISO_DATE.exec(fim);
  if (!a || !b) return null;
  if (inicio === fim) return `em ${dataCurta(inicio)}`;
  const comeco = a[1] === b[1] ? `${a[3]}/${a[2]}` : dataCurta(inicio);
  return `de ${comeco} a ${dataCurta(fim)}`;
}

function juntar(partes: (string | null | undefined)[]): string | null {
  const presentes = partes.filter((parte): parte is string => Boolean(parte));
  return presentes.length > 0 ? presentes.join(" · ") : null;
}

/** A lista principal do resultado, quando ele tem exatamente uma. */
function listaDoResultado(summary: unknown): unknown[] | null {
  if (Array.isArray(summary)) return summary;
  if (!ehObjeto(summary)) return null;
  const listas = Object.values(summary).filter(Array.isArray);
  return listas.length === 1 ? listas[0] : null;
}

function contagem(summary: unknown): string | null {
  if (ehObjeto(summary) && typeof summary.count === "number") {
    const n = summary.count;
    return n === 1 ? "1 registro" : `${INTEIRO.format(n)} registros`;
  }
  const lista = listaDoResultado(summary);
  if (!lista) return null;
  if (lista.length === 0) return "nada encontrado";
  return lista.length === 1 ? "1 resultado" : `${INTEIRO.format(lista.length)} resultados`;
}

function periodoDoPasso(passo: OrbPassoDeTool): string | null {
  const resumo = ehObjeto(passo.summary) ? passo.summary : undefined;
  return (
    periodo(texto(resumo, "start_date"), texto(resumo, "end_date")) ??
    periodo(texto(passo.input, "start_date"), texto(passo.input, "end_date"))
  );
}

/**
 * Do que cada consulta trata, já com o artigo — vira "Consultando suas tarefas…" e "Consultei suas
 * tarefas". Tool fora daqui usa o rótulo do registro, então tool nova nunca aparece crua.
 */
const ASSUNTO: Record<string, string> = {
  query_tasks: "suas tarefas",
  query_projects: "seus projetos",
  query_agenda: "sua agenda",
  query_tags: "suas tags",
  query_content_links: "os links salvos",
  query_time_tracking: "seu tempo registrado",
  query_notes: "suas notas",
  query_shopping_list: "sua lista de compras",
  query_medications: "suas medicações",
  query_health_metrics: "suas medições corporais",
  query_trips: "suas viagens",
  query_trip_day_plan: "o roteiro do dia",
  query_trip_expenses: "os gastos da viagem",
  query_budget_status: "seu orçamento do mês",
  query_spend_by_category: "seus gastos por categoria",
  query_transactions: "seus lançamentos",
  query_recurring: "suas recorrências e parcelas",
  query_finance_categories: "suas categorias financeiras",
  query_monthly_history: "seu histórico mês a mês",
  query_vehicles: "seus veículos",
  query_vehicle_alerts: "os alertas dos veículos",
  query_upcoming: "o que vem por aí",
  query_habits: "seus hábitos",
  query_goals: "suas metas",
  query_movies: "seus filmes e séries",
  query_books: "seus livros",
  query_reading_progress: "seu progresso de leitura",
  query_albums: "seus álbuns",
  query_series_progress: "o progresso das séries",
  query_places: "seus lugares",
};

function assunto(passo: OrbPassoDeTool, rotulo: string): string {
  return ASSUNTO[passo.name] ?? `“${rotulo}”`;
}

/** Campos que a mensagem de erro cita pelo nome do schema. */
const CAMPOS_EM_PORTUGUES: Record<string, string> = {
  title: "o título",
  description: "a descrição",
  value: "o valor",
  date: "a data",
  due_date: "o prazo",
  category: "a categoria",
  nature: "a natureza (receita ou despesa)",
  start_time: "o horário",
  end_time: "o horário de fim",
  time: "o horário",
  question: "a pergunta",
  name: "o nome",
  installment_count: "o número de parcelas",
  total_value: "o valor total",
};

/** Identificador técnico solto no texto: `ask_user`, `propose_create`, `query_data`… */
const IDENTIFICADOR_TECNICO = /\b[a-z]+_[a-z_]+\b/;

/**
 * Mensagem de erro de tool é escrita PARA O MODELO ("Chame ask_user e só então propose_create de
 * novo"). Aqui ela vira o que a pessoa entende: some a frase de instrução, o nome de campo vira
 * português. Se não sobrar nada legível, `null` — o título já diz que falhou.
 */
export function humanizarErroDeTool(mensagem: string): string | null {
  // Sem lookbehind: o Hermes do mobile roda esta mesma cópia.
  const frases = mensagem
    .replace(/([.!?])\s+/g, "$1\n")
    .split("\n")
    .map((frase) => frase.trim())
    .filter(Boolean)
    .map((frase) =>
      frase.replace(/["“]([a-z_]+)["”]/g, (inteiro, campo: string) => {
        const traduzido = CAMPOS_EM_PORTUGUES[campo];
        return traduzido ?? inteiro;
      })
    )
    .filter((frase) => !IDENTIFICADOR_TECNICO.test(frase) && !/\b(chame|use|call)\b/i.test(frase));

  if (frases.length === 0) return null;
  const resultado = frases.join(" ").replace(/\s+/g, " ").trim();
  return resultado.charAt(0).toUpperCase() + resultado.slice(1);
}

function mensagemDeErro(summary: unknown): string | null {
  if (typeof summary === "string") return humanizarErroDeTool(summary);
  const bruto = ehObjeto(summary) ? texto(summary, "error") : null;
  return bruto ? humanizarErroDeTool(bruto) : null;
}

interface Frases {
  andamento: string;
  feito: string;
  falha: string;
  detalhe?: (passo: OrbPassoDeTool) => string | null;
}

function parcelamento(resumo: Record<string, unknown> | undefined, input?: Record<string, unknown>) {
  const total = numero(resumo, "total_value") ?? numero(input, "total_value");
  const parcelas = numero(resumo, "installment_count") ?? numero(input, "installment_count");
  const parcela = numero(resumo, "installment_value");
  if (total === null || parcelas === null) return null;
  const base = `${dinheiro(total)} em ${INTEIRO.format(parcelas)}x`;
  return parcela !== null ? `${base} de ${dinheiro(parcela)}` : base;
}

function baseHistorica(resumo: Record<string, unknown> | undefined): string | null {
  const meses = numero(resumo, "history_months");
  if (meses === null) return null;
  return meses === 1 ? "base: o último mês fechado" : `base: média dos últimos ${meses} meses`;
}

const ESPECIAIS: Record<string, Frases> = {
  simulate_month_balance: {
    andamento: "Projetando seu saldo mês a mês…",
    feito: "Projetei seu saldo mês a mês",
    falha: "Não consegui projetar seu saldo",
    detalhe: ({ summary, input }) => {
      const resumo = ehObjeto(summary) ? summary : undefined;
      const inicio = texto(resumo, "first_installment_month");
      const fim = texto(resumo, "last_installment_month");
      const janela = inicio && fim ? `${mesCurto(inicio)} a ${mesCurto(fim)}` : null;
      const negativos = numero(resumo, "months_with_negative_balance");
      const pior = ehObjeto(resumo?.worst_month) ? resumo.worst_month : undefined;
      const piorMes = texto(pior, "ym");
      const piorSaldo = numero(pior, "balance");
      let veredito: string | null = null;
      if (resumo?.fits_every_month === true) veredito = "cabe em todos os meses";
      else if (negativos !== null && negativos > 0) {
        const quantos = negativos === 1 ? "1 mês fica" : `${negativos} meses ficam`;
        const qual =
          piorMes && piorSaldo !== null ? ` (pior: ${mesCurto(piorMes)}, ${dinheiro(piorSaldo)})` : "";
        veredito = `${quantos} no vermelho${qual}`;
      }
      const compra = parcelamento(resumo, input);
      return juntar([compra && janela ? `${compra}, de ${janela}` : compra, veredito, baseHistorica(resumo)]);
    },
  },
  simulate_installment_impact: {
    andamento: "Simulando o parcelamento…",
    feito: "Simulei o parcelamento",
    falha: "Não consegui simular o parcelamento",
    detalhe: ({ summary, input }) => {
      const resumo = ehObjeto(summary) ? summary : undefined;
      const sobra = numero(resumo, "balance_after_installment");
      return juntar([
        parcelamento(resumo, input),
        sobra !== null ? `sobra média depois da parcela: ${dinheiro(sobra)}/mês` : null,
        baseHistorica(resumo),
      ]);
    },
  },
  simulate_budget_cut: {
    andamento: "Procurando onde dá para cortar…",
    feito: "Procurei onde dá para cortar gastos",
    falha: "Não consegui simular o corte de gastos",
    detalhe: ({ summary }) => {
      const resumo = ehObjeto(summary) ? summary : undefined;
      const meta = numero(resumo, "target_monthly_saving");
      return juntar([
        meta !== null && meta > 0 ? `meta: economizar ${dinheiro(meta)}/mês` : null,
        baseHistorica(resumo),
      ]);
    },
  },
  query_spend_by_category: {
    andamento: "Somando seus gastos por categoria…",
    feito: "Somei seus gastos por categoria",
    falha: "Não consegui somar seus gastos",
    detalhe: (passo) => {
      const resumo = ehObjeto(passo.summary) ? passo.summary : undefined;
      const despesa = numero(resumo, "total_expense");
      return juntar([
        despesa !== null ? `${dinheiro(despesa)} em despesas` : null,
        periodoDoPasso(passo),
      ]);
    },
  },
  query_monthly_history: {
    andamento: "Olhando seu histórico mês a mês…",
    feito: "Olhei seu histórico mês a mês",
    falha: "Não consegui ler seu histórico",
    detalhe: ({ summary }) => {
      const resumo = ehObjeto(summary) ? summary : undefined;
      const meses = numero(resumo, "months_returned");
      const saldo = numero(resumo, "average_monthly_balance");
      return juntar([
        meses !== null ? `${meses} ${meses === 1 ? "mês" : "meses"}` : null,
        saldo !== null ? `saldo médio de ${dinheiro(saldo)}/mês` : null,
      ]);
    },
  },
  propose_create: {
    andamento: "Preparando o cartão para você confirmar…",
    feito: "Preparei o cartão para você confirmar",
    falha: "Faltou informação para preparar o cartão",
    detalhe: ({ summary, input }) => {
      const resumo = ehObjeto(summary) ? summary : undefined;
      const valor = numero(input, "value");
      return juntar([
        texto(resumo, "label"),
        texto(input, "title") ?? texto(input, "description"),
        valor !== null ? dinheiro(valor) : null,
      ]);
    },
  },
  // Sem detalhe: a pergunta já está no cartão de chips logo abaixo.
  ask_user: {
    andamento: "Preparando uma pergunta…",
    feito: "Precisei te perguntar uma coisa",
    falha: "Não consegui formular a pergunta",
    detalhe: () => null,
  },
  open_screen: {
    andamento: "Abrindo a tela…",
    feito: "Abri a tela",
    falha: "Não consegui abrir a tela",
    detalhe: ({ summary }) => texto(ehObjeto(summary) ? summary : undefined, "label"),
  },
  describe_data: {
    andamento: "Conferindo como seus dados estão organizados…",
    feito: "Conferi como seus dados estão organizados",
    falha: "Não consegui ler a estrutura dos dados",
    detalhe: ({ summary }) => texto(ehObjeto(summary) ? summary : undefined, "label"),
  },
  query_data: {
    andamento: "Fazendo uma busca específica nos seus dados…",
    feito: "Fiz uma busca específica nos seus dados",
    falha: "A busca específica não deu certo",
  },
};

function frasesDoPasso(passo: OrbPassoDeTool, rotulo: string): Frases {
  const especial = ESPECIAIS[passo.name];
  if (especial) return especial;
  const sobre = assunto(passo, rotulo);
  return {
    andamento: `Consultando ${sobre}…`,
    feito: `Consultei ${sobre}`,
    falha: `Não consegui consultar ${sobre}`,
  };
}

function detalhePadrao(passo: OrbPassoDeTool): string | null {
  return juntar([contagem(passo.summary), periodoDoPasso(passo)]);
}

/** Uma chamada de tool em uma frase. `corrigido` diz se a falha foi refeita com sucesso depois. */
export function narrarPasso(
  passo: OrbPassoDeTool,
  rotulo: string,
  corrigido = false
): OrbPassoNarrado {
  const frases = frasesDoPasso(passo, rotulo);
  const base = { id: passo.id, status: passo.status, corrigido };

  if (passo.status === "running") {
    return { ...base, titulo: frases.andamento, detalhe: null };
  }
  if (passo.status === "error") {
    const motivo = mensagemDeErro(passo.summary);
    if (corrigido) {
      return {
        ...base,
        titulo: "Ajustei o pedido e tentei de novo",
        detalhe: motivo ? `Na primeira tentativa: ${motivo.charAt(0).toLowerCase()}${motivo.slice(1)}` : null,
      };
    }
    return { ...base, titulo: frases.falha, detalhe: motivo };
  }

  const detalhe = frases.detalhe ? frases.detalhe(passo) : detalhePadrao(passo);
  return { ...base, titulo: frases.feito, detalhe };
}

/**
 * Os passos do turno, em ordem. Uma falha é "corrigida" quando a MESMA tool roda com sucesso mais
 * adiante no turno — é o caso clássico do `propose_create` sem título que a Orb refaz sozinha.
 */
export function narrarPassos(
  passos: OrbPassoDeTool[],
  rotuloDe: (nome: string) => string
): OrbPassoNarrado[] {
  return passos.map((passo, indice) => {
    const corrigido =
      passo.status === "error" &&
      passos.slice(indice + 1).some((depois) => depois.name === passo.name && depois.status === "ok");
    return narrarPasso(passo, rotuloDe(passo.name), corrigido);
  });
}
