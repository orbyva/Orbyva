/**
 * Os **tipos de evento** do roteiro e a resolução do ícone personalizado de cada um (feature 258).
 *
 * Puro: nenhuma função faz I/O. Quem conversa com o banco é `src/api/travel/eventTypeIcons.ts`, e
 * quem desenha é `src/components/EventTypeIcon.tsx`.
 */
import type { EventTypeIconRow, TripActivityCategory } from "@/types/travel";
import { ACTIVITY_CATEGORY_LABELS } from "./index";

/**
 * O que a interface oferece para personalizar: todo tipo de evento, **menos** `transport`.
 *
 * Deslocamento não é um tipo de evento — é a outra metade da linha do roteiro, e o ícone dele é o
 * modo de transporte (avião, trem, carro). Personalizar ali com este seletor seria personalizar
 * outra coisa com o mesmo botão.
 *
 * Derivado de `ACTIVITY_CATEGORY_LABELS` em vez de repetido à mão: tipo novo entra aqui sozinho.
 */
export const EVENT_TYPE_CATEGORIES: TripActivityCategory[] = (
  Object.keys(ACTIVITY_CATEGORY_LABELS) as TripActivityCategory[]
).filter((category) => category !== "transport");

/** `true` quando a categoria é personalizável — a mesma pergunta que o formulário faz para decidir
 * se mostra o seletor. */
export function isEventTypeCategory(
  category: string | null | undefined
): category is TripActivityCategory {
  return (
    !!category &&
    EVENT_TYPE_CATEGORIES.includes(category as TripActivityCategory)
  );
}

/** O que o ícone de um tipo pode ser: um preset lucide, um arquivo da biblioteca, ou nada (e aí o
 * padrão de `PLACE_TYPE_META` desenha). */
export type EventTypeIconChoice = {
  icon_key: string | null;
  icon_url: string | null;
};

export const NO_EVENT_TYPE_ICON: EventTypeIconChoice = {
  icon_key: null,
  icon_url: null,
};

/** Mapa `category → personalização`, que é como o hook entrega a tabela inteira para a tela. */
export type EventTypeIconMap = Record<string, EventTypeIconChoice>;

/**
 * Indexa as linhas da tabela por categoria.
 *
 * Linha com categoria que o cliente não conhece é **ignorada** (a coluna é texto livre de
 * propósito), e linha sem ícone nenhum também — o `check` do banco a impede, mas um mapa que
 * devolvesse `{null, null}` faria a UI acreditar que há personalização onde não há.
 */
export function indexEventTypeIcons(
  rows: readonly EventTypeIconRow[]
): EventTypeIconMap {
  const map: EventTypeIconMap = {};
  for (const row of rows) {
    if (!isEventTypeCategory(row.category)) continue;
    if (!row.icon_key && !row.icon_url) continue;
    map[row.category] = {
      // Mutuamente exclusivos: com URL, o preset não participa — é a mesma regra de `task` e de
      // `link_icon_rule`, afirmada aqui para um dado antigo inconsistente não desenhar dois ícones.
      icon_key: row.icon_url ? null : row.icon_key,
      icon_url: row.icon_url,
    };
  }
  return map;
}

/** A personalização de um tipo, ou "nenhuma". Nunca devolve `undefined` — quem desenha não precisa
 * saber a diferença entre "sem linha" e "linha sem ícone". */
export function eventTypeIconFor(
  map: EventTypeIconMap | null | undefined,
  category: string | null | undefined
): EventTypeIconChoice {
  if (!map || !category) return NO_EVENT_TYPE_ICON;
  return map[category] ?? NO_EVENT_TYPE_ICON;
}

/** `true` quando há o que desenhar no lugar do ícone padrão. */
export function hasEventTypeIcon(choice: EventTypeIconChoice): boolean {
  return !!(choice.icon_key || choice.icon_url);
}
