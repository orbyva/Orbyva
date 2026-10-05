import { memo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { Radius, Spacing } from "@/constants/theme";
import { mapOrbWebPathToMobile } from "@/domain/orb/navigationMap";
import type {
  OrbBadge,
  OrbBadgeTone,
  OrbBarGroup,
  OrbBarItem,
  OrbCardItem,
  OrbPosterItem,
  OrbResultView as Visao,
  OrbRowItem,
} from "@/domain/orb/results";
import { TypeScale } from "@/domain/ui/typography";
import { useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";

function tomBadge(
  theme: ReturnType<typeof useTheme>,
  tone: OrbBadgeTone = "neutro"
): { bg: string; fg: string } {
  switch (tone) {
    case "ok":
      return { bg: hexAlpha(theme.success, 0.13), fg: theme.success };
    case "erro":
      return { bg: hexAlpha(theme.destructive, 0.13), fg: theme.destructive };
    case "atencao":
      return { bg: hexAlpha(theme.warning, 0.13), fg: theme.warning };
    case "destaque":
      return { bg: hexAlpha(theme.primary, 0.13), fg: theme.primary };
    default:
      return { bg: theme.border, fg: theme.mutedForeground };
  }
}

function tomTexto(
  theme: ReturnType<typeof useTheme>,
  tone: OrbBadgeTone = "neutro"
): string {
  switch (tone) {
    case "ok":
      return theme.success;
    case "erro":
      return theme.destructive;
    case "atencao":
      return theme.warning;
    case "destaque":
      return theme.primary;
    default:
      return theme.foreground;
  }
}

function tomBarra(
  theme: ReturnType<typeof useTheme>,
  tone: OrbBadgeTone = "destaque"
): string {
  switch (tone) {
    case "ok":
      return theme.success;
    case "erro":
      return theme.destructive;
    case "atencao":
      return theme.warning;
    case "neutro":
      return theme.mutedForeground;
    default:
      return theme.primary;
  }
}

function useNavTo() {
  const router = useRouter();
  return (webPath?: string) => {
    if (!webPath) return;
    const href = mapOrbWebPathToMobile(webPath);
    if (!href) return;
    router.push(href as never);
  };
}

function Etiqueta({ badge }: { badge: OrbBadge }) {
  const theme = useTheme();
  const t = tomBadge(theme, badge.tone);
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <ThemedText type="small" style={[TypeScale.nano, { color: t.fg }]}>
        {badge.label}
      </ThemedText>
    </View>
  );
}

function Alvo({
  to,
  children,
  style,
}: {
  to?: string;
  children: React.ReactNode;
  style?: object;
}) {
  const nav = useNavTo();
  if (!to) return <View style={style}>{children}</View>;
  return (
    <Pressable onPress={() => nav(to)} style={style} accessibilityRole="link">
      {children}
    </Pressable>
  );
}

function Cartoes({ items }: { items: OrbCardItem[] }) {
  const theme = useTheme();
  return (
    <View style={styles.stack}>
      {items.map((item) => (
        <Alvo
          key={item.id}
          to={item.to}
          style={[
            styles.card,
            {
              borderColor: theme.border,
              backgroundColor: theme.card,
            },
          ]}
        >
          <View style={styles.rowBetween}>
            <ThemedText type="smallBold" style={{ flex: 1 }} numberOfLines={2}>
              {item.title}
            </ThemedText>
            {item.meta ? (
              <ThemedText type="small" themeColor="mutedForeground">
                {item.meta}
              </ThemedText>
            ) : null}
          </View>
          {item.subtitle ? (
            <ThemedText type="small" themeColor="mutedForeground" numberOfLines={2}>
              {item.subtitle}
            </ThemedText>
          ) : null}
          {item.badges && item.badges.length > 0 ? (
            <View style={styles.badges}>
              {item.badges.map((badge) => (
                <Etiqueta key={badge.label} badge={badge} />
              ))}
            </View>
          ) : null}
        </Alvo>
      ))}
    </View>
  );
}

function Poster({ item }: { item: OrbPosterItem }) {
  const theme = useTheme();
  const [broken, setBroken] = useState(false);
  return (
    <Alvo
      to={item.to}
      style={[
        styles.poster,
        {
          borderColor: theme.border,
          backgroundColor: theme.card,
        },
      ]}
    >
      <View style={[styles.posterImg, { backgroundColor: theme.muted }]}>
        {item.image && !broken ? (
          <Image
            source={{ uri: item.image }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setBroken(true)}
          />
        ) : (
          <ThemedText type="small" themeColor="mutedForeground">
            —
          </ThemedText>
        )}
        {item.badge ? (
          <View style={styles.posterBadge}>
            <Etiqueta badge={item.badge} />
          </View>
        ) : null}
      </View>
      <ThemedText type="smallBold" numberOfLines={2} style={styles.posterTitle}>
        {item.title}
      </ThemedText>
      {item.subtitle ? (
        <ThemedText type="small" themeColor="mutedForeground" numberOfLines={1}>
          {item.subtitle}
        </ThemedText>
      ) : null}
    </Alvo>
  );
}

function Carrossel({ items }: { items: OrbPosterItem[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.carousel}>
      {items.map((item) => (
        <Poster key={item.id} item={item} />
      ))}
    </ScrollView>
  );
}

function Linhas({ items }: { items: OrbRowItem[] }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.rowsBox,
        {
          borderColor: theme.border,
          backgroundColor: theme.card,
        },
      ]}
    >
      {items.map((item, index) => (
        <Alvo
          key={item.id}
          to={item.to}
          style={[
            styles.rowItem,
            index > 0 && {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: theme.border,
            },
          ]}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <ThemedText type="small" numberOfLines={1}>
              {item.title}
            </ThemedText>
            {item.subtitle ? (
              <ThemedText type="small" themeColor="mutedForeground" numberOfLines={1}>
                {item.subtitle}
              </ThemedText>
            ) : null}
          </View>
          {item.value ? (
            <ThemedText
              type="smallBold"
              style={{ color: tomTexto(theme, item.valueTone) }}
            >
              {item.value}
            </ThemedText>
          ) : null}
        </Alvo>
      ))}
    </View>
  );
}

