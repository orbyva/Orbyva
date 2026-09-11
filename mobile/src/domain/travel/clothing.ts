/**
 * Sugestões de roupa V2 (Weat-like): atributos, dia/noite, faixas horárias,
 * feels like / vento / umidade. Ver docs/improve.md.
 */
import type {
  WeatherDayForecast,
  WeatherHourForecast,
  WeatherPeriodForecast,
} from "@/lib/googleWeather";

export type ClothingFabric = "algodao" | "sintetico" | "la" | "impermeavel";
export type ClothingThickness = "fina" | "media" | "grossa";
export type ClothingLength = "curta" | "media" | "longa";

export type ClothingIconKey =
  | "tank"
  | "shirt"
  | "long-sleeve"
  | "jacket"
  | "coat"
  | "raincoat"
  | "pants"
  | "warm-pants"
  | "shorts"
  | "shoe"
  | "umbrella";

export type ClothingItem =
  | "regata"
  | "camiseta_leve"
  | "camisa_manga_longa"
  | "casaco_leve"
  | "casaco_quente"
  | "capa_chuva"
  | "calca_leve"
  | "calca_quente"
  | "shorts"
  | "calcado_fechado"
  | "guarda_chuva";

export type ClothingSlot = "top" | "bottom" | "outer" | "accessory";

export type ClothingMeta = {
  label: string;
  fabric: ClothingFabric;
  thickness: ClothingThickness;
  length: ClothingLength;
  icon: ClothingIconKey;
  slot: ClothingSlot;
};

export const CLOTHING_META: Record<ClothingItem, ClothingMeta> = {
  regata: {
    label: "Regata",
    fabric: "algodao",
    thickness: "fina",
    length: "curta",
    icon: "tank",
    slot: "top",
  },
  camiseta_leve: {
    label: "Camiseta leve",
    fabric: "algodao",
    thickness: "fina",
    length: "curta",
    icon: "shirt",
    slot: "top",
  },
  camisa_manga_longa: {
    label: "Manga longa",
    fabric: "algodao",
    thickness: "media",
    length: "longa",
    icon: "long-sleeve",
    slot: "top",
  },
  casaco_leve: {
    label: "Casaco leve",
    fabric: "sintetico",
    thickness: "media",
    length: "media",
    icon: "jacket",
    slot: "outer",
  },
  casaco_quente: {
    label: "Casaco quente",
    fabric: "la",
    thickness: "grossa",
    length: "longa",
    icon: "coat",
    slot: "outer",
  },
  capa_chuva: {
    label: "Capa de chuva",
    fabric: "impermeavel",
    thickness: "fina",
    length: "longa",
    icon: "raincoat",
    slot: "outer",
  },
  calca_leve: {
    label: "Calça leve",
    fabric: "algodao",
    thickness: "fina",
    length: "longa",
    icon: "pants",
    slot: "bottom",
  },
  calca_quente: {
    label: "Calça quente",
    fabric: "la",
    thickness: "grossa",
    length: "longa",
    icon: "warm-pants",
    slot: "bottom",
  },
  shorts: {
    label: "Shorts / bermuda",
    fabric: "algodao",
    thickness: "fina",
    length: "curta",
    icon: "shorts",
    slot: "bottom",
  },
  calcado_fechado: {
    label: "Calçado fechado",
    fabric: "sintetico",
    thickness: "media",
    length: "curta",
    icon: "shoe",
    slot: "accessory",
  },
  guarda_chuva: {
    label: "Guarda-chuva",
    fabric: "impermeavel",
    thickness: "fina",
    length: "media",
    icon: "umbrella",
    slot: "accessory",
  },
};

/** @deprecated use CLOTHING_META[item].label */
export const CLOTHING_LABELS: Record<ClothingItem, string> = Object.fromEntries(
  (Object.keys(CLOTHING_META) as ClothingItem[]).map((k) => [
    k,
    CLOTHING_META[k].label,
  ])
) as Record<ClothingItem, string>;

export const FABRIC_LABELS: Record<ClothingFabric, string> = {
  algodao: "algodão",
  sintetico: "sintético",
  la: "lã",
  impermeavel: "impermeável",
};

