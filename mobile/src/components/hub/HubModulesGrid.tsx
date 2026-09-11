import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/Card";
import { ModuleColors, Spacing } from "@/constants/theme";
import type { AppHref } from "@/lib/nav";

export const HUB_MODULES: {
  label: string;
  subtitle: string;
  href: AppHref;
  color: string;
}[] = [
  {
    label: "Finanças",
    subtitle: "Lançamentos",
    href: "/finance",
    color: ModuleColors.finance,
  },
  {
    label: "Tarefas",
    subtitle: "Hoje e atrasadas",
    href: "/tasks",
    color: ModuleColors.productivity,
  },
  {
    label: "Projetos",
    subtitle: "Tarefas agrupadas",
    href: "/tasks/projects",
    color: "#7C3AED",
  },
  {
    label: "Notas",
    subtitle: "Markdown",
    href: "/notes",
    color: "#6366F1",
  },
  {
    label: "Compras",
    subtitle: "Lista da casa",
    href: "/shopping",
    color: "#EC4899",
  },
  {
    label: "Hábitos",
    subtitle: "Rotina do dia",
    href: null,
    color: ModuleColors.life,
  },
  {
    label: "Saúde",
    subtitle: "Medicações e consultas",
    href: null,
    color: "#F43F5E",
  },
  {
    label: "Metas",
    subtitle: "Progresso longo prazo",
    href: null,
    color: "#14B8A6",
  },
  {
    label: "Lugares",
    subtitle: "Onde você esteve",
    href: null,
    color: "#0EA5E9",
  },
  {
    label: "Viagens",
    subtitle: "Planeje e viva",
    href: null,
    color: "#14B8A6",
  },
  {
    label: "Veículos",
    subtitle: "Tudo do seu carro",
    href: null,
    color: "#F97316",
  },
  {
    label: "Cinema",
    subtitle: "Filmes e séries",
    href: null,
    color: ModuleColors.entertainment,
  },
  {
    label: "Livros",
    subtitle: "Lendo e lidos",
    href: null,
    color: "#F59E0B",
  },
  {
    label: "Música",
    subtitle: "Álbuns e EPs",
    href: null,
    color: "#F43F5E",
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

  return (
    <View style={styles.block}>
      <ThemedText type="smallBold">Módulos</ThemedText>
      <View style={styles.grid}>
        {live.map((mod) => (
          <Pressable
            key={mod.label}
            onPress={() => onOpen(mod.href)}
            style={styles.tileWrap}
          >
            <Card style={styles.tile}>
              <View style={[styles.dot, { backgroundColor: mod.color }]} />
              <ThemedText type="smallBold">{mod.label}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {mod.subtitle}
              </ThemedText>
            </Card>
          </Pressable>
        ))}
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
  dot: { width: 10, height: 10, borderRadius: 5, marginBottom: 4 },
});
