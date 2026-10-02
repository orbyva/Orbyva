import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { CLOTHING_IONICONS } from "@/components/travel/clothingIcons";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import {
  CLOTHING_LABELS,
  CLOTHING_META,
  suggestClothingForDay,
  type ClothingItem,
} from "@/domain/travel/clothing";
import type { TripWeather } from "@/hooks/use-trip-weather";
import { useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";

type Props = {
  weather: TripWeather;
  lat: number | null | undefined;
  lng: number | null | undefined;
  dayDate: string | null | undefined;
  stopLabel?: string | null;
  isToday: boolean;
};

export function ItineraryDayWeather({
  weather,
  lat,
  lng,
  dayDate,
  stopLabel,
  isToday,
}: Props) {
  const theme = useTheme();
  const [open, setOpen] = useState(isToday);

  useEffect(() => {
    setOpen(isToday);
  }, [isToday, dayDate]);

  if (lat == null || lng == null || !dayDate) return null;

  const day = weather.dayAt(lat, lng, dayDate);
  const suggestion = day
    ? suggestClothingForDay(day, weather.hoursAt(lat, lng), { isToday })
    : null;
  const message = weather.loading
    ? null
    : weather.error ?? (day ? null : "Sem previsão para este dia.");

  const summary = suggestion
    ? [
        suggestion.conditionPhrase,
        suggestion.feelsLikeDayC != null
          ? `Sensação ~${Math.round(suggestion.feelsLikeDayC)}°C`
          : null,
        suggestion.maxC != null && suggestion.minC != null
          ? `mín ${Math.round(suggestion.minC)}°, máx ${Math.round(suggestion.maxC)}°`
          : null,
        suggestion.outfitPhrase || null,
      ].filter((b): b is string => !!b)
    : [];
  const details = suggestion
    ? [
        suggestion.windSpeedKph != null && suggestion.windSpeedKph >= 20
          ? `vento ${Math.round(suggestion.windSpeedKph)} km/h`
          : null,
        suggestion.humidityPercent != null && suggestion.humidityPercent >= 70
          ? `umidade ${Math.round(suggestion.humidityPercent)}%`
          : null,
        suggestion.rainProbabilityPercent != null &&
        suggestion.rainProbabilityPercent >= 40
          ? `chuva ~${suggestion.rainProbabilityPercent}%`
          : null,
      ].filter((b): b is string => !!b)
    : [];

  const strip: {
    key: string;
    label: string;
    item: ClothingItem | null;
    tempC: number | null;
  }[] = suggestion
    ? suggestion.hourlySlots.length > 0
      ? suggestion.hourlySlots.map((slot) => ({
          key: `h${slot.localHour}`,
          label: `${String(slot.localHour).padStart(2, "0")}h`,
          item: slot.primaryItem,
          tempC: slot.feelsLikeC ?? slot.tempC,
        }))
      : suggestion.bands.map((band) => ({
          key: band.key,
          label: band.label,
          item: band.items[0] ?? null,
          tempC: band.feelsLikeC ?? band.tempC,
        }))
    : [];

  return (
    <View
      style={[
        styles.box,
        {
          borderColor: hexAlpha(theme.text, 0.15),
          backgroundColor: hexAlpha(theme.text, 0.03),
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.head}
      >
        <Ionicons name="partly-sunny-outline" size={16} color={theme.primary} />
        <View style={styles.flex}>
          <View style={styles.titleRow}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
              {`CLIMA${stopLabel ? ` · ${stopLabel}` : ""}`}
            </ThemedText>
            <Ionicons
              name={open ? "chevron-up" : "chevron-down"}
              size={14}
              color={theme.textSecondary}
            />
          </View>
          {weather.loading ? (
            <View style={styles.titleRow}>
              <ActivityIndicator size="small" />
              <ThemedText type="small" themeColor="textSecondary">
                Carregando…
              </ThemedText>
            </View>
          ) : message ? (
            <ThemedText type="small" themeColor="textSecondary">
              {message}
            </ThemedText>
          ) : summary.length > 0 ? (
            <ThemedText type="small">{summary.join(" · ")}</ThemedText>
          ) : null}
        </View>
      </Pressable>

      {open && suggestion ? (
        <View style={[styles.body, { borderTopColor: hexAlpha(theme.text, 0.08) }]}>
          {details.length > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {details.join(" · ")}
            </ThemedText>
          ) : null}
          {suggestion.outfitSegments.map((segment) => (
            <View key={segment.key} style={styles.segment}>
              {suggestion.outfitSegments.length > 1 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {segment.label}
                  {segment.tempC != null ? ` · ~${Math.round(segment.tempC)}°C` : ""}
                </ThemedText>
              ) : null}
              <View style={styles.chips}>
                {segment.outfit.map((slot) => (
                  <View
                    key={`${segment.key}-${slot.slot}`}
                    style={[
                      styles.chip,
                      { backgroundColor: hexAlpha(theme.primary, 0.1) },
                    ]}
                  >
                    <Ionicons
                      name={CLOTHING_IONICONS[CLOTHING_META[slot.item].icon]}
                      size={14}
                      color={theme.primary}
                    />
                    <ThemedText type="small">{CLOTHING_LABELS[slot.item]}</ThemedText>
                  </View>
                ))}
              </View>
            </View>
          ))}
          {strip.length > 0 ? (
            <View style={styles.segment}>
              <ThemedText type="small" themeColor="textSecondary">
                {suggestion.hourlySlots.length > 0
                  ? `Hora a hora · horário local${stopLabel ? ` (${stopLabel})` : ""}`
                  : "Ao longo do dia"}
              </ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.strip}>
                  {strip.map((cell) => (
                    <View key={cell.key} style={styles.cell}>
                      <ThemedText type="small" themeColor="textSecondary">
                        {cell.label}
                      </ThemedText>
                      {cell.item ? (
                        <Ionicons
                          name={CLOTHING_IONICONS[CLOTHING_META[cell.item].icon]}
                          size={18}
                          color={theme.primary}
                        />
                      ) : (
                        <View style={styles.iconGap} />
                      )}
                      <ThemedText type="smallBold">
                        {cell.tempC != null ? `${Math.round(cell.tempC)}°` : "·"}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.one },
  titleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.one },
  flex: { flex: 1 },
  body: {
    marginTop: Spacing.one,
    paddingTop: Spacing.one,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  segment: { gap: Spacing.one },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.one },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  strip: { flexDirection: "row", gap: Spacing.one },
  cell: { width: 48, alignItems: "center", gap: 2 },
  iconGap: { width: 18, height: 18 },
});
