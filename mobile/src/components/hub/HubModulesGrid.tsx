import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui";
import { Radius, Spacing, type ModuleColorKey } from "@/constants/theme";
import { useModuleColors } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";
import type { AppHref } from "@/lib/nav";

export const HUB_MODULES: {
  label: string;
  subtitle: string;
  href: AppHref;
  /** Grupo do módulo na sidebar do web — cor de `ModuleColors`, segue o tema. */
  tint: ModuleColorKey;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    label: "Finanças",
    subtitle: "Lançamentos",
    href: "/finance",
    tint: "finance",
    icon: "wallet-outline",
  },
  {
    label: "Tarefas",
    subtitle: "Hoje e atrasadas",
    href: "/tasks",
    tint: "productivity",
    icon: "checkbox-outline",
  },
  {
    label: "Projetos",
    subtitle: "Tarefas agrupadas",
    href: "/tasks/projects",
    tint: "productivity",
    icon: "folder-outline",
  },
  {
    label: "Notas",
    subtitle: "Markdown",
    href: "/notes",
    tint: "productivity",
    icon: "document-text-outline",
  },
  {
    label: "Compras",
    subtitle: "Lista da casa",
    href: "/shopping",
    tint: "productivity",
    icon: "cart-outline",
  },
  {
    label: "Hábitos",
    subtitle: "Rotina do dia",
    href: "/habits",
    tint: "life",
    icon: "checkmark-circle-outline",
  },
  {
    label: "Saúde",
    subtitle: "Medicações e consultas",
    href: "/health",
    tint: "health",
    icon: "heart-outline",
  },
  {
    label: "Metas",
    subtitle: "Progresso longo prazo",
    href: "/goals",
    tint: "life",
    icon: "flag-outline",
  },
  {
    label: "Lugares",
    subtitle: "Onde você esteve",
    href: "/places",
    tint: "life",
    icon: "location-outline",
  },
  {
    label: "Viagens",
    subtitle: "Planeje e viva",
    href: "/travel",
    tint: "travel",
    icon: "airplane-outline",
  },
  {
    label: "Veículos",
    subtitle: "Tudo do seu carro",
    href: "/cars",
    tint: "car",
    icon: "car-outline",
  },
  {
    label: "Cinema",
    subtitle: "Filmes e séries",
    href: "/movies",
    tint: "entertainment",
    icon: "film-outline",
  },
  {
    label: "Livros",
    subtitle: "Lendo e lidos",
    href: "/books",
    tint: "entertainment",
    icon: "book-outline",
  },
  {
    label: "Música",
    subtitle: "Álbuns e EPs",
    href: "/music",
    tint: "entertainment",
    icon: "musical-notes-outline",
  },
  {
    label: "Links",
    subtitle: "Para ver depois",
    href: "/links",
    tint: "entertainment",
    icon: "link-outline",
  },
];

type HubModulesGridProps = {
  onOpen: (href: Exclude<AppHref, null>) => void;
};

export function HubModulesGrid({ onOpen }: HubModulesGridProps) {
  const live = HUB_MODULES.filter(
    (mod): mod is (typeof HUB_MODULES)[number] & { href: Exclude<AppHref, null> } =>
      Boolean(mod.href)
  );
  const moduleColors = useModuleColors();

  return (
    <View style={styles.block}>
      <ThemedText type="smallBold">Módulos</ThemedText>
      <View style={styles.grid}>
        {live.map((mod) => {
          const color = moduleColors[mod.tint];
          return (
          <Pressable
            key={mod.label}
            onPress={() => onOpen(mod.href)}
            style={styles.tileWrap}
          >
            <Card style={styles.tile}>
              <View
                style={[
                  styles.iconWell,
                  { backgroundColor: hexAlpha(color, 0.16) },
                ]}
              >
                <Ionicons name={mod.icon} size={18} color={color} />
              </View>
              <ThemedText type="smallBold">{mod.label}</ThemedText>
              <ThemedText type="small" themeColor="mutedForeground">
                {mod.subtitle}
              </ThemedText>
            </Card>
          </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.two },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  tileWrap: {
    width: "48%",
    flexGrow: 1,
    minWidth: "47%",
  },
  tile: {
    padding: Spacing.three,
    gap: 4,
    width: "100%",
  },
  iconWell: {
    width: 32,
    height: 32,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
});
