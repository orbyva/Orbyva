export type AgentSectionId = "resumo" | "detalhamento" | "atencao" | "recomendacao";

export interface AgentMessageSection {
  id: AgentSectionId | "plain";
  title: string;
  content: string;
}

const SECTION_HEADERS: Array<{ id: AgentSectionId; pattern: RegExp; title: string }> = [
  { id: "resumo", pattern: /^\*?\*?\s*Resumo:?\s*\*?\*?\s*$/i, title: "Resumo" },
  {
    id: "detalhamento",
    pattern: /^\*?\*?\s*Detalhamento:?\s*\*?\*?\s*$/i,
    title: "Detalhamento",
  },
  {
    id: "atencao",
    pattern: /^\*?\*?\s*Ponto de aten[cç][aã]o:?\s*\*?\*?\s*$/i,
    title: "Ponto de atenção",
  },
  {
    id: "recomendacao",
    pattern: /^\*?\*?\s*Recomenda[cç][aã]o:?\s*\*?\*?\s*$/i,
    title: "Recomendação",
  },
];

function isSectionHeader(line: string): AgentSectionId | null {
  const trimmed = line.trim();
  for (const header of SECTION_HEADERS) {
    if (header.pattern.test(trimmed)) return header.id;
  }
  return null;
}

export function parseAgentMessage(content: string): AgentMessageSection[] {
  const lines = content.split("\n");
  const sections: AgentMessageSection[] = [];
  let current: AgentMessageSection | null = null;

  for (const line of lines) {
    const sectionId = isSectionHeader(line);
    if (sectionId) {
      if (current) sections.push(current);
      const meta = SECTION_HEADERS.find((h) => h.id === sectionId)!;
      current = { id: sectionId, title: meta.title, content: "" };
      continue;
    }

    if (current) {
      current.content += (current.content ? "\n" : "") + line;
    } else if (line.trim()) {
      current = { id: "plain", title: "", content: line };
    }
  }

  if (current) sections.push(current);

  if (sections.length === 0) {
    return [{ id: "plain", title: "", content: content.trim() }];
  }

  return sections.map((s) => ({ ...s, content: s.content.trim() })).filter((s) => s.content);
}

export const CURRENCY_PATTERN = /R\$\s?[\d.,]+/g;
export const DIMENSION_PATTERN =
  /Natureza\s+\w+|Tipo\s+[\w\s/]+|Classe\s+[\w\s/]+|Receita|Despesa/g;
