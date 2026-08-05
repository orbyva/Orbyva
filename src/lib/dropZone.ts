/**
 * Alvos de soltura declarados no DOM via `data-drop-zone`, para que o arraste
 * por toque possa descobri-los com `elementFromPoint`.
 */
export const DROP_ZONE_SELECTOR = "[data-drop-zone]";

const SEPARATOR = "|";

export type DropZoneTarget = {
  kind: string;
  parts: string[];
};

export function dropZoneAttrs(
  kind: string,
  ...parts: Array<string | number>
): { "data-drop-zone": string } {
  return { "data-drop-zone": [kind, ...parts].join(SEPARATOR) };
}

export function readDropZone(
  zone: string | null | undefined
): DropZoneTarget | null {
  if (!zone) return null;
  const [kind, ...parts] = zone.split(SEPARATOR);
  if (!kind) return null;
  return { kind, parts };
}
