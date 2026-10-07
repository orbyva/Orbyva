/**
 * Catálogo do painel "O que eu sei" no mobile.
 * As consultas vêm de `toolCatalog.ts`, que o teste mantém igual ao registro do servidor.
 */

import { ORB_CONSULT_AREAS, ORB_CONSULT_COUNT } from "./toolCatalog";

export interface OrbCapabilityArea {
  nome: string;
  tools: string[];
}

export const ORB_CAPABILITY_AREAS: OrbCapabilityArea[] = [
  ...ORB_CONSULT_AREAS.map((area) => ({
    nome: area.nome,
    tools: area.tools.map((tool) => tool.title),
  })),
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

export const ORB_CAPABILITY_CONSULT_COUNT = ORB_CONSULT_COUNT;
