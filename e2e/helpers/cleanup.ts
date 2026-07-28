import { rest } from "./auth";

/** Prefixo padronizado — teardown apaga por description like `E2E%`. */
export const E2E_MARKER = "E2E";

export function e2eStamp(kind?: string): string {
  return kind ? `E2E-${kind}-${Date.now()}` : `E2E ${Date.now()}`;
}

type IdRow = { id: number };

/**
 * Rastreia o que o teste criou/alterou e limpa no finally.
 * Também varre leftovers com description começando em E2E.
 */
export class E2eCleanup {
  private token: string;
  private txIds: number[] = [];
  private budgetIds: number[] = [];
  private recurringIds: number[] = [];
  private budgetRestores: { id: number; planned_value: number }[] = [];

  constructor(token: string) {
    this.token = token;
  }

  trackTx(id: number | undefined | null) {
    if (id != null) this.txIds.push(id);
  }

  trackBudget(id: number | undefined | null) {
    if (id != null) this.budgetIds.push(id);
  }

  trackRecurring(id: number | undefined | null) {
    if (id != null) this.recurringIds.push(id);
  }

  /** Orçamento que já existia — restaura o valor ao fim (não apaga). */
  trackBudgetRestore(id: number, previousPlanned: number) {
    this.budgetRestores.push({ id, planned_value: previousPlanned });
  }

  async run(): Promise<void> {
    for (const id of this.txIds) {
      await rest("transaction", this.token, {
        method: "DELETE",
        query: `id=eq.${id}`,
      }).catch(() => undefined);
    }
    for (const id of this.recurringIds) {
      await rest("recurring_transaction", this.token, {
        method: "DELETE",
        query: `id=eq.${id}`,
      }).catch(() => undefined);
    }
    for (const id of this.budgetIds) {
      await rest("monthly_budget", this.token, {
        method: "DELETE",
        query: `id=eq.${id}`,
      }).catch(() => undefined);
    }
    for (const row of this.budgetRestores) {
      await rest("monthly_budget", this.token, {
        method: "PATCH",
        query: `id=eq.${row.id}`,
        body: JSON.stringify({ planned_value: row.planned_value }),
      }).catch(() => undefined);
    }

    await sweepE2eByDescription(this.token);
  }
}

/** Apaga txs/parcelas órfãs marcadas E2E* (inclui runs anteriores). */
export async function sweepE2eByDescription(token: string): Promise<void> {
  // PostgREST: * = wildcard
  await rest("transaction", token, {
    method: "DELETE",
    query: "description=like.E2E*",
  }).catch(() => undefined);

  await rest("recurring_transaction", token, {
    method: "DELETE",
    query: "description=like.E2E*",
  }).catch(() => undefined);
}

export function firstId(json: unknown): number | undefined {
  if (Array.isArray(json) && json[0] && typeof json[0] === "object") {
    const id = (json[0] as IdRow).id;
    return typeof id === "number" ? id : undefined;
  }
  if (json && typeof json === "object" && "id" in json) {
    const id = (json as IdRow).id;
    return typeof id === "number" ? id : undefined;
  }
  return undefined;
}
