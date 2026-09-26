import { screen } from "@testing-library/react";

/** Mês visível no calendário aberto: o `YYYY-MM` que mais aparece em `data-day`. */
function visibleYearMonth(): string {
  const days = [...document.querySelectorAll("[data-day]")].map(
    (el) => el.getAttribute("data-day")?.slice(0, 7) ?? ""
  );
  const counts = new Map<string, number>();
  for (const key of days) {
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = "";
  let bestN = 0;
  for (const [key, n] of counts) {
    if (n > bestN) {
      best = key;
      bestN = n;
    }
  }
  if (!best) throw new Error("pickDate: calendário aberto sem células data-day");
  return best;
}

/**
 * Abre o `DatePicker` pelo nome acessível do gatilho e escolhe o dia civil `YYYY-MM-DD`.
 * Navega mês a mês quando o alvo não está no mês visível — o nome do botão de dia vem do
 * react-day-picker e não é estável (mesma âncora de `DatePicker.test.tsx`).
 */
export async function pickDate(
  user: { click: (element: Element) => Promise<void> },
  triggerName: string | RegExp,
  iso: string
) {
  await user.click(screen.getByRole("button", { name: triggerName }));
  await screen.findByRole("button", { name: "Hoje" });

  const targetMonth = iso.slice(0, 7);
  for (let i = 0; i < 400; i++) {
    const day = document.querySelector(`[data-day="${iso}"] button`);
    if (day) {
      await user.click(day as HTMLButtonElement);
      return;
    }
    const visible = visibleYearMonth();
    const label = targetMonth > visible ? "Próximo mês" : "Mês anterior";
    await user.click(screen.getByRole("button", { name: label }));
  }
  throw new Error(`pickDate: não achei ${iso}`);
}
