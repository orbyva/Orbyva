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
    hook: "Um toque por dia — na lista ou no hub. Faixa de 7 dias, frequência e anti-hábitos deixam a rotina visível.",
    steps: [
      {
        title: "Crie com frequência e tipo",
        body: "Todo dia ou N×/semana. Use anti-hábito (ex.: Sem delivery) quando o sucesso for “ficar limpo”.",
      },
      {
        title: "Marque no app ou no hub",
        body: "Bolinha grande = hoje. Faixa S–D = semana Seg→Dom. No hub Vida, a Disciplina do dia permite check-in sem abrir a página.",
      },
      {
        title: "Vincule a uma meta",
        body: "Opcional: cada check-in soma um incremento (1 livro, 0,5 km…) ao progresso da meta ligada.",
      },
    ],
  },
  goals: {
    id: "goals",
    icon: Target,
    title: "Como funcionam as Metas",
    hook: "Objetivos de vida com barra de progresso — financeiras alimentadas pelo saldo do mês.",
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
        title: "Metas financeiras ↔ saldo + investimento",
        body: "Destinar valor = aporte avulso no tipo Investimento. Rotina em Parcelas: você informa o valor planejado por mês; o app calcula a falta atual da meta e cria as parcelas (falta ÷ aporte). Com prazo, o valor mensal vem sugerido.",
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
