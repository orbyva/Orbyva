import type Ionicons from "@expo/vector-icons/Ionicons";

import type { ClothingIconKey } from "@/domain/travel/clothing";

export const CLOTHING_IONICONS: Record<
  ClothingIconKey,
  keyof typeof Ionicons.glyphMap
> = {
  tank: "body-outline",
  shirt: "shirt-outline",
  "long-sleeve": "shirt",
  jacket: "cloudy-night-outline",
  coat: "snow-outline",
  raincoat: "rainy-outline",
  pants: "walk-outline",
  "warm-pants": "snow-outline",
  shorts: "sunny-outline",
  shoe: "footsteps-outline",
  umbrella: "umbrella-outline",
};

export function weatherIcon(
  text?: string | null
): keyof typeof Ionicons.glyphMap {
  const raw = (text ?? "").toLowerCase();
  if (/chuva|rain|tempest|storm|thunder/.test(raw)) return "rainy-outline";
  if (/neve|snow/.test(raw)) return "snow-outline";
  if (/nublado|cloud|overcast/.test(raw)) return "cloudy-outline";
  if (/sol|sunny|clear|céu limpo/.test(raw)) return "sunny-outline";
  return "partly-sunny-outline";
}
