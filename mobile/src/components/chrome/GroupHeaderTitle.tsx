import Ionicons from "@expo/vector-icons/Ionicons";
import { usePathname, useRouter } from "expo-router";
import { useState } from "react";
import { type ColorValue, Pressable, StyleSheet, Text, View } from "react-native";

import { ListRow, Sheet } from "@/components/ui";
import { Radius, Spacing } from "@/constants/theme";
import { HeaderTitle } from "@/domain/ui/typography";
import { useModuleColors, useTheme } from "@/hooks/use-theme";
import { navLeafForPath, type AppHref } from "@/lib/nav";

type HeaderTitleProps = { children: string; tintColor?: ColorValue };

/**
 * Título do header nativo. Em tela que é item da sidebar vira `Título ▾` e abre as páginas do
 * mesmo grupo; em detalhe e formulário fica texto comum.
 */
export function GroupHeaderTitle({ children, tintColor }: HeaderTitleProps) {
  const theme = useTheme();
  const moduleColors = useModuleColors();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const color = tintColor ?? theme.foreground;
  const current = navLeafForPath(pathname);

  if (!current || current.group.items.length < 2) {
    return (
      <Text style={[HeaderTitle, { color }]} numberOfLines={1}>
        {children}
      </Text>
    );
  }

  const { group, leaf } = current;
  const accent = moduleColors[group.module];

  function go(href: AppHref) {
    setOpen(false);
    if (!href || href === leaf.href) return;
    router.navigate(href);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${children}, trocar de página em ${group.title}`}
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={styles.trigger}
      >
        <Text style={[HeaderTitle, styles.title, { color }]} numberOfLines={1}>
          {children}
        </Text>
        <Ionicons name="chevron-down" size={16} color={theme.mutedForeground} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={group.title}>
        <View style={[styles.list, { borderColor: theme.border }]}>
          {group.items.map((item) => {
            const active = item.href === leaf.href;
            return (
              <ListRow
                key={item.title}
                title={item.title}
                onPress={() => go(item.href)}
                left={<View style={[styles.dot, { backgroundColor: accent }]} />}
                trailing={
                  active ? <Ionicons name="checkmark" size={18} color={accent} /> : undefined
                }
                style={active ? { backgroundColor: theme.muted } : undefined}
              />
            );
          })}
        </View>
      </Sheet>
    </>
  );
}

export function groupHeaderTitle(props: HeaderTitleProps) {
  return <GroupHeaderTitle {...props} />;
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    minHeight: 44,
    maxWidth: 220,
  },
  title: { flexShrink: 1 },
  list: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.xl,
    overflow: "hidden",
  },
  dot: { width: 8, height: 8, borderRadius: Radius.full },
});
