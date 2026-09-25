/**
 * Consulta médica (feature 061) é uma tarefa com `is_consultation`, e o especialista mora no
 * `title` — decisão registrada na feature: `title` é o único campo que a célula do calendário
 * renderiza, então é ele que precisa carregar "quem" além de "o quê". Uma coluna `specialist` em
 * `task` só faria sentido para uma fração das linhas da tabela.
 *
 * Compõe "Especialidade — Profissional"; sem profissional, só a especialidade (nada de travessão
 * solto no fim do título). Espaços em volta são aparados dos dois lados.
 */
export function buildConsultationTitle(specialty: string, professional?: string | null): string {
  const left = specialty.trim();
  const right = (professional ?? "").trim();
  if (!right) return left;
  if (!left) return right;
  return `${left} — ${right}`;
}

/**
 * Recupera especialidade e profissional do `title` que `buildConsultationTitle` gravou.
 * Sem travessão, o título inteiro é a especialidade — o mesmo formato da criação sem profissional.
 */
export function splitConsultationTitle(title: string): {
  specialty: string;
  professional: string;
} {
  const sep = " — ";
  const index = title.indexOf(sep);
  if (index === -1) return { specialty: title.trim(), professional: "" };
  return {
    specialty: title.slice(0, index).trim(),
    professional: title.slice(index + sep.length).trim(),
  };
}
