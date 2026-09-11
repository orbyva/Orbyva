export type ModuleGuideId =
  | "finance"
  | "travel"
  | "habits"
  | "goals"
  | "places"
  | "car"
  | "movies"
  | "books"
  | "music"
  | "health"
  | "tasks"
  | "notes"
  | "shopping";

export type ModuleGuideStep = {
  title: string;
  body: string;
};

export type ModuleGuideConfig = {
  id: ModuleGuideId;
  /** Título do guia (dialog). */
  title: string;
  /** Frase de 1 linha usada no callout do empty state. */
  hook: string;
  steps: ModuleGuideStep[];
};

/**
 * Guia contextual por módulo, sob demanda. Um único componente
 * (`ModuleGuide`) renderiza qualquer um destes, não há tour forçado.
 */
export const MODULE_GUIDES: Record<ModuleGuideId, ModuleGuideConfig> = {
  finance: {
    id: "finance",
    title: "Como funcionam as Finanças",
    hook: "Lançamentos pessoais: classifique, registre, orce e acompanhe o mês sem planilha.",
    steps: [
      {
        title: "Organize as categorias",
        body: "Natureza (Receita, Despesa, Investimento) → Categoria (ex.: Alimentação) → Subcategoria (ex.: Mercado). Em Categorias você cria do seu jeito.",
      },
      {
        title: "Registre os lançamentos",
        body: "Em Transações, registre cada lançamento com valor, data e classificação. Edite quando precisar.",
      },
      {
        title: "Planeje o mês",
        body: "No Orçamento, defina tetos por categoria e veja o quanto já gastou versus o planejado, com alertas se estourar.",
      },
      {
        title: "Fixas e parceladas",
        body: "Em Recorrências, use Mensal fixa para contas mensais ou anuais (até dezembro do ano da data de início) ou Parcelada Nx (só mensal, valor total ÷ N). A aba Registros lista e liquida; a Projeção soma parcelas do mês (incluindo pagas) com lançamentos avulsos, gráfico com saldo e simulação de compra.",
      },
      {
        title: "Leia o painel",
        body: "Em Finanças (dashboard) você vê saldo, receitas, despesas e o desenho do mês, e pode compartilhar um resumo.",
      },
    ],
  },
  travel: {
    id: "travel",
    title: "Como funcionam as Viagens",
    hook: "Planeje sozinho ou compartilhe a viagem com amigos que também usam o Orbyva.",
    steps: [
      {
        title: "Crie a viagem",
        body: "Destino, datas e status. O card já mostra countdown, orçamento e checklist.",
      },
      {
        title: "Lugares da viagem",
        body: "Na aba Lugares, salve o que quer conhecer (Para visitar) e depois avalie o que já foi, com nota e valor gasto opcional.",
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
        body: "Defina um teto e lance despesas, inclusive divididas. Tudo conversa com os seus lançamentos.",
      },
      {
        title: "Compartilhe e avalie",
        body: "Gere um card da viagem para compartilhar. No fim, avalie lugares visitados, eles entram no módulo Lugares.",
      },
    ],
  },
  habits: {
    id: "habits",
    title: "Como funcionam os Hábitos",
    hook: "Um toque por dia, na lista ou no hub. Hoje para marcar; Mês para ver o padrão.",
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
    title: "Como funcionam as Metas",
    hook: "Objetivos de vida com barra de progresso, financeiras alimentadas pelo saldo do mês.",
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
        title: "Metas financeiras ↔ saldo + categoria Meta",
        body: "Destinar valor = aporte avulso (natureza Investimento → categoria Meta → subcategoria = nome da meta). Rotina em Recorrências: você informa o valor planejado por mês; o app calcula a falta atual da meta e cria as parcelas (falta ÷ aporte). Com prazo, o valor mensal vem sugerido.",
      },
    ],
  },
  places: {
    id: "places",
    title: "Como funcionam os Lugares",
    hook: "Lista Para visitar + diário do que você já conheceu, com nota para lembrar e compartilhar.",
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
        body: "Gere um card do lugar para compartilhar, com nota e o que você achou.",
      },
      {
        title: "Vem das viagens também",
        body: "Lugares avaliados dentro de uma viagem (inclusive compartilhada) aparecem aqui automaticamente.",
      },
    ],
  },
  car: {
    id: "car",
    title: "Como funciona o Veículo",
    hook: "Manutenções, combustível e documentos do carro ou moto, sem planilha paralela.",
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
        body: "Cronograma de revisões e prazos (IPVA, seguro). Gastos entram nos seus lançamentos.",
      },
    ],
  },
  movies: {
    id: "movies",
    title: "Como funciona o Cinema",
    hook: "Watchlist, assistindo, assistidos e abandonados, com nota e card para compartilhar.",
    steps: [
      {
        title: "Monte a watchlist",
        body: "Salve o que quer assistir, filme ou série, e não dependa da memória (nem do algoritmo).",
      },
      {
        title: "Comece a assistir",
        body: "Mova para Assistindo. Em séries, marque episódios e veja o progresso no card, igual ao marca-página dos livros.",
      },
      {
        title: "Termine ou abandone",
        body: "Ao terminar, avalie e compartilhe. Se largar, marque como Abandonei, dá para retomar.",
      },
      {
        title: "Compartilhe a opinião",
        body: "Gere um card com poster e nota para compartilhar onde quiser, sua opinião, do seu jeito.",
      },
    ],
  },
  books: {
    id: "books",
    title: "Como funciona Livros",
    hook: "Estante digital: para ler, lendo com marca-página e comentários, lidos e abandonados.",
    steps: [
      {
        title: "Monte a lista",
        body: "Busque no Google Books e salve o que quer ler, capa, autor e sinopse vêm prontos.",
      },
      {
        title: "Comece a ler",
        body: "Mova para Lendo, use a marca-página e deixe comentários curtos ligados à página.",
      },
      {
        title: "Termine ou abandone",
        body: "Ao terminar, avalie e compartilhe. Se largar o livro, marque como Abandonei, dá para retomar.",
      },
      {
        title: "Compartilhe a opinião",
        body: "Nos lidos, gere um card com capa e nota para compartilhar.",
      },
    ],
  },
  music: {
    id: "music",
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
        body: "Gere um card com capa, nota e faixas avaliadas para compartilhar onde preferir.",
      },
    ],
  },
  health: {
    id: "health",
    title: "Como funciona a Saúde",
    hook: "Hábitos saudáveis, medicações, consultas e métricas corporais num só lugar.",
    steps: [
      {
        title: "Hábitos de saúde",
        body: "Veja e marque os hábitos de saúde do dia (água, alimentação…). Eles também aparecem na página de Hábitos, mas aqui ficam reunidos com o restante da saúde.",
      },
      {
        title: "Medicações e adesão",
        body: "Cadastre tratamentos com posologia e frequência. A adesão dos últimos 30 dias aparece no card e na página dedicada de Medicações.",
      },
      {
        title: "Consultas",
        body: "Registre consultas médicas como tarefas com data e horário. Elas aparecem aqui e na agenda de tarefas.",
      },
      {
        title: "Métricas corporais",
        body: "Registre peso, altura, gordura, circunferências e acompanhe a evolução. O IMC é calculado automaticamente.",
      },
      {
        title: "Lembretes",
        body: "Configure lembretes para medicações, hábitos e consultas. O app avisa na hora certa, direto no navegador.",
      },
    ],
  },
  tasks: {
    id: "tasks",
    title: "Como funcionam as Tarefas",
    hook: "Organize tudo o que precisa fazer: lista, agenda, Gantt e projetos com Kanban.",
    steps: [
      {
        title: "Crie tarefas",
        body: "Título, prazo, prioridade e projeto. Use recorrência para o que se repete (diária, semanal, mensal…).",
      },
      {
        title: "Escolha a visão",
        body: "Lista agrupa por prazo ou prioridade. Agenda mostra o dia em grade horária. Gantt desenha o cronograma visual.",
      },
      {
        title: "Projetos e Kanban",
        body: "Agrupe tarefas em projetos. Cada projeto tem lista, Kanban (colunas arrastáveis), Gantt e notas próprias.",
      },
      {
        title: "Subtarefas e ícones",
        body: "Quebre tarefas grandes em subtarefas. Personalize com ícones (SVG ou da biblioteca) para identificar rápido.",
      },
      {
        title: "Live (tempo real)",
        body: "Inicie o cronômetro numa tarefa e registre quanto tempo dedicou. O player flutuante acompanha você entre páginas.",
      },
    ],
  },
  notes: {
    id: "notes",
    title: "Como funcionam as Notas",
    hook: "Anotações em Markdown ou canvas de desenho, soltas ou vinculadas a projetos.",
    steps: [
      {
        title: "Crie uma nota ou canvas",
        body: "Nota usa Markdown (títulos, listas, código, diagramas Mermaid). Canvas é um quadro de desenho livre.",
      },
      {
        title: "Vincule a um projeto",
        body: "Opcional: associe a nota a um projeto e ela aparece na aba Notas daquele projeto.",
      },
      {
        title: "Blocos avançados",
        body: "Callouts coloridos, diagramas, tabelas e blocos de código com syntax highlighting, tudo dentro do Markdown.",
      },
    ],
  },
  shopping: {
    id: "shopping",
    title: "Como funciona a Lista de Compras",
    hook: "Agrupe o que precisa comprar por categoria e risque o que já comprou.",
    steps: [
      {
        title: "Categorias",
        body: "Crie categorias (Mercado, Farmácia, Casa…) para organizar os itens. Itens sem categoria também são permitidos.",
      },
      {
        title: "Adicione itens",
        body: "Nome, quantidade opcional e categoria. Marque como comprado com um toque.",
      },
      {
        title: "Limpe a lista",
        body: "Depois das compras, remova os itens marcados ou a categoria inteira de uma vez.",
      },
    ],
  },
};

export function getModuleGuide(id: ModuleGuideId): ModuleGuideConfig {
  return MODULE_GUIDES[id];
}
