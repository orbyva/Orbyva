/**
 * Catálogo estático do painel "O que eu sei" no mobile.
 * Espelha as áreas do web sem puxar o registry Deno no Metro.
 */

export interface OrbCapabilityArea {
  nome: string;
  tools: string[];
}

export const ORB_CAPABILITY_AREAS: OrbCapabilityArea[] = [
  {
    nome: "Finanças",
    tools: [
      "Lançamentos",
      "Orçamento do mês",
      "Gasto por categoria",
      "Recorrências",
      "Categorias",
    ],
  },
  {
    nome: "Tarefas e projetos",
    tools: ["Tarefas", "Projetos", "Agenda"],
  },
  {
    nome: "Rotina e conteúdo",
    tools: ["Hábitos", "Metas", "Cinema", "Livros", "Música"],
  },
  {
    nome: "Viagens e lugares",
    tools: ["Viagens", "Lugares", "Roteiro"],
  },
  {
    nome: "Dia a dia",
    tools: ["Compras", "Notas", "Saúde", "Veículos", "Próximos compromissos"],
  },
  {
    nome: "Abrir telas",
    tools: ["Navegar para a tela certa do app"],
  },
  {
    nome: "Criar (você confirma)",
    tools: [
      "Tarefa, lançamento, nota, compra",
      "Orçamento, recorrência, hábito",
      "Viagem, lugar, veículo, saúde",
      "Filme, livro, álbum",
    ],
  },
];

export const ORB_CAPABILITY_CONSULT_COUNT = ORB_CAPABILITY_AREAS.filter(
  (a) => a.nome !== "Criar (você confirma)" && a.nome !== "Abrir telas"
).reduce((n, a) => n + a.tools.length, 0);
