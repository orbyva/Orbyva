import { Image as ExpoImage } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

import { ShareBrandMark } from "@/components/share/ShareBrandMark";
import { mosaicCells, SHARE_H, SHARE_W } from "@/components/share/shareStory";
import { BRAND_COLORS } from "@/components/share/brandColors";

export function OrbyvaWordmark({ size }: { size: number }) {
  return (
    <Text
      style={{
        fontSize: size,
        fontWeight: "800",
        lineHeight: size + 4,
      }}
    >
      <Text style={{ color: BRAND_COLORS.primary }}>O</Text>
      <Text style={{ color: BRAND_COLORS.paper }}>RBYV</Text>
      <Text style={{ color: BRAND_COLORS.primary }}>A</Text>
    </Text>
  );
}

export function ShareStoryBackdrop({ coverUri }: { coverUri?: string | null }) {
  return (
    <>
      {coverUri ? (
        <ExpoImage
          source={{ uri: coverUri }}
          contentFit="cover"
          blurRadius={10}
          transition={0}
          cachePolicy="memory-disk"
          style={styles.backdrop}
        />
      ) : null}
      <Svg
        width={SHARE_W}
        height={SHARE_H}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        <Defs>
          <LinearGradient id="shareScrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="rgb(11,15,26)" stopOpacity="0.22" />
            <Stop offset="0.35" stopColor="rgb(11,15,26)" stopOpacity="0.38" />
            <Stop offset="1" stopColor="rgb(11,15,26)" stopOpacity="0.88" />
          </LinearGradient>
        </Defs>
        <Rect width={SHARE_W} height={SHARE_H} fill="url(#shareScrim)" />
      </Svg>
    </>
  );
}

export function ShareStoryHeader({ eyebrow }: { eyebrow: string }) {
  return (
    <View style={styles.header}>
      <ShareBrandMark size={46} />
      <View style={styles.headerCopy}>
        <OrbyvaWordmark size={32} />
        <Text style={styles.headerLabel}>{eyebrow.toUpperCase()}</Text>
      </View>
    </View>
  );
}

export function ShareStoryFooter() {
  return (
    <View style={styles.footer}>
      <View style={styles.footerRule} />
      <View style={styles.footerBrand}>
        <ShareBrandMark size={34} />
        <OrbyvaWordmark size={28} />
      </View>
      <Text style={styles.slogan}>
        TUDO DA SUA VIDA EM UMA SÓ{" "}
        <Text style={styles.sloganAccent}>ÓRBITA.</Text>
      </Text>
    </View>
  );
}

export function ShareScorePill({
  score,
  label,
  compact,
}: {
  score: string;
  label?: string | null;
  compact?: boolean;
}) {
  const width = compact ? 400 : 480;
  const height = compact ? 108 : 132;
  return (
    <View
      style={[
        styles.pill,
        {
          width,
          height,
          shadowColor: BRAND_COLORS.primary,
        },
      ]}
    >
      <Svg
        width={width}
        height={height}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        <Defs>
          <LinearGradient id="sharePill" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={BRAND_COLORS.primary} />
            <Stop offset="1" stopColor={BRAND_COLORS.primaryDeep} />
          </LinearGradient>
        </Defs>
        <Rect
          width={width}
          height={height}
          rx={height / 2}
          fill="url(#sharePill)"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={2}
        />
      </Svg>
      <Text style={[styles.score, compact && styles.scoreCompact]}>{score}</Text>
      {label ? (
        <Text style={[styles.scoreLabel, compact && styles.scoreLabelCompact]}>
          {label.toUpperCase()}
        </Text>
      ) : null}
    </View>
  );
}