/**
 * Propriedades do tecido por escrito (legíveis, sem jargão).
 */
export const FABRIC_TRAIT_LABELS: Record<ClothingFabric, string[]> = {
  algodao: ["algodão", "leve", "respirável"],
  sintetico: ["sintético", "liso", "leve"],
  la: ["lã", "malha", "quente"],
  impermeavel: ["impermeável", "capa", "protegido"],
};

export function fabricTraitsLine(fabric: ClothingFabric): string {
  return FABRIC_TRAIT_LABELS[fabric].join(" · ");
}

export const THICKNESS_LABELS: Record<ClothingThickness, string> = {
  fina: "fina",
  media: "média",
  grossa: "grossa",
};

export const LENGTH_LABELS: Record<ClothingLength, string> = {
  curta: "curta",
  media: "média",
  longa: "longa",
};

export type ClothingPartSuggestion = {
  key: "day" | "night";
  label: string;
  tempC: number | null;
  items: ClothingItem[];
  summary: string;
};

export type ClothingBandKey = "madrugada" | "manha" | "tarde" | "noite";

export type ClothingHourBand = {
  key: ClothingBandKey;
  label: string;
  hourStart: number;
  hourEnd: number;
  tempC: number | null;
  feelsLikeC: number | null;
  rainProbabilityPercent: number | null;
  items: ClothingItem[];
  summary: string;
};

export type ClothingHourSlot = {
  localHour: number;
  tempC: number | null;
  feelsLikeC: number | null;
  rainProbabilityPercent: number | null;
  /** Peça principal (tipologia) para o ícone da faixa. */
  primaryItem: ClothingItem | null;
  items: ClothingItem[];
};

export type ClothingOutfitSlot = {
  slot: ClothingSlot;
  label: string;
  item: ClothingItem;
  fabric: ClothingFabric;
  thickness: ClothingThickness;
  length: ClothingLength;
};

/** Bloco da sugestão (dia, noite ou só janela restante). */
export type ClothingOutfitSegment = {
  key: "day" | "night" | "remaining";
  label: string;
  tempC: number | null;
  outfit: ClothingOutfitSlot[];
};

export type DayClothingSuggestion = {
  date: string | null;
  conditionText: string | null;
  maxC: number | null;
  minC: number | null;
  feelsLikeDayC: number | null;
  feelsLikeNightC: number | null;
  windSpeedKph: number | null;
  humidityPercent: number | null;
  rainProbabilityPercent: number | null;
  items: ClothingItem[];
  summary: string;
  /**
   * Condição p/ resumo: "Ensolarado" ou
   * "Ensolarado de dia · Limpo à noite" quando diferem.
   */
  conditionPhrase: string | null;
  /** Peças principais do dia (estilo Weat: top / outer / bottom). */
  outfit: ClothingOutfitSlot[];
  /** Quando amplitude dia/noite é grande: sugestão separada (manhã→noite). */
  outfitSegments: ClothingOutfitSegment[];
  /** Ex.: "Agora → 23h" quando só resta a noite. */
  outfitWindowLabel: string | null;
  /** Frase curta p/ resumo colapsado. */
  outfitPhrase: string;
  dayPart: ClothingPartSuggestion;
  nightPart: ClothingPartSuggestion;
  bands: ClothingHourBand[];
  hourlySlots: ClothingHourSlot[];
};

type ClimateInput = {
  tempC: number | null;
  feelsLikeC?: number | null;
  windSpeedKph?: number | null;
  humidityPercent?: number | null;
  rainProbabilityPercent?: number | null;
  precipitationMm?: number | null;
};

/** Temperatura efetiva: feels like > ajustes por vento/umidade > temp. */
export function effectiveTempC(input: ClimateInput): number | null {
  if (
    typeof input.feelsLikeC === "number" &&
    Number.isFinite(input.feelsLikeC)
  ) {
    return input.feelsLikeC;
  }
  if (input.tempC == null || !Number.isFinite(input.tempC)) return null;
  let t = input.tempC;
  const wind = input.windSpeedKph ?? 0;
  const humidity = input.humidityPercent ?? 50;
  if (wind >= 35) t -= 3;
  else if (wind >= 25) t -= 2;
  else if (wind >= 15) t -= 1;
  if (humidity >= 80 && t >= 26) t += 2;
  else if (humidity >= 70 && t >= 28) t += 1;
  return t;
}

