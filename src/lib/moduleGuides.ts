import {
  Car,
  Film,
  Flame,
  MapPin,
  Plane,
  Target,
  type LucideIcon,
} from "lucide-react";

export type ModuleGuideId =
  | "travel"
  | "habits"
  | "goals"
  | "places"
  | "car"
  | "movies";

export type ModuleGuideStep = {
  title: string;
  body: string;
};

export type ModuleGuideConfig = {
  id: ModuleGuideId;
  icon: LucideIcon;
  /** Título do guia (dialog). */
  title: string;
  /** Frase de 1 linha usada no callout do empty state. */
  hook: string;
  steps: ModuleGuideStep[];
};

/**
 * Guia contextual por módulo, sob demanda. Um único componente
 * (`ModuleGuide`) renderiza qualquer um destes — não há tour forçado.
 */
export const MODULE_GUIDES: Record<ModuleGuideId, ModuleGuideConfig> = {
  travel: {
    id: "travel",
    icon: Plane,
    title: "Como funcionam as Viagens",
    hook: "Planeje sozinho ou compartilhe a viagem com amigos que também usam o Orbyva.",
    steps: [
      {
        title: "Crie a viagem",
        body: "Destino, datas e status. O card já mostra countdown, orçamento e checklist.",
      },
      {
        title: "Monte roteiro e checklist",
        body: "Dias, atividades e o que levar. O progresso do checklist aparece no card da viagem.",
      },
      {
        title: "Convide amigos",
        body: "Compartilhe a viagem com quem também usa o Orbyva: todo mundo vê o mesmo roteiro, divide gastos e acompanha o orçamento junto.",
      },
      {
        title: "Controle o orçamento",
        body: "Defina um teto e lance despesas — inclusive divididas. Tudo conversa com o seu livro-caixa.",
      },
      {
        title: "Compartilhe e avalie",
        body: "Gere um card da viagem para Stories ou WhatsApp. No fim, avalie lugares visitados — eles entram no módulo Lugares.",
      },
    ],
  },
  habits: {
    id: "habits",
    icon: Flame,
    title: "Como funcionam os Hábitos",
    hook: "Um toque por dia. Streaks e a taxa da semana mostram se a rotina está grudando.",
    steps: [
      {
        title: "Crie um hábito",
        body: "Nome + frequência (diária ou X vezes por semana). Comece com um ou dois — menos é mais.",
      },
      {
        title: "Marque todo dia",
        body: "Um toque marca o dia. A sequência (streak) cresce enquanto você não quebra o ritmo — e aparece no resumo do hub.",
      },
      {
        title: "Acompanhe a semana",
        body: "Taxa dos últimos 7 dias e melhor streak mostram onde você está firme e onde precisa de atenção.",
      },
    ],
  },
  goals: {
    id: "goals",
    icon: Target,
    title: "Como funcionam as Metas",
    hook: "Objetivos de vida com barra de progresso — financeiros ligados ao ledger.",
    steps: [
      {
        title: "Crie a meta",
        body: "Categoria, valor-alvo e unidade (R$, km, livros…). Um prazo é opcional, mas ajuda a não deixar solto.",
      },
      {
        title: "Atualize o progresso",
        body: "Registre o valor atual quando avançar. A barra mostra quanto falta até o alvo.",
      },
      {
        title: "Metas financeiras",
        body: "Metas em R$ conversam com Finanças: veja quanto falta e lance o valor nas transações quando fizer sentido.",
      },
    ],
  },
  places: {
    id: "places",
    icon: MapPin,
    title: "Como funcionam os Lugares",
    hook: "Seu mapa de opiniões: restaurantes, cafés e passeios — com nota para lembrar e compartilhar.",
    steps: [
      {
        title: "Registre um lugar",
        body: "Nome, categoria e nota. Guarde o que valeu (ou não) a pena — na cidade ou em viagem.",
      },
      {
        title: "Filtre e reveja",
        body: "Busque por nota, tipo ou viagem. Ideal para decidir aonde voltar ou o que recomendar.",
      },
      {
        title: "Compartilhe a opinião",
        body: "Gere um card do lugar para mandar no WhatsApp ou Stories — com nota e o que você achou.",
      },
      {
        title: "Vem das viagens também",
        body: "Lugares avaliados dentro de uma viagem (inclusive compartilhada) aparecem aqui automaticamente.",
      },
    ],
  },
  car: {
    id: "car",
    icon: Car,
    title: "Como funciona o Veículo",
    hook: "Manutenções, combustível e documentos do carro ou moto — sem planilha paralela.",
    steps: [
      {
        title: "Cadastre o veículo",
        body: "Carro ou moto, placa e combustível. Você pode ter mais de um.",
      },
      {
        title: "Registre abastecimentos",
        body: "Litros, valor e quilometragem. O app calcula consumo e custo por km.",
      },
      {
        title: "Manutenções e documentos",
        body: "Cronograma de revisões e prazos (IPVA, seguro). Gastos entram no seu livro-caixa.",
      },
    ],
  },
  movies: {
    id: "movies",
    icon: Film,
    title: "Como funciona o Cinema",
    hook: "Seu diário de filmes e séries: watchlist, nota e card pronto para Stories.",
    steps: [
      {
        title: "Monte a watchlist",
        body: "Salve o que quer assistir — filme ou série — e não dependa da memória (nem do algoritmo).",
      },
      {
        title: "Importe o que já viu",
        body: "Traga filmes e séries de outros sites via CSV e continue o histórico daqui.",
      },
      {
        title: "Dê nota e opinião",
        body: "Ao assistir, avalie e comente. Séries acompanham o progresso de episódios.",
      },
      {
        title: "Compartilhe a opinião",
        body: "Gere um card com poster e nota para Stories, WhatsApp ou onde quiser — sua opinião, do seu jeito.",
      },
    ],
  },
};

export function getModuleGuide(id: ModuleGuideId): ModuleGuideConfig {
  return MODULE_GUIDES[id];
}
