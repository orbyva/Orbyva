import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { MentionList } from "@/components/notes/MentionList";
import { useTheme } from "@/hooks/use-theme";

/** "Notas" dentro do card de outra entidade. Quem carrega é a tela (em lote); vazia = nada. */
export function EntityNotesSection({
  notes,
}: {
  notes: readonly { id: string; title: string }[];
}) {
  const theme = useTheme();
  const router = useRouter();
  if (notes.length === 0) return null;
  return (
    <View style={[styles.section, { borderTopColor: theme.border }]}>
      <MentionList
        caption="Notas"
        icon="document-text-outline"
        rows={notes}
        onOpen={(id) => router.push(`/notes/${id}`)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
});