function itemsForClimate(input: ClimateInput): ClothingItem[] {
  const items = new Set<ClothingItem>();
  const t = effectiveTempC(input);
  const rain = input.rainProbabilityPercent ?? 0;
  const precip = input.precipitationMm ?? 0;
  const wind = input.windSpeedKph ?? 0;
  const humidity = input.humidityPercent ?? 0;

  if (t == null) {
    items.add("camiseta_leve");
    items.add("calca_leve");
  } else if (t >= 30) {
    items.add("regata");
    items.add("shorts");
  } else if (t >= 26) {
    items.add("camiseta_leve");
    items.add("shorts");
  } else if (t >= 22) {
    items.add("camiseta_leve");
    items.add("calca_leve");
  } else if (t >= 16) {
    items.add("camisa_manga_longa");
    items.add("calca_leve");
    items.add("casaco_leve");
  } else if (t >= 10) {
    items.add("camisa_manga_longa");
    items.add("calca_quente");
    items.add("casaco_quente");
    items.add("calcado_fechado");
  } else {
    items.add("camisa_manga_longa");
    items.add("calca_quente");
    items.add("casaco_quente");
    items.add("calcado_fechado");
  }

  if (wind >= 30 && t != null && t < 22) {
    items.add("casaco_quente");
    items.add("calcado_fechado");
  } else if (wind >= 20 && t != null && t < 18) {
    items.add("casaco_leve");
  }

  if (humidity >= 85 && t != null && t >= 24) {
    items.add("camiseta_leve");
    items.delete("camisa_manga_longa");
  }

  if (rain >= 40 || precip >= 2) {
    items.add("capa_chuva");
    items.add("guarda_chuva");
    items.add("calcado_fechado");
  }

  return [...items];
}

function itemsForDayAggregate(day: WeatherDayForecast): ClothingItem[] {
  const dayItems = itemsForClimate({
    tempC: day.maxTemperatureC,
    feelsLikeC: day.daytime?.feelsLikeC,
    windSpeedKph: day.daytime?.windSpeedKph ?? day.windSpeedKph,
    humidityPercent: day.daytime?.humidityPercent ?? day.humidityPercent,
    rainProbabilityPercent:
      day.daytime?.rainProbabilityPercent ?? day.rainProbabilityPercent,
    precipitationMm: day.daytime?.precipitationMm ?? day.precipitationMm,
  });
  const nightItems = itemsForClimate({
    tempC: day.minTemperatureC,
    feelsLikeC: day.nighttime?.feelsLikeC,
    windSpeedKph: day.nighttime?.windSpeedKph ?? day.windSpeedKph,
    humidityPercent: day.nighttime?.humidityPercent ?? day.humidityPercent,
    rainProbabilityPercent:
      day.nighttime?.rainProbabilityPercent ?? day.rainProbabilityPercent,
    precipitationMm: day.nighttime?.precipitationMm ?? day.precipitationMm,
  });
  return [...new Set([...dayItems, ...nightItems])];
}

function clothingPhrase(items: ClothingItem[], limit = 3): string {
  return items
    .slice(0, limit)
    .map((i) => CLOTHING_META[i].label.toLowerCase())
    .join(", ");
}

function summaryForClimate(
  items: ClothingItem[],
  input: ClimateInput & { conditionText?: string | null }
): string {
  const t = effectiveTempC(input);
  const rain = input.rainProbabilityPercent ?? 0;
  const parts: string[] = [];
  if (t != null) parts.push(`~${Math.round(t)}°C`);
  if (input.conditionText) parts.push(input.conditionText);
  if (rain >= 40) parts.push(`chuva ~${rain}%`);
  if ((input.windSpeedKph ?? 0) >= 25) {
    parts.push(`vento ${Math.round(input.windSpeedKph!)} km/h`);
  }
  const clothes = clothingPhrase(items);
  if (clothes) parts.push(`leve ${clothes}`);
  return parts.join(" · ");
}

