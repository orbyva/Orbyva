/**
 * Regras de domínio que o APP e as TOOLS DA ORB precisam compartilhar — a fonte única de cada uma.
 *
 * Mesmo papel de `recurring.ts` e pelo mesmo motivo: uma regra reimplementada dos dois lados vira
 * duas verdades sobre o mesmo dado, e a divergência só aparece quando a Orb contradiz a tela na
 * frente do usuário. O que mora aqui é importado por `src/domain/**` e pelas tools; ninguém
 * reescreve.
 *
 * Vale a regra do diretório (cabeçalho de `types.ts`): nada de import externo, nada de API de
 * runtime, nada de tipo de `src/`. Só aritmética e string, iguais no Deno da Edge, no Node do MCP e
 * no browser.
 */

/* ─────────────────────────────────── Viagens ─────────────────────────────────── */

/**
 * Status EFETIVO da viagem — o que a tela de Viagens mostra e o que a Orb responde.
 *
 * PORQUÊ derivar em vez de ler `trip.status`: o valor gravado envelhece sozinho. Uma viagem criada
 * como `planning` continua `planning` no banco enquanto já está acontecendo, e responder pelo valor
 * cru faria a Orb dizer "você está planejando uma viagem" no meio dela. `cancelled` e `completed`
 * são decisões explícitas do usuário e não são recalculadas.
 *
 * Recebe os dias já calculados, e não as datas, porque cada lado tem o próprio relógio: o app conta
 * a partir da meia-noite local (`getDaysUntil`) e as tools a partir do `ctx.today` no fuso do
 * usuário. O que não pode divergir — e por isso mora aqui — é a ÁRVORE DE DECISÃO abaixo, inclusive
 * o corte de 30 dias que separa "planejando" de "próxima".
 *
 * O genérico existe para o app não precisar de cast: quem entra com `TripStatus` sai com
 * `TripStatus`, e o diretório continua sem conhecer o tipo de `src/`.
 *
 * @param daysUntilStart dias civis de hoje até `start_date` (negativo = já começou).
 * @param daysUntilEnd dias civis de hoje até `end_date` (negativo = já terminou).
 */
export function tripEffectiveStatus<T extends string>(
  status: T,
  daysUntilStart: number,
  daysUntilEnd: number
): T | "ongoing" | "upcoming" | "planning" | "completed" {
  if (status === "cancelled" || status === "completed") return status;
  if (daysUntilStart < 0 && daysUntilEnd >= 0) return "ongoing";
  if (daysUntilStart >= 0 && daysUntilStart <= 30) return "upcoming";
  if (daysUntilStart > 30) return "planning";
  if (daysUntilEnd < 0) return "completed";
  return status;
}

/* ──────────────────────────────────── Saúde ──────────────────────────────────── */

/**
 * IMC a partir do peso (kg) e da altura (cm), com UMA casa decimal — o mesmo arredondamento em toda
 * parte, para não existirem dois números diferentes chamados "IMC".
 *
 * `null` quando falta um dos dois (o caso comum: quem só se pesou nunca registrou a altura) ou
 * quando um deles não é número positivo. IMC não é coluna do banco justamente porque deriva de dois
 * valores que mudam em datas diferentes.
 */
export function computeBmi(
  weightKg: number | null | undefined,
  heightCm: number | null | undefined
): number | null {
  if (weightKg == null || heightCm == null) return null;
  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm)) return null;
  if (weightKg <= 0 || heightCm <= 0) return null;
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

/** Faixa do IMC pelos cortes da OMS — é o que dá significado ao número, na tela e na resposta. */
export function bmiCategory(bmi: number | null): string | null {
  if (bmi == null) return null;
  if (bmi < 18.5) return "Abaixo do peso";
  if (bmi < 25) return "Peso normal";
  if (bmi < 30) return "Sobrepeso";
  return "Obesidade";
}
