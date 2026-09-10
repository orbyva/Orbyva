/** month = 1–12 */
export function formatYm(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}
