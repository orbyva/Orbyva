import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";

import { VisitDragHandle } from "@/components/travel/VisitDragHandle";
import { ThemedText } from "@/components/themed-text";
import { Button } from "@/components/ui";
import { TypeIcon } from "@/components/TypeIcon";
import { Radius, Spacing } from "@/constants/theme";
import { PLACE_TYPE_LABELS, placeTypeMeta } from "@/domain/places";
import {
  suggestionHeading,
  type GeoAnchor,
} from "@/domain/travel/savedPlaceSuggestions";
import { useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";
import type { PlaceVisit } from "@/types/places";

export const SAVED_PLACE_DRAG_PREFIX = "saved-place:";

export function savedPlaceDragId(placeId: string): string {
  return `${SAVED_PLACE_DRAG_PREFIX}${placeId}`;
}

export function parseSavedPlaceDragId(id: string | null): string | null {
  if (!id?.startsWith(SAVED_PLACE_DRAG_PREFIX)) return null;
  return id.slice(SAVED_PLACE_DRAG_PREFIX.length);
}

export function ItinerarySavedPlaceSuggestions({
  tripId,
  city,
  places,
  addingPlaceId,
  absX,
  absY,
  ghostVisible,
  onDragStart,
  onDragEnd,
  onAdd,
  onDismiss,
}: {
  tripId: string;
  city: GeoAnchor;
  places: PlaceVisit[];
  addingPlaceId: string | null;
  absX: SharedValue<number>;
  absY: SharedValue<number>;
  ghostVisible: SharedValue<number>;
  onDragStart: (id: string) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onAdd: (place: PlaceVisit) => void;
  onDismiss: (city: GeoAnchor) => void;
}) {
  const theme = useTheme();
  if (places.length === 0) return null;
  const cityLabel = city.name.trim() || "este destino";

  return (
    <View
      accessibilityLabel={suggestionHeading(places.length, city.name)}
      style={[
        styles.box,
        {
          borderColor: hexAlpha(theme.primary, 0.22),
          backgroundColor: hexAlpha(theme.primary, 0.06),
        },
      ]}
    >
      <View style={styles.head}>
        <View
          style={[
            styles.pin,
            { backgroundColor: hexAlpha(theme.primary, 0.15) },
          ]}
        >
          <Ionicons name="location-outline" size={16} color={theme.primary} />
        </View>
        <View style={styles.flex}>
          <ThemedText type="smallBold">
            {suggestionHeading(places.length, city.name)}
          </ThemedText>
          <ThemedText type="small" themeColor="mutedForeground">
            Adicione no roteiro deste dia.
          </ThemedText>
        </View>
        <Pressable
          accessibilityLabel={`Dispensar sugestões de ${cityLabel} nesta viagem`}
          hitSlop={8}
          onPress={() => onDismiss(city)}
          style={styles.dismiss}
        >
          <Ionicons name="close" size={18} color={theme.mutedForeground} />
        </Pressable>
      </View>
      <ScrollView
        nestedScrollEnabled
        style={styles.list}
        contentContainerStyle={styles.listContent}
      >
        {places.map((place) => {
          const meta = placeTypeMeta(place.type);
          const busy = addingPlaceId === place.id;
          const onTrip = place.trip_id === tripId;
          return (
            <View
              key={place.id}
              style={[
                styles.row,
                {
                  borderColor: hexAlpha(theme.foreground, 0.08),
                  backgroundColor: theme.card,
                  opacity: busy ? 0.55 : 1,
                },
              ]}
            >
              <VisitDragHandle
                id={savedPlaceDragId(place.id)}
                absX={absX}
                absY={absY}
                ghostVisible={ghostVisible}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              />
              <View
                style={[
                  styles.icon,
                  { backgroundColor: meta.bg },
                ]}
              >
                <TypeIcon name={meta.icon} color={meta.fg} size={14} />
              </View>
              <View style={styles.flex}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {place.name}
                </ThemedText>
                <ThemedText type="small" themeColor="mutedForeground" numberOfLines={1}>
                  {PLACE_TYPE_LABELS[place.type]}
                  {onTrip ? " · Na lista da viagem" : ""}
                </ThemedText>
              </View>
              <Button
                label="Adicionar"
                disabled={busy}
                loading={busy}
                onPress={() => onAdd(place)}
                size="sm"
              />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderRadius: Radius.xl,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  pin: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  dismiss: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { maxHeight: 208 },
  listContent: { gap: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingVertical: 4,
    paddingRight: 6,
    paddingLeft: 2,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  flex: { flex: 1, minWidth: 0 },
});
