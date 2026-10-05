/** Formato das variáveis do `src/index.css` do web: `H S% L%`, sem vírgula nem `hsl()`. */
const HSL_VAR = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/;

export function hslToHex(value: string): string {
  const match = HSL_VAR.exec(value.trim());
  if (!match) throw new Error(`Cor HSL fora do formato "H S% L%": "${value}"`);

  const h = Number(match[1]) % 360;
  const s = Number(match[2]) / 100;
  const l = Number(match[3]) / 100;

  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const sector = h / 60;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));
  const [r, g, b] =
    sector < 1
      ? [chroma, x, 0]
      : sector < 2
        ? [x, chroma, 0]
        : sector < 3
          ? [0, chroma, x]
          : sector < 4
            ? [0, x, chroma]
            : sector < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const m = l - chroma / 2;

  const channel = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Véu escuro fixo nos dois temas (no escuro, `foreground` é claro e não serve de véu). */
export function scrim(alpha: number): string {
  return `rgba(11,15,26,${alpha})`;
}

/** Fundo atrás de modal/folha. */
export const SCRIM = scrim(0.45);

/** Texto/ícone sobre capa ou foto, sempre em cima de `scrim`. */
export const ON_MEDIA = "#FFFFFF";
