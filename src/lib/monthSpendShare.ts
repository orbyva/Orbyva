import { BRAND_COLORS } from "@/lib/brand";
import { formatBRL } from "@/lib/currency";
import {
  SHARE_BRAND,
  SHARE_W,
  canvasToPngBlob,
  createShareCanvas,
  drawShareFooter,
  drawShareHeader,
  ensureShareBrandAssets,
  paintShareBackground,
  shareNativePayload,
  slugify,
} from "@/lib/shareKit";

export type MonthSpendShareInput = {
  year: number;
  month: number;
  receita: number;
  despesa: number;
  /** Teto de despesa (orçamento) do mês, opcional. */
  budgetPlanned?: number | null;
};

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

/** Quanto sobrou vs teto (se houver orçamento) ou vs receita. */
export function monthRemainingVsPlan(input: MonthSpendShareInput): {
  label: string;
  value: number;
} {
  const planned = input.budgetPlanned;
  if (planned != null && planned > 0) {
    return {
      label: "O que sobrou do teto",
      value: planned - input.despesa,
    };
  }
  return {
    label: "O que sobrou",
    value: input.receita - input.despesa,
  };
}

export async function generateMonthSpendShareImage(
  input: MonthSpendShareInput
): Promise<Blob | null> {
  await ensureShareBrandAssets();
  const { canvas, ctx } = createShareCanvas();
  paintShareBackground(ctx, BRAND_COLORS.primaryDark, BRAND_COLORS.ink);
  drawShareHeader(ctx, "Fechamento do mês");

  const label = monthLabel(input.year, input.month);
  const balance = input.receita - input.despesa;
  const leftover = monthRemainingVsPlan(input);

  ctx.textAlign = "left";
  ctx.fillStyle = SHARE_BRAND.paper;
  ctx.font = `800 56px ${SHARE_BRAND.font}`;
  ctx.fillText(label, 72, 300);

  const cards = [
    { title: "Receitas", value: formatBRL(input.receita), color: "#4ADE80" },
    { title: "Despesas", value: formatBRL(input.despesa), color: "#F87171" },
    {
      title: "Saldo",
      value: formatBRL(balance),
      color: balance >= 0 ? "#4ADE80" : "#F87171",
    },
    {
      title: leftover.label,
      value: formatBRL(leftover.value),
      color: leftover.value >= 0 ? "#4ADE80" : "#F87171",
    },
  ];

  let y = 360;
  for (const card of cards) {
    ctx.fillStyle = "rgba(248, 250, 252, 0.08)";
    ctx.beginPath();
    ctx.roundRect(72, y, SHARE_W - 144, 128, 28);
    ctx.fill();
    ctx.fillStyle = SHARE_BRAND.muted;
    ctx.font = `600 24px ${SHARE_BRAND.font}`;
    ctx.fillText(card.title, 104, y + 42);
    ctx.fillStyle = card.color;
    ctx.font = `800 44px ${SHARE_BRAND.font}`;
    ctx.fillText(card.value, 104, y + 98);
    y += 152;
  }

  drawShareFooter(ctx);
  return canvasToPngBlob(canvas);
}

export function buildMonthSpendShareText(input: MonthSpendShareInput): string {
  const balance = input.receita - input.despesa;
  const leftover = monthRemainingVsPlan(input);
  const lines = [
    `📊 ${monthLabel(input.year, input.month)}`,
    `Receitas: ${formatBRL(input.receita)}`,
    `Despesas: ${formatBRL(input.despesa)}`,
    `Saldo: ${formatBRL(balance)}`,
    `${leftover.label}: ${formatBRL(leftover.value)}`,
  ];
  if (input.budgetPlanned != null && input.budgetPlanned > 0) {
    lines.splice(3, 0, `Teto: ${formatBRL(input.budgetPlanned)}`);
  }
  lines.push(`via ${SHARE_BRAND.name}`);
  return lines.join("\n");
}

export async function shareMonthSpendNative(
  input: MonthSpendShareInput,
  imageBlob: Blob | null
) {
  return shareNativePayload({
    title: monthLabel(input.year, input.month),
    text: buildMonthSpendShareText(input),
    filename: `${slugify(monthLabel(input.year, input.month))}-mes.png`,
    imageBlob,
  });
}