function summaryForDay(items: ClothingItem[], day: WeatherDayForecast): string {
  const max = day.maxTemperatureC;
  const min = day.minTemperatureC;
  const feels =
    day.daytime?.feelsLikeC ??
    effectiveTempC({
      tempC: max,
      feelsLikeC: day.daytime?.feelsLikeC,
      windSpeedKph: day.daytime?.windSpeedKph ?? day.windSpeedKph,
      humidityPercent: day.daytime?.humidityPercent ?? day.humidityPercent,
    });
  const rain = day.rainProbabilityPercent ?? 0;
  const parts: string[] = [];
  if (feels != null) parts.push(`Sensação ~${Math.round(feels)}°C`);
  if (max != null && min != null) {
    parts.push(`mín ${Math.round(min)}° - máx ${Math.round(max)}°C`);
  } else if (max != null) {
    parts.push(`máx ${Math.round(max)}°C`);
  }
  if (day.conditionText) parts.push(day.conditionText);
  if (rain >= 40) parts.push(`chuva ~${rain}%`);
  if ((day.windSpeedKph ?? 0) >= 25) {
    parts.push(`vento ${Math.round(day.windSpeedKph!)} km/h`);
  }
  if ((day.humidityPercent ?? 0) >= 75) {
    parts.push(`umidade ${Math.round(day.humidityPercent!)}%`);
  }
  const clothes = clothingPhrase(items);
  if (clothes) parts.push(`leve ${clothes}`);
  return parts.join(" · ");
}

const TOP_PRIORITY: ClothingItem[] = [
  "regata",
  "camiseta_leve",
  "camisa_manga_longa",
];
const OUTER_PRIORITY: ClothingItem[] = [
  "capa_chuva",
  "casaco_quente",
  "casaco_leve",
];
const BOTTOM_PRIORITY: ClothingItem[] = [
  "shorts",
  "calca_leve",
  "calca_quente",
];

export function primaryItemForSlot(
  items: ClothingItem[],
  slot: ClothingSlot
): ClothingItem | null {
  const priority =
    slot === "top"
      ? TOP_PRIORITY
      : slot === "outer"
        ? OUTER_PRIORITY
        : slot === "bottom"
          ? BOTTOM_PRIORITY
          : null;
  if (priority) {
    for (const p of priority) {
      if (items.includes(p)) return p;
    }
  }
  return items.find((i) => CLOTHING_META[i].slot === slot) ?? null;
}

/** Ícone tipológico da faixa (prioriza parte de cima). */
export function primaryTypologyItem(
  items: ClothingItem[]
): ClothingItem | null {
  return (
    primaryItemForSlot(items, "top") ??
    primaryItemForSlot(items, "outer") ??
    primaryItemForSlot(items, "bottom") ??
    items[0] ??
    null
  );
}

export function outfitFromItems(items: ClothingItem[]): ClothingOutfitSlot[] {
  const slots: ClothingSlot[] = ["top", "outer", "bottom"];
  const out: ClothingOutfitSlot[] = [];
  for (const slot of slots) {
    const item = primaryItemForSlot(items, slot);
    if (!item) continue;
    const meta = CLOTHING_META[item];
    out.push({
      slot,
      label:
        slot === "top"
          ? "Parte de cima"
          : slot === "outer"
            ? "Casaco"
            : "Parte de baixo",
      item,
      fabric: meta.fabric,
      thickness: meta.thickness,
      length: meta.length,
    });
  }
  return out;
}

export function suggestHourlySlots(
  hours: WeatherHourForecast[],
  date: string
): ClothingHourSlot[] {
  const ofDay = hours
    .map((h) => {
      const loc = hourLocal(h);
      return { h, ...loc };
    })
    .filter((x) => x.date === date && x.hour != null)
    .sort((a, b) => (a.hour ?? 0) - (b.hour ?? 0));

  return ofDay.map(({ h, hour }) => {
    const climate: ClimateInput = {
      tempC: h.temperatureC,
      feelsLikeC: h.feelsLikeC,
      windSpeedKph: h.windSpeedKph,
      humidityPercent: h.humidityPercent,
      rainProbabilityPercent: h.rainProbabilityPercent,
      precipitationMm: h.precipitationMm,
    };
    const items = itemsForClimate(climate);
    return {
      localHour: hour!,
      tempC: h.temperatureC,
      feelsLikeC: h.feelsLikeC,
      rainProbabilityPercent: h.rainProbabilityPercent,
      primaryItem: primaryTypologyItem(items),
      items,
    };
  });
}

