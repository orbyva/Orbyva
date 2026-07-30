import {
  BookOpen,
  Car,
  Disc3,
  Film,
  Flame,
  MapPin,
  Plane,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type ModuleGuideId =
  | "finance"
  | "travel"
  | "habits"
  | "goals"
  | "places"
  | "car"
  | "movies"
  | "books"
  | "music";

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
  finance: {
    id: "finance",
    icon: Wallet,
    title: "Como funcionam as Finanças",
    hook: "Livro-caixa pessoal: classifique, registre, orce e acompanhe o mês sem planilha.",
    steps: [
      {
        title: "Organize as dimensões",
        body: "Natureza (Receita, Despesa, Investimento) → Tipo (ex.: Alimentação) → Classe (ex.: Mercado). Em Dimensões você cria tipos e classes do seu jeito.",
      },
      {
        title: "Lance no extrato",
        body: "Em Transações, registre cada movimentação com valor, data e classificação. Dá para importar CSV e editar depois.",
      },
      {
        title: "Planeje o mês",
        body: "No Orçamento, defina tetos por categoria e veja o quanto já gastou versus o planejado — com alertas se estourar.",
      },
      {
        title: "Recorrências e parcelas",
        body: "Cadastre contas e receitas fixas (ou parcelas). O app avisa vencimentos e ajuda a projetar o saldo do mês.",
      },
      {
        title: "Leia o painel",
        body: "Em Finanças (dashboard) você vê saldo, receitas, despesas e o desenho do mês — e pode compartilhar um resumo.",
      },
    ],
  },
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
        title: "Lugares da viagem",
        body: "Na aba Lugares, salve o que quer conhecer (Para visitar) e depois avalie o que já foi — com nota e valor gasto opcional.",
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
    hook: "Um toque por dia — na lista ou no hub. Hoje para marcar; Mês para ver o padrão.",
    steps: [
      {
        title: "Crie com frequência e tipo",
        body: "Todo dia ou N×/semana. Use anti-hábito (ex.: Sem delivery) quando o sucesso for “ficar limpo”.",
      },
      {
        title: "Hoje e Mês",
        body: "Em Hoje: bolinha + faixa da semana para check-in. Em Mês: heatmap geral e por hábito (feitos e falhas). No hub, a Disciplina do dia também marca sem abrir a página.",
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
        title: "Metas financeiras ↔ saldo + tipo Meta",
        body: "Destinar valor = aporte avulso (natureza Investimento → tipo Meta → classe = nome da meta). Rotina em Parcelas: você informa o valor planejado por mês; o app calcula a falta atual da meta e cria as parcelas (falta ÷ aporte). Com prazo, o valor mensal vem sugerido.",
      },
    ],
  },
  places: {
    id: "places",
    icon: MapPin,
    title: "Como funcionam os Lugares",
    hook: "Lista Para visitar + diário do que você já conheceu — com nota para lembrar e compartilhar.",
    steps: [
      {
        title: "Salve o que quer conhecer",
        body: "Em Para visitar, guarde restaurantes, cafés e passeios sem precisar avaliar ainda.",
      },
      {
        title: "Marque como visitado",
        body: "Depois da ida, mude para Visitado, ponha nota e valor (opcional). Com viagem, o valor entra nos gastos; se quiser, registre também no extrato.",
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
    hook: "Watchlist, assistindo, assistidos e abandonados — com nota e card para Stories.",
    steps: [
      {
        title: "Monte a watchlist",
        body: "Salve o que quer assistir — filme ou série — e não dependa da memória (nem do algoritmo).",
      },
      {
        title: "Comece a assistir",
        body: "Mova para Assistindo. Em séries, marque episódios e veja o progresso no card — igual ao marca-página dos livros.",
      },
      {
        title: "Termine ou abandone",
        body: "Ao terminar, avalie e compartilhe. Se largar, marque como Abandonei — dá para retomar.",
      },
      {
        title: "Compartilhe a opinião",
        body: "Gere um card com poster e nota para Stories, WhatsApp ou onde quiser — sua opinião, do seu jeito.",
      },
    ],
  },
  books: {
    id: "books",
    icon: BookOpen,
    title: "Como funciona Livros",
    hook: "Estante digital: para ler, lendo com marca-página e comentários, lidos e abandonados.",
    steps: [
      {
        title: "Monte a lista",
        body: "Busque no Google Books e salve o que quer ler — capa, autor e sinopse vêm prontos.",
      },
      {
        title: "Comece a ler",
        body: "Mova para Lendo, use a marca-página e deixe comentários curtos ligados à página.",
      },
      {
        title: "Termine ou abandone",
        body: "Ao terminar, avalie e compartilhe. Se largar o livro, marque como Abandonei — dá para retomar.",
      },
      {
        title: "Compartilhe a opinião",
        body: "Nos lidos, gere um card com capa e nota para Stories ou WhatsApp.",
      },
    ],
  },
  music: {
    id: "music",
    icon: Disc3,
    title: "Como funciona Música",
    hook: "Álbuns e EPs: busca no catálogo, ouvidos com nota e opinião.",
    steps: [
      {
        title: "Monte a lista",
        body: "Busque álbuns e EPs no catálogo (capa e tracklist vêm prontos) ou cadastre manualmente. Singles ficam de fora de propósito.",
      },
      {
        title: "Ouça e avalie",
        body: "Ao ouvir, marque como Ouvido, dê nota e deixe um comentário se quiser. No detalhe, veja a tracklist, note cada faixa e atualize metadados pelo catálogo.",
      },
      {
        title: "Filtre e reencontre",
        body: "Filtre por artista, tipo (álbum, EP…) e nota mínima nos ouvidos.",
      },
      {
        title: "Compartilhe a opinião",
        body: "Gere um card com capa, nota e faixas avaliadas para Stories, WhatsApp ou onde preferir.",
      },
    ],
  },
};

export function getModuleGuide(id: ModuleGuideId): ModuleGuideConfig {
  return MODULE_GUIDES[id];
}
