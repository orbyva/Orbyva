export interface OpenInstallment {
  number: number;
  dueDate: string;
}

/**
 * Diff puro: quais parcelas em aberto de uma Recorrência Financeira ainda não
 * têm uma instância de tarefa materializada. A materialização (insert no
 * banco) fica em `api/tasks/tasks.ts`.
 */
export function computeMissingLinkedInstallments(
  openInstallments: OpenInstallment[],
  materializedNumbers: number[]
): OpenInstallment[] {
  const materialized = new Set(materializedNumbers);
  return openInstallments.filter(
    (installment) => !materialized.has(installment.number)
  );
}