function ThumbsIcon({
  size,
  color,
  down,
}: {
  size: number;
  color: string;
  down?: boolean;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={down ? { transform: [{ rotate: "180deg" }] } : undefined}
    >
      <Path
        d="M7 10v12"
        stroke={color}
        strokeWidth={2.1}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"
        stroke={color}
        strokeWidth={2.1}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ShareRecommendChip({ recommend }: { recommend: boolean }) {
  const label = recommend ? "Recomendaria" : "Não recomendaria";
  const accent = recommend ? "#86EFAC" : "#FCA5A5";
  const width = recommend ? 340 : 400;
  return (
    <View
      style={[
        styles.recChip,
        { width },
        recommend ? styles.recYes : styles.recNo,
      ]}
    >
      <View
        style={[
          styles.recBadge,
          {
            backgroundColor: recommend
              ? "rgba(34, 197, 94, 0.2)"
              : "rgba(239, 68, 68, 0.2)",
            borderColor: recommend
              ? "rgba(187, 247, 208, 0.4)"
              : "rgba(254, 202, 202, 0.4)",
          },
        ]}
      >
        <ThumbsIcon
          size={24}
          color={recommend ? "#BBF7D0" : "#FECACA"}
          down={!recommend}
        />
      </View>
      <Text style={[styles.recText, { color: accent }]}>{label}</Text>
    </View>
  );
}

export function ShareHero({
  uris,
  width,
  height,
  radius,
  emoji,
  caption,
}: {
  uris: string[];
  width: number;
  height: number;
  radius: number;
  emoji?: string;
  caption?: string | null;
}) {
  const photos = uris.slice(0, 4);
  const gap = photos.length > 1 ? 10 : 0;
  const cells = mosaicCells(Math.max(photos.length, 1), 0, 0, width, height, gap);

  return (
    <View
      style={[
        styles.heroShadow,
        { width, height, borderRadius: radius },
      ]}
    >
      <View
        style={[
          styles.heroClip,
          { borderRadius: radius, width, height },
        ]}
      >
        {photos.length > 0 ? (
          cells.map((cell, index) => {
            const uri = photos[index];
            if (!uri) return null;
            return (
              <ExpoImage
                key={`${uri}-${index}`}
                source={{ uri }}
                contentFit="cover"
                transition={0}
                cachePolicy="memory-disk"
                style={{
                  position: "absolute",
                  left: cell.x,
                  top: cell.y,
                  width: cell.w,
                  height: cell.h,
                  borderRadius: photos.length === 1 ? 0 : 12,
                }}
              />
            );
          })
        ) : (
          <IllustratedHero width={width} height={height} emoji={emoji} caption={caption} />
        )}
      </View>
    </View>
  );
}

function IllustratedHero({
  width,
  height,
  emoji,
  caption,
}: {
  width: number;
  height: number;
  emoji?: string;
  caption?: string | null;
}) {
  return (
    <View style={{ width, height, alignItems: "center", justifyContent: "center" }}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="heroFill" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#1e293b" />
            <Stop offset="0.55" stopColor="#0f172a" />
            <Stop offset="1" stopColor="#0c4a6e" />
          </LinearGradient>
          <RadialGradient id="heroGlow" cx="50%" cy="42%" r="38%">
            <Stop offset="0" stopColor="rgb(14,165,233)" stopOpacity="0.32" />
            <Stop offset="0.55" stopColor="rgb(14,165,233)" stopOpacity="0.1" />
            <Stop offset="1" stopColor="rgb(14,165,233)" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#heroFill)" />
        <Rect width={width} height={height} fill="url(#heroGlow)" />
      </Svg>
      {emoji ? (
        <Text style={[styles.emoji, { fontSize: Math.round(Math.min(width, height) * 0.26) }]}>
          {emoji}
        </Text>
      ) : null}
      {caption ? <Text style={styles.heroCaption}>{caption}</Text> : null}
    </View>
  );
}

export function ShareMonthBackdrop() {
  return (
    <Svg
      width={SHARE_W}
      height={SHARE_H}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id="monthBg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={BRAND_COLORS.primaryDark} />
          <Stop offset="1" stopColor={BRAND_COLORS.ink} />
        </LinearGradient>
      </Defs>
      <Rect width={SHARE_W} height={SHARE_H} fill="url(#monthBg)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: -40,
    left: -40,
    width: SHARE_W + 80,
    height: SHARE_H + 80,
  },
  header: {
    position: "absolute",
    top: 79,
    left: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  headerCopy: { gap: 2 },
  headerLabel: {
    color: "rgba(248, 250, 252, 0.55)",
    fontSize: 20,
    fontWeight: "500",
    letterSpacing: 0.4,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 78,
    alignItems: "center",
  },
  footerRule: {
    width: SHARE_W - 320,
    height: 2,
    backgroundColor: "rgba(248, 250, 252, 0.12)",
    marginBottom: 28,
  },
  footerBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  slogan: {
    color: "rgba(248, 250, 252, 0.45)",
    fontSize: 17,
    fontWeight: "600",
    marginTop: 14,
    textAlign: "center",
  },
  sloganAccent: { color: BRAND_COLORS.primary, fontWeight: "600" },
  pill: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    shadowOpacity: 0.55,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  score: {
    color: BRAND_COLORS.paper,
    fontSize: 58,
    fontWeight: "800",
    lineHeight: 64,
  },
  scoreCompact: { fontSize: 48, lineHeight: 54 },
  scoreLabel: {
    color: "rgba(248, 250, 252, 0.82)",
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginTop: 2,
  },
  scoreLabelCompact: { fontSize: 20 },
  recChip: {
    height: 68,
    borderRadius: 999,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 22,
  },
  recYes: {
    backgroundColor: "rgba(34, 197, 94, 0.14)",
    borderColor: "rgba(134, 239, 172, 0.35)",
  },
  recNo: {
    backgroundColor: "rgba(239, 68, 68, 0.14)",
    borderColor: "rgba(252, 165, 165, 0.35)",
  },
  recBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  recText: { fontSize: 27, fontWeight: "600" },
  heroShadow: {
    backgroundColor: "#111827",
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 60,
    shadowOffset: { width: 0, height: 28 },
    elevation: 16,
  },
  heroClip: {
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.18)",
  },
  emoji: { textAlign: "center" },
  heroCaption: {
    marginTop: 12,
    color: "rgba(248, 250, 252, 0.55)",
    fontSize: 28,
    fontWeight: "600",
    letterSpacing: 1.4,
  },
});