function periodToClimate(
  period: WeatherPeriodForecast | null | undefined,
  fallbackTemp: number | null,
  day: WeatherDayForecast
): ClimateInput & { conditionText?: string | null } {
  return {
    tempC: fallbackTemp,
    feelsLikeC: period?.feelsLikeC ?? null,
    windSpeedKph: period?.windSpeedKph ?? day.windSpeedKph,
    humidityPercent: period?.humidityPercent ?? day.humidityPercent,
    rainProbabilityPercent:
      period?.rainProbabilityPercent ?? day.rainProbabilityPercent,
    precipitationMm: period?.precipitationMm ?? day.precipitationMm,
    conditionText: period?.conditionText ?? day.conditionText,
  };
}

function partSuggestion(
  key: "day" | "night",
  day: WeatherDayForecast
): ClothingPartSuggestion {
  const isDay = key === "day";
  const period = isDay ? day.daytime : day.nighttime;
  const temp = isDay ? day.maxTemperatureC : day.minTemperatureC;
  const climate = periodToClimate(period, temp, day);
  const items = itemsForClimate(climate);
  return {
    key,
    label: isDay ? "Dia" : "Madrugada",
    tempC: effectiveTempC(climate),
    items,
    summary: summaryForClimate(items, climate),
  };
}

const BAND_DEFS: Array<{
  key: ClothingBandKey;
  label: string;
  hourStart: number;
  hourEnd: number;
}> = [
  { key: "manha", label: "Manhã", hourStart: 6, hourEnd: 11 },
  { key: "tarde", label: "Tarde", hourStart: 12, hourEnd: 17 },
  { key: "noite", label: "Noite", hourStart: 18, hourEnd: 23 },
  { key: "madrugada", label: "Madrugada", hourStart: 0, hourEnd: 5 },
];

