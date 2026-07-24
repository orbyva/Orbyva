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
    hook: "Planeje roteiro, orçamento e gastos de cada viagem em um só lugar.",
    steps: [
      {
        title: "Crie a viagem",
        body: "Comece com destino e datas. O card mostra a contagem regressiva e o status (planejada, em andamento, concluída).",
      },
      {
        title: "Monte roteiro e checklist",
        body: "Adicione dias, atividades e um checklist do que levar. O progresso do checklist aparece no card.",
      },
      {
        title: "Controle o orçamento",
        body: "Defina um teto e registre despesas — inclusive divididas com quem viaja junto. Tudo conversa com o seu livro-caixa.",
      },
      {
        title: "Avalie no fim",
        body: "Ao concluir, avalie lugares visitados. Eles alimentam o módulo Lugares automaticamente.",
      },
    ],
  },
  habits: {
    id: "habits",
    icon: Flame,
    title: "Como funcionam os Hábitos",
    hook: "Marque o que fez hoje e mantenha sequências (streaks) vivas.",
    steps: [
      {
        title: "Crie um hábito",
        body: "Dê um nome e a frequência (diária ou X vezes por semana). Comece com um ou dois — menos é mais.",
      },
      {
        title: "Marque todo dia",
        body: "Um toque marca o dia como feito. A sequência (streak) cresce enquanto você não quebra o ritmo.",
      },
      {
        title: "Acompanhe a semana",
        body: "O progresso semanal e os insights mostram onde você está firme e onde precisa de atenção.",
      },
    ],
  },
  goals: {
    id: "goals",
    icon: Target,
    title: "Como funcionam as Metas",
    hook: "Defina objetivos de vida e acompanhe o progresso até a data.",
    steps: [
      {
        title: "Crie a meta",
        body: "Escolha uma categoria, um valor-alvo e uma unidade (R$, kg, páginas…). Um prazo é opcional, mas ajuda.",
      },
      {
        title: "Atualize o progresso",
        body: "Registre o valor atual quando avançar. A barra de progresso mostra quanto falta.",
      },
      {
        title: "Metas financeiras",
        body: "Metas em R$ mostram um insight de quanto guardar por mês para chegar no prazo.",
      },
    ],
  },
  places: {
    id: "places",
    icon: MapPin,
    title: "Como funcionam os Lugares",
    hook: "Avalie restaurantes, cafés e passeios — na cidade ou em viagem.",
    steps: [
      {
        title: "Registre um lugar",
        body: "Adicione um restaurante, café ou passeio e dê uma nota. Guarde o que valeu (ou não) a pena.",
      },
      {
        title: "Filtre e reveja",
        body: "Use notas e categorias para lembrar aonde voltar e o que recomendar.",
      },
      {
        title: "Vem das viagens também",
        body: "Lugares avaliados dentro de uma viagem aparecem aqui automaticamente.",
      },
    ],
  },
  car: {
    id: "car",
    icon: Car,
    title: "Como funciona o Veículo",
    hook: "Controle manutenções, abastecimentos e documentos do carro ou moto.",
    steps: [
      {
        title: "Cadastre o veículo",
        body: "Informe carro ou moto e os dados básicos. Você pode ter mais de um.",
      },
      {
        title: "Registre abastecimentos",
        body: "Anote litros, valor e quilometragem. O app calcula consumo e custo por km.",
      },
      {
        title: "Manutenções e documentos",
        body: "Acompanhe revisões e prazos (IPVA, seguro). Gastos entram no seu livro-caixa.",
      },
    ],
  },
  movies: {
    id: "movies",
    icon: Film,
    title: "Como funciona o Cinema",
    hook: "Monte sua watchlist, registre opiniões e acompanhe o histórico.",
    steps: [
      {
        title: "Adicione à watchlist",
        body: "Salve filmes e séries que quer assistir para não esquecer.",
      },
      {
        title: "Registre a opinião",
        body: "Ao assistir, dê nota e comente. Séries acompanham episódios vistos.",
      },
      {
        title: "Revisite o histórico",
        body: "Veja o que já assistiu e suas notas para decidir a próxima maratona.",
      },
    ],
  },
};

export function getModuleGuide(id: ModuleGuideId): ModuleGuideConfig {
  return MODULE_GUIDES[id];
}
