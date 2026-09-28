import type { ClipboardEvent } from "react";
import { looksLikeSvgMarkup } from "@/domain/tasks/svgIcon";

/**
 * O markup de SVG que uma colagem trouxe, ou `null` quando ela não é para a biblioteca.
 *
 * `Ctrl+V` num container sem campo focado não chega a lugar nenhum — daí o atalho: quem monta a
 * biblioteca liga isto no `onPaste` do seu container e, se o que foi colado **parece** SVG, abre o
 * campo de colar já preenchido. Quem valida de verdade é `prepareSvgIcon`, dentro do campo.
 *
 * Com o foco em qualquer campo (o de renomear, o próprio textarea) sai da frente: quem tem foco é
 * quem deve receber a colagem.
 */
export function pastedSvgFromEvent(e: ClipboardEvent): string | null {
  const target = e.target as HTMLElement | null;
  const tag = target?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || target?.isContentEditable) return null;
  const text = e.clipboardData?.getData("text/plain") ?? "";
  return looksLikeSvgMarkup(text) ? text : null;
}
