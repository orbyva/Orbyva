import { describe, expect, it } from "vitest";
import {
  EVENT_TYPE_CATEGORIES,
  NO_EVENT_TYPE_ICON,
  eventTypeIconFor,
  hasEventTypeIcon,
  indexEventTypeIcons,
  isEventTypeCategory,
} from "@/domain/travel/eventTypes";
import { ACTIVITY_CATEGORY_LABELS } from "@/domain/travel";
import type { EventTypeIconRow } from "@/types/travel";

/**
 * Feature 258. Duas coisas aqui são decisão da feature, não detalhe: `transport` fica **fora** do
 * conjunto personalizável (o ícone do deslocamento é o modo de transporte), e o mapa ignora o que
 * não souber ler em vez de deixar a UI desenhar meia personalização.
 */

function row(over: Partial<EventTypeIconRow> = {}): EventTypeIconRow {
  return {
    id: "etc-1",
    category: "museum",
    icon_key: "star",
    icon_url: null,
    ...over,
  };
}

describe("conjunto de tipos personalizáveis", () => {
  it("é o dos tipos de evento, menos deslocamento", () => {
    expect(EVENT_TYPE_CATEGORIES).not.toContain("transport");
    expect(EVENT_TYPE_CATEGORIES).toContain("museum");
    expect(EVENT_TYPE_CATEGORIES).toHaveLength(
      Object.keys(ACTIVITY_CATEGORY_LABELS).length - 1
    );
  });

  it("isEventTypeCategory recusa transport, vazio e desconhecido", () => {
    expect(isEventTypeCategory("museum")).toBe(true);
    expect(isEventTypeCategory("transport")).toBe(false);
    expect(isEventTypeCategory("")).toBe(false);
    expect(isEventTypeCategory(null)).toBe(false);
    expect(isEventTypeCategory("concerto")).toBe(false);
  });
});

describe("índice das personalizações", () => {
  it("indexa por categoria", () => {
    const map = indexEventTypeIcons([
      row(),
      row({ id: "etc-2", category: "bar", icon_key: null, icon_url: "https://x.test/i.svg" }),
    ]);
    expect(eventTypeIconFor(map, "museum")).toEqual({
      icon_key: "star",
      icon_url: null,
    });
    expect(eventTypeIconFor(map, "bar")).toEqual({
      icon_key: null,
      icon_url: "https://x.test/i.svg",
    });
  });

  it("a URL vence o preset quando um dado antigo trouxer os dois", () => {
    const map = indexEventTypeIcons([
      row({ icon_key: "star", icon_url: "https://x.test/i.svg" }),
    ]);
    expect(eventTypeIconFor(map, "museum")).toEqual({
      icon_key: null,
      icon_url: "https://x.test/i.svg",
    });
  });

  it("ignora categoria que o cliente não conhece e linha sem ícone", () => {
    const map = indexEventTypeIcons([
      row({ category: "transport" }),
      row({ id: "etc-x", category: "inventada" }),
      row({ id: "etc-y", category: "cafe", icon_key: null, icon_url: null }),
    ]);
    expect(map).toEqual({});
  });

  it("sem personalização devolve a escolha vazia, nunca undefined", () => {
    expect(eventTypeIconFor({}, "museum")).toBe(NO_EVENT_TYPE_ICON);
    expect(eventTypeIconFor(null, "museum")).toBe(NO_EVENT_TYPE_ICON);
    expect(eventTypeIconFor({}, null)).toBe(NO_EVENT_TYPE_ICON);
    expect(hasEventTypeIcon(NO_EVENT_TYPE_ICON)).toBe(false);
    expect(hasEventTypeIcon({ icon_key: "star", icon_url: null })).toBe(true);
  });
});