function Barras({ items }: { items: OrbBarItem[] }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.barsBox,
        {
          borderColor: theme.border,
          backgroundColor: theme.card,
        },
      ]}
    >
      {items.map((item) => {
        const largura = Math.max(0, Math.min(1, item.ratio)) * 100;
        const estourou = item.ratio > 1;
        return (
          <View key={item.id} style={styles.barBlock}>
            <View style={styles.rowBetween}>
              <ThemedText type="small" style={{ flex: 1 }} numberOfLines={1}>
                {item.label}
              </ThemedText>
              <ThemedText type="small" themeColor="mutedForeground">
                {item.value}
              </ThemedText>
            </View>
            <View style={[styles.barTrack, { backgroundColor: theme.muted }]}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${largura}%`,
                    backgroundColor: tomBarra(theme, estourou ? "erro" : item.tone),
                  },
                ]}
              />
            </View>
            {item.hint ? (
              <ThemedText type="small" themeColor="mutedForeground" style={TypeScale.nano}>
                {item.hint}
              </ThemedText>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function BarrasAgrupadas({ groups }: { groups: OrbBarGroup[] }) {
  return (
    <View style={styles.stack}>
      {groups.map((grupo) => (
        <View key={grupo.id} style={{ gap: 6 }}>
          <ThemedText type="smallBold" themeColor="mutedForeground">
            {grupo.title.toUpperCase()}
          </ThemedText>
          <Barras items={grupo.items} />
        </View>
      ))}
    </View>
  );
}

export const OrbResultView = memo(function OrbResultView({ view }: { view: Visao }) {
  return (
    <View style={styles.wrap}>
      {view.kind === "cards" ? <Cartoes items={view.items} /> : null}
      {view.kind === "carousel" ? <Carrossel items={view.items} /> : null}
      {view.kind === "rows" ? <Linhas items={view.items} /> : null}
      {view.kind === "bars" ? <Barras items={view.items} /> : null}
      {view.kind === "grouped_bars" ? <BarrasAgrupadas groups={view.groups} /> : null}
      {view.note ? (
        <ThemedText type="small" themeColor="mutedForeground">
          {view.note}
        </ThemedText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one, marginTop: Spacing.two },
  stack: { gap: Spacing.two },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.xl,
    padding: Spacing.two,
    gap: 4,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },
  badge: {
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  carousel: { marginHorizontal: -4 },
  poster: {
    width: 104,
    marginHorizontal: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.xl,
    overflow: "hidden",
    paddingBottom: 6,
  },
  posterImg: {
    width: "100%",
    aspectRatio: 2 / 3,
    alignItems: "center",
    justifyContent: "center",
  },
  posterBadge: { position: "absolute", left: 4, top: 4 },
  posterTitle: { paddingHorizontal: 6, marginTop: 4, ...TypeScale.micro },
  rowsBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.xl,
    overflow: "hidden",
  },
  rowItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: 10,
  },
  barsBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.xl,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  barBlock: { gap: 4 },
  barTrack: { height: 6, borderRadius: Radius.full, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: Radius.full },
});