function hourLocal(h: WeatherHourForecast): {
  date: string | null;
  hour: number | null;
} {
  if (h.localDate && h.localHour != null) {
    return { date: h.localDate, hour: h.localHour };
  }
  if (!h.time) return { date: null, hour: null };
  const d = new Date(h.time);
  if (Number.isNaN(d.getTime())) return { date: null, hour: null };
  return {
    date: d.toISOString().slice(0, 10),
    hour: d.getUTCHours(),
  };
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

export function suggestClothingBands(
  hours: WeatherHourForecast[],
  date: string,
  day?: WeatherDayForecast | null
): ClothingHourBand[] {
  const ofDay = hours.filter((h) => hourLocal(h).date === date);
  const dayPart = day ? partSuggestion("day", day) : null;
  const nightPart = day ? partSuggestion("night", day) : null;

  const fallbackFor = (key: ClothingBandKey): ClothingPartSuggestion | null => {
    if (!dayPart || !nightPart) return null;
    // Sem hora a hora: madrugada ≈ mínima; resto do dia ≈ máxima / período diurno.
    if (key === "madrugada") return nightPart;
    return dayPart;
  };

  return BAND_DEFS.map((band) => {
    const slice = ofDay.filter((h) => {
      const hour = hourLocal(h).hour;
      return hour != null && hour >= band.hourStart && hour <= band.hourEnd;
    });

    if (slice.length === 0) {
      const fb = fallbackFor(band.key);
      if (fb) {
        return {
          key: band.key,
          label: band.label,
          hourStart: band.hourStart,
          hourEnd: band.hourEnd,
          tempC: fb.tempC,
          feelsLikeC: null,
          rainProbabilityPercent: day?.rainProbabilityPercent ?? null,
          items: fb.items,
          summary: fb.summary,
        };
      }
      return {
        key: band.key,
        label: band.label,
        hourStart: band.hourStart,
        hourEnd: band.hourEnd,
        tempC: null,
        feelsLikeC: null,
        rainProbabilityPercent: null,
        items: [],
        summary: "Sem dados",
      };
    }

    const temps = slice
      .map((h) => h.temperatureC)
      .filter((t): t is number => t != null);
    const feels = slice
      .map((h) => h.feelsLikeC)
      .filter((t): t is number => t != null);
    const rains = slice
      .map((h) => h.rainProbabilityPercent)
      .filter((t): t is number => t != null);
    const winds = slice
      .map((h) => h.windSpeedKph)
      .filter((t): t is number => t != null);
    const hums = slice
      .map((h) => h.humidityPercent)
      .filter((t): t is number => t != null);
    const precip = slice
      .map((h) => h.precipitationMm)
      .filter((t): t is number => t != null);

    const climate: ClimateInput & { conditionText?: string | null } = {
      tempC: avg(temps),
      feelsLikeC: avg(feels),
      windSpeedKph: avg(winds),
      humidityPercent: avg(hums),
      rainProbabilityPercent: rains.length ? Math.max(...rains) : null,
      precipitationMm: precip.length
        ? precip.reduce((s, n) => s + n, 0)
        : null,
      conditionText: slice[0]?.conditionText ?? null,
    };
    const items = itemsForClimate(climate);
    return {
      key: band.key,
      label: band.label,
      hourStart: band.hourStart,
      hourEnd: band.hourEnd,
      tempC: climate.tempC,
      feelsLikeC: climate.feelsLikeC ?? null,
      rainProbabilityPercent: climate.rainProbabilityPercent ?? null,
      items,
      summary: summaryForClimate(items, climate),
    };
  });
}

export function outfitPhrase(items: ClothingItem[], limit = 3): string {
  const phrase = clothingPhrase(items, limit);
  if (!phrase) return "";
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/** Condição do dia; separa dia/noite quando os textos diferem. */
export function dayNightConditionPhrase(
  day: WeatherDayForecast
): string | null {
  const dayCond =
    day.daytime?.conditionText?.trim() || day.conditionText?.trim() || null;
  const nightCond = day.nighttime?.conditionText?.trim() || null;
  if (dayCond && nightCond && dayCond !== nightCond) {
    return `${dayCond} de dia · ${nightCond} à noite`;
  }
  return dayCond ?? nightCond ?? day.conditionText?.trim() ?? null;
}

/** Outfit pela janela restante de horas (hoje: agora → fim do dia). */
export function outfitFromRemainingHours(
  slots: ClothingHourSlot[]
): { items: ClothingItem[]; windowLabel: string | null } {
  if (slots.length === 0) return { items: [], windowLabel: null };
  const first = slots[0]!.localHour;
  const last = slots[slots.length - 1]!.localHour;
  const windowLabel = first === last ? `${first}h` : `Agora → ${last}h`;

  const effectives = slots
    .map((s) =>
      effectiveTempC({ tempC: s.tempC, feelsLikeC: s.feelsLikeC })
    )
    .filter((t): t is number => t != null);
  if (effectives.length === 0) {
    return {
      items: [...new Set(slots.flatMap((s) => s.items))],
      windowLabel,
    };
  }
  const peak = Math.max(...effectives);
  const low = Math.min(...effectives);
  const peakSlot =
    slots.find(
      (s) =>
        effectiveTempC({ tempC: s.tempC, feelsLikeC: s.feelsLikeC }) === peak
    ) ?? slots[0]!;
  const lowSlot =
    slots.find(
      (s) =>
        effectiveTempC({ tempC: s.tempC, feelsLikeC: s.feelsLikeC }) === low
    ) ?? slots[slots.length - 1]!;
  const rain = Math.max(
    ...slots.map((s) => s.rainProbabilityPercent ?? 0),
    0
  );
  const items = [
    ...new Set([
      ...itemsForClimate({
        tempC: peakSlot.tempC,
        feelsLikeC: peakSlot.feelsLikeC,
        rainProbabilityPercent: rain,
      }),
      ...itemsForClimate({
        tempC: lowSlot.tempC,
        feelsLikeC: lowSlot.feelsLikeC,
        rainProbabilityPercent: rain,
      }),
    ]),
  ];
  return { items, windowLabel };
}

/** Amplitude (°C) em que vale separar sugestão dia vs noite. */
export const DAY_NIGHT_SWING_SPLIT_C = 8;

/** A partir desta hora local, “hoje” só sugere a janela restante. */
export const REMAINING_ONLY_FROM_HOUR = 18;

function outfitsDiffer(
  a: ClothingOutfitSlot[],
  b: ClothingOutfitSlot[]
): boolean {
  const key = (slots: ClothingOutfitSlot[]) =>
    slots
      .map((s) => `${s.slot}:${s.item}`)
      .sort()
      .join("|");
  return key(a) !== key(b);
}

export function shouldSplitDayNightSuggestion(params: {
  dayTempC: number | null;
  nightTempC: number | null;
  dayOutfit: ClothingOutfitSlot[];
  nightOutfit: ClothingOutfitSlot[];
}): boolean {
  const { dayTempC, nightTempC, dayOutfit, nightOutfit } = params;
  if (outfitsDiffer(dayOutfit, nightOutfit)) return true;
  if (dayTempC != null && nightTempC != null) {
    return Math.abs(dayTempC - nightTempC) >= DAY_NIGHT_SWING_SPLIT_C;
  }
  return false;
}

function buildOutfitSegments(params: {
  isToday?: boolean;
  dayPart: ClothingPartSuggestion;
  nightPart: ClothingPartSuggestion;
  hourlySlots: ClothingHourSlot[];
}): {
  outfit: ClothingOutfitSlot[];
  outfitSegments: ClothingOutfitSegment[];
  outfitWindowLabel: string | null;
  outfitPhrase: string;
} {
  const { isToday, dayPart, nightPart, hourlySlots } = params;
  const dayOutfit = outfitFromItems(dayPart.items);
  const nightOutfit = outfitFromItems(nightPart.items);
  const split = shouldSplitDayNightSuggestion({
    dayTempC: dayPart.tempC,
    nightTempC: nightPart.tempC,
    dayOutfit,
    nightOutfit,
  });

  // Hoje à noite: só o que resta (evita sugerir regata depois do pico).
  if (isToday && hourlySlots.length > 0) {
    const firstHour = hourlySlots[0]!.localHour;
    if (firstHour >= REMAINING_ONLY_FROM_HOUR) {
      const remaining = outfitFromRemainingHours(hourlySlots);
      const outfit = outfitFromItems(remaining.items);
      return {
        outfit,
        outfitSegments: [
          {
            key: "remaining",
            label: remaining.windowLabel
              ? `Restante do dia (${remaining.windowLabel})`
              : "Restante do dia",
            tempC:
              effectiveTempC({
                tempC: hourlySlots[0]!.tempC,
                feelsLikeC: hourlySlots[0]!.feelsLikeC,
              }) ?? null,
            outfit,
          },
        ],
        outfitWindowLabel: remaining.windowLabel,
        outfitPhrase: outfitPhrase(outfit.map((o) => o.item)),
      };
    }
  }

  // Manhã→noite (ou dia futuro com amplitude): duas sugestões claras.
  if (split) {
    const segments: ClothingOutfitSegment[] = [
      {
        key: "day",
        label: "Dia / tarde",
        tempC: dayPart.tempC,
        outfit: dayOutfit,
      },
      {
        key: "night",
        label: "Noite",
        tempC: nightPart.tempC,
        outfit: nightOutfit,
      },
    ];
    const dayPhrase = outfitPhrase(dayOutfit.map((o) => o.item), 2);
    const nightPhrase = outfitPhrase(nightOutfit.map((o) => o.item), 2);
    return {
      outfit: dayOutfit,
      outfitSegments: segments,
      outfitWindowLabel: null,
      outfitPhrase: [dayPhrase && `Dia: ${dayPhrase}`, nightPhrase && `Noite: ${nightPhrase}`]
        .filter(Boolean)
        .join(" · "),
    };
  }

  return {
    outfit: dayOutfit,
    outfitSegments: [
      {
        key: "day",
        label: "Dia",
        tempC: dayPart.tempC,
        outfit: dayOutfit,
      },
    ],
    outfitWindowLabel: null,
    outfitPhrase: outfitPhrase(dayOutfit.map((o) => o.item)),
  };
}

export function suggestClothingForDay(
  day: WeatherDayForecast,
  hours: WeatherHourForecast[] = [],
  options?: { isToday?: boolean }
): DayClothingSuggestion {
  const items = itemsForDayAggregate(day);
  const dayPart = partSuggestion("day", day);
  const nightPart = partSuggestion("night", day);
  const bands =
    day.date != null ? suggestClothingBands(hours, day.date, day) : [];
  const hourlySlots =
    day.date != null ? suggestHourlySlots(hours, day.date) : [];

  const feelsLikeDayC = effectiveTempC({
    tempC: day.maxTemperatureC,
    feelsLikeC: day.daytime?.feelsLikeC,
    windSpeedKph: day.daytime?.windSpeedKph ?? day.windSpeedKph,
    humidityPercent: day.daytime?.humidityPercent ?? day.humidityPercent,
  });
  const feelsLikeNightC = effectiveTempC({
    tempC: day.minTemperatureC,
    feelsLikeC: day.nighttime?.feelsLikeC,
    windSpeedKph: day.nighttime?.windSpeedKph ?? day.windSpeedKph,
    humidityPercent: day.nighttime?.humidityPercent ?? day.humidityPercent,
  });

  const feelsHighlight =
    options?.isToday && hourlySlots[0]
      ? effectiveTempC({
          tempC: hourlySlots[0].tempC,
          feelsLikeC: hourlySlots[0].feelsLikeC,
        })
      : feelsLikeDayC;

  const built = buildOutfitSegments({
    isToday: options?.isToday,
    dayPart,
    nightPart,
    hourlySlots,
  });

  return {
    date: day.date,
    conditionText: day.conditionText,
    maxC: day.maxTemperatureC,
    minC: day.minTemperatureC,
    feelsLikeDayC: feelsHighlight ?? feelsLikeDayC,
    feelsLikeNightC,
    windSpeedKph: day.windSpeedKph,
    humidityPercent: day.humidityPercent,
    rainProbabilityPercent: day.rainProbabilityPercent,
    items,
    summary: summaryForDay(items, day),
    conditionPhrase: dayNightConditionPhrase(day),
    outfit: built.outfit,
    outfitSegments: built.outfitSegments,
    outfitWindowLabel: built.outfitWindowLabel,
    outfitPhrase: built.outfitPhrase,
    dayPart,
    nightPart,
    bands,
    hourlySlots,
  };
}

function avgTemp(day: WeatherDayForecast): number | null {
  const max = day.maxTemperatureC;
  const min = day.minTemperatureC;
  if (max == null && min == null) return null;
  if (max == null) return min!;
  if (min == null) return max;
  return (max + min) / 2;
}

export function suggestPackingList(
  days: WeatherDayForecast[]
): { items: ClothingItem[]; summary: string; dayCount: number } {
  const counts = new Map<ClothingItem, number>();
  for (const day of days) {
    for (const item of itemsForDayAggregate(day)) {
      counts.set(item, (counts.get(item) ?? 0) + 1);
    }
  }
  const items = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([item]) => item);

  const temps = days
    .map(avgTemp)
    .filter((t): t is number => t != null);
  const avg =
    temps.length > 0
      ? temps.reduce((s, t) => s + t, 0) / temps.length
      : null;
  const rainyDays = days.filter(
    (d) => (d.rainProbabilityPercent ?? 0) >= 40
  ).length;
  const windyDays = days.filter((d) => (d.windSpeedKph ?? 0) >= 25).length;

  const bits: string[] = [];
  if (avg != null) bits.push(`média ~${Math.round(avg)}°C`);
  if (rainyDays > 0) bits.push(`${rainyDays} dia(s) com chance de chuva`);
  if (windyDays > 0) bits.push(`${windyDays} dia(s) ventosos`);
  bits.push(
    items
      .slice(0, 5)
      .map((i) => CLOTHING_META[i].label)
      .join(", ")
  );

  return {
    items,
    summary: bits.filter(Boolean).join(" · "),
    dayCount: days.length,
  };
}

export function clothingAttrLine(item: ClothingItem): string {
  const m = CLOTHING_META[item];
  return [
    fabricTraitsLine(m.fabric),
    THICKNESS_LABELS[m.thickness],
    LENGTH_LABELS[m.length],
  ].join(" · ");
}
