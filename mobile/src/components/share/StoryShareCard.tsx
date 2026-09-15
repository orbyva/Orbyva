import { Image as ExpoImage } from "expo-image";
import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  ShareHero,
  ShareRecommendChip,
  ShareScorePill,
  ShareStoryBackdrop,
  ShareStoryFooter,
  ShareStoryHeader,
} from "@/components/share/ShareStoryChrome";
import {
  heroMetrics,
  pickShareItems,
  SHARE_H,
  SHARE_W,
  type CoverVariant,
} from "@/components/share/shareStory";
import { BRAND_COLORS } from "@/lib/brand";

export type StoryShareItem = {
  index: string;
  title: string;
  score: string;
};

export function StoryShareCard({
  coverUri,
  coverUris,
  coverVariant = "poster",
  fallbackEmoji,
  fallbackCaption,
  eyebrow = "Minha opinião",
  kicker,
  title,
  subtitle,
  score,
  scoreLabel,
  recommend,
  notes,
  items,
  itemsLabel,
  onReady,
}: {
  coverUri?: string | null;
  coverUris?: string[];
  coverVariant?: CoverVariant;
  fallbackEmoji?: string;
  fallbackCaption?: string | null;
  eyebrow?: string;
  kicker: string;
  title: string;
  subtitle?: string | null;
  score?: string | null;
  scoreLabel?: string | null;
  recommend?: boolean | null;
  notes?: string | null;
  items?: StoryShareItem[];
  itemsLabel?: string;
  onReady?: () => void;
}) {
  const photos = (coverUris?.length ? coverUris : coverUri ? [coverUri] : []).filter(
    Boolean
  );
  const hasItems = Boolean(items?.length);
  const hasNotes = Boolean(notes);
  const shown = items ?? [];
  const hero = heroMetrics({
    variant: coverVariant,
    hasCover: photos.length > 0,
    hasItems,
    hasNotes,
    photoCount: photos.length,
  });
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

  const compact = hasItems;
  const cols = shown.length >= 5 ? 2 : 1;
  const minRow = cols === 1 ? 44 : 40;
  const footerTop = SHARE_H - 180;
  const notesReserve = hasNotes ? 90 : 16;
  const afterHero =
    hero.y +
    hero.h +
    hero.after +
    (compact ? 22 + 52 + 28 : 62 + 68 + 54) +
    (score ? (compact ? 28 + 108 : 48 + 132) : 0) +
    (recommend != null ? (compact ? 28 + 68 : 40 + 68) : 0) +
    28;
  const bodyH = Math.max(minRow, footerTop - notesReserve - afterHero - 40);
  const maxRowsFit = Math.max(1, Math.floor(bodyH / minRow));
  const maxItems = Math.max(cols, maxRowsFit * cols - 4);
  const visible = pickShareItems(shown, maxItems);
  const rows = Math.max(1, Math.ceil(visible.length / cols));

  return (
    <View style={styles.root} collapsable={false}>
      <ShareStoryBackdrop coverUri={photos[0] ?? null} />
      <ShareStoryHeader eyebrow={eyebrow} />

      <View style={[styles.body, { paddingTop: hero.y }]}>
        <ShareHero
          uris={photos}
          width={hero.w}
          height={hero.h}
          radius={hero.radius}
          emoji={fallbackEmoji}
          caption={photos.length ? null : fallbackCaption}
        />

        <Text
          style={[
            styles.kicker,
            compact && styles.kickerCompact,
            { marginTop: hero.after },
          ]}
          numberOfLines={2}
        >
          {kicker}
        </Text>
        <Text
          style={[styles.title, compact && styles.titleCompact]}
          numberOfLines={compact ? 2 : 3}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.subtitle, compact && styles.subtitleCompact]}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        ) : null}

        {score ? (
          <View style={[styles.block, compact && styles.blockCompact]}>
            <ShareScorePill score={score} label={scoreLabel} compact={compact} />
          </View>
        ) : null}

        {recommend != null ? (
          <View style={[styles.block, compact && styles.blockCompact]}>
            <ShareRecommendChip recommend={recommend} />
          </View>
        ) : null}

        {hasItems ? (
          <View style={styles.items}>
            <Text style={styles.itemsLabel}>{itemsLabel ?? "ITENS"}</Text>
            <View style={styles.itemsGrid}>
              {Array.from({ length: cols }, (_, col) => (
                <View key={col} style={styles.itemsCol}>
                  {visible
                    .filter((_, index) =>
                      cols === 1 ? true : Math.floor(index / rows) === col
                    )
                    .map((item) => (
                      <View key={`${item.index}-${item.title}`} style={styles.itemRow}>
                        <Text style={styles.itemIndex} numberOfLines={1}>
                          {item.index}
                        </Text>
                        <Text style={styles.itemTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <View style={styles.itemPill}>
                          <Text style={styles.itemScore}>{item.score}</Text>
                        </View>
                      </View>
                    ))}
                </View>
              ))}
            </View>
            {shown.length > visible.length ? (
              <Text style={styles.more}>
                +{shown.length - visible.length}{" "}
                {(itemsLabel ?? "itens").toLowerCase()}
              </Text>
            ) : null}
          </View>
        ) : null}

        {notes ? (
          <Text style={styles.notes} numberOfLines={2}>
            “{notes}”
          </Text>
        ) : null}
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
    paddingHorizontal: 88,
    paddingBottom: 200,
    gap: 0,
  },
  kicker: {
    color: "rgba(248, 250, 252, 0.7)",
    fontSize: 26,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 36,
  },
  kickerCompact: {
    fontSize: 22,
    marginBottom: 22,
  },
  title: {
    color: BRAND_COLORS.paper,
    fontSize: 58,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 68,
  },
  titleCompact: {
    fontSize: 46,
    lineHeight: 52,
  },
  subtitle: {
    color: "rgba(248, 250, 252, 0.75)",
    fontSize: 28,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 36,
  },
  subtitleCompact: {
    fontSize: 24,
    marginTop: 24,
  },
  block: {
    marginTop: 48,
    alignItems: "center",
  },
  blockCompact: { marginTop: 28 },
  items: {
    alignSelf: "stretch",
    marginTop: 28,
    gap: 12,
  },
  itemsLabel: {
    color: "rgba(248, 250, 252, 0.55)",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  itemsGrid: {
    flexDirection: "row",
    gap: 40,
  },
  itemsCol: { flex: 1, gap: 8 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 40,
  },
  itemIndex: {
    color: "rgba(248, 250, 252, 0.45)",
    fontSize: 17,
    fontWeight: "600",
    width: 72,
    textAlign: "right",
  },
  itemTitle: {
    flex: 1,
    color: BRAND_COLORS.paper,
    fontSize: 20,
    fontWeight: "600",
  },
  itemPill: {
    minWidth: 68,
    height: 30,
    borderRadius: 12,
    backgroundColor: "rgba(251, 191, 36, 0.18)",
    borderWidth: 2,
    borderColor: "rgba(251, 191, 36, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  itemScore: {
    color: BRAND_COLORS.gold,
    fontSize: 18,
    fontWeight: "800",
  },
  more: {
    color: "rgba(248, 250, 252, 0.45)",
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 4,
  },
  notes: {
    color: "rgba(248, 250, 252, 0.55)",
    fontSize: 26,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 28,
    paddingHorizontal: 10,
    lineHeight: 36,
  },
});
