/**
 * # Modo de visualização da nota — `?view=` (feature 070)
 *
 * Mora em `domain/` por ser regra pura (texto da URL → modo), testável sem montar o editor, e para
 * o componente continuar exportando só componente (o `react-refresh` reclama do contrário).
 */

/**
 * Os três modos de ver a nota. "Dividir" é o que o prompt pede por trás de "escrever com
 * sofisticação": escrever **vendo** o resultado, em vez de trocar de aba para conferir.
 */
export type ViewMode = "escrever" | "dividir" | "visualizar";

/** Nome do parâmetro na URL. O valor é em português porque a URL é lida por gente. */
export const VIEW_PARAM = "view";

/** Qualquer coisa fora dos três valores cai em "escrever" — URL editada à mão não quebra a tela. */
export function parseViewMode(value: string | null | undefined): ViewMode {
  if (value === "dividir" || value === "visualizar") return value;
  return "escrever";
}
