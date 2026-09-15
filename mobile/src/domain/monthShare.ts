import { formatBRL } from "@/lib/currency";

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1] ?? month}/${year}`;
}

export function monthRemainingVsPlan(input: {
  receita: number;
  despesa: number;
  budgetPlanned?: number | null;
}): { label: string; value: number } {
  const planned = input.budgetPlanned;
  if (planned != null && planned > 0) {
    return { label: "O que sobrou do teto", value: planned - input.despesa };
  }
  return { label: "O que sobrou", value: input.receita - input.despesa };
}

export function monthShareText(input: {
  year: number;
  month: number;
  receita: number;
  despesa: number;
  budgetPlanned?: number | null;
}): string {
  const leftover = monthRemainingVsPlan(input);
  const saldo = input.receita - input.despesa;
  const lines = [
    `📊 ${monthLabel(input.year, input.month)}`,
    `Receitas: ${formatBRL(input.receita)}`,
    `Despesas: ${formatBRL(input.despesa)}`,
  ];
  if (input.budgetPlanned != null && input.budgetPlanned > 0) {
    lines.push(`Teto: ${formatBRL(input.budgetPlanned)}`);
  }
  lines.push(`Saldo: ${formatBRL(saldo)}`);
  lines.push(`${leftover.label}: ${formatBRL(leftover.value)}`);
  lines.push("via Orbyva");
  return lines.join("\n");
}
