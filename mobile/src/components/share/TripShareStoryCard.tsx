import { Image as ExpoImage } from "expo-image";
import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  ShareHero,
  ShareStoryBackdrop,
  ShareStoryFooter,
  ShareStoryHeader,
} from "@/components/share/ShareStoryChrome";
import { heroMetrics, SHARE_H, SHARE_W } from "@/components/share/shareStory";
import {
  PLACE_TYPE_EMOJI,
  formatRating,
} from "@/domain/places";
import { BRAND_COLORS } from "@/components/share/brandColors";
import { formatDateBR } from "@/lib/currency";
import type { PlaceVisit } from "@/types/places";
import type { Trip } from "@/types/travel";

export function TripShareStoryCard({
  trip,
  places,
  photoUris,
  onReady,
}: {
  trip: Trip;
  places: PlaceVisit[];
  photoUris: string[];
  onReady?: () => void;
}) {
  const photos = photoUris.filter(Boolean);
  const hero = heroMetrics({
    variant: photos.length ? "photo" : "badge",
    hasCover: photos.length > 0,
    hasItems: false,
    hasNotes: false,
    photoCount: photos.length,
  });
  const ranked = [...places].sort((a, b) => {
    const ra = a.rating ?? 0;
    const rb = b.rating ?? 0;
    if (rb !== ra) return rb - ra;
    return a.name.localeCompare(b.name, "pt-BR");
  });
  const dateRange = `${formatDateBR(trip.start_date)} → ${formatDateBR(trip.end_date)}`;
  const kicker = trip.destination
    ? `${trip.destination.toUpperCase()}  ·  ${dateRange}`
    : dateRange;

  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    let cancelled = false;
    const uris = [...new Set(photos)];
    const done = () => {
      if (!cancelled) readyRef.current?.();
    };
    if (uris.length === 0) {
      const timer = setTimeout(done, 200);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
    void Promise.all(uris.map((uri) => ExpoImage.prefetch(uri).catch(() => false))).then(
      () => {
        if (!cancelled) setTimeout(done, 200);
      }
    );
    const fallback = setTimeout(done, 2000);
    return () => {
      cancelled = true;
      clearTimeout(fallback);
    };
  }, [photos.join("|")]);

  const maxRows = photos.length ? 6 : 8;
  const visible = ranked.slice(0, maxRows);

  return (
    <View style={styles.root} collapsable={false}>
      <ShareStoryBackdrop coverUri={photos[0] ?? null} />
      <ShareStoryHeader eyebrow="Minha viagem" />
      <View style={[styles.body, { paddingTop: hero.y }]}>
        <ShareHero
          uris={photos}
          width={hero.w}
          height={hero.h}
          radius={hero.radius}
          emoji="✈️"
        />
        <Text style={styles.kicker} numberOfLines={2}>
          {kicker}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {trip.title}
        </Text>

        {visible.length === 0 ? (
          <Text style={styles.empty}>Nenhum lugar registrado nesta viagem</Text>
        ) : (
          <View style={styles.list}>
            <Text style={styles.listLabel}>LUGARES  ·  {places.length}</Text>
            {visible.map((place) => {
              const score =
                place.rating != null && place.rating > 0
                  ? `${formatRating(place.rating)}/5`
                  : null;
              return (
                <View key={place.id} style={styles.row}>
                  <Text style={styles.emoji}>
                    {PLACE_TYPE_EMOJI[place.type] ?? "📍"}
                  </Text>
                  <Text style={styles.placeName} numberOfLines={1}>
                    {place.name}
                  </Text>
                  {score ? (
                    <View style={styles.scorePill}>
                      <Text style={styles.score}>{score}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
            {ranked.length > visible.length ? (
              <Text style={styles.more}>
                +{ranked.length - visible.length}{" "}
                {ranked.length - visible.length === 1 ? "lugar" : "lugares"}
              </Text>
            ) : null}
          </View>
        )}
      </View>
      <ShareStoryFooter />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: SHARE_W,
    height: SHARE_H,
    backgroundColor: BRAND_COLORS.ink,
    overflow: "hidden",
  },
  body: {
    alignItems: "center",
    paddingHorizontal: 72,
    paddingBottom: 200,
  },
  kicker: {
    color: "rgba(248, 250, 252, 0.7)",
    fontSize: 24,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 56,
    marginBottom: 16,
  },
  title: {
    color: BRAND_COLORS.paper,
    fontSize: 52,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 60,
    marginBottom: 40,
  },
  empty: {
    color: "rgba(248, 250, 252, 0.45)",
    fontSize: 26,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 24,
  },
  list: { alignSelf: "stretch", gap: 10 },
  listLabel: {
    color: "rgba(248, 250, 252, 0.55)",
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 8,
  },
  row: {
    height: 62,
    borderRadius: 20,
    backgroundColor: "rgba(248, 250, 252, 0.08)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.1)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    gap: 12,
  },
  emoji: { fontSize: 28, width: 36, textAlign: "center" },
  placeName: {
    flex: 1,
    color: BRAND_COLORS.paper,
    fontSize: 28,
    fontWeight: "700",
  },
  scorePill: {
    minWidth: 110,
    height: 40,
    borderRadius: 999,
    backgroundColor: BRAND_COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  score: {
    color: BRAND_COLORS.paper,
    fontSize: 22,
    fontWeight: "800",
  },
  more: {
    color: "rgba(248, 250, 252, 0.5)",
    fontSize: 24,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
  },
});
