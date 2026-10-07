import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Badge } from "@/components/ui";
import { Radius } from "@/constants/theme";
import type { CatalogReview } from "@/domain/catalog/review";
import { useTheme } from "@/hooks/use-theme";

/** "Sua opinião" no detalhe: se indicaria e a observação escrita. Sem nenhum dos dois, nada. */
export function ReviewBlock({ review }: { review: CatalogReview }) {
  const theme = useTheme();
  if (review.recommend == null && !review.notes) return null;

  return (
    <View style={[styles.block, { borderColor: theme.border, backgroundColor: theme.card }]}>
      <View style={styles.head}>
        <Ionicons name="chatbubble-ellipses-outline" size={15} color={theme.mutedForeground} />
        <ThemedText type="smallBold" style={styles.flex}>
          Sua opinião
        </ThemedText>
        {review.recommend != null ? (
          <Badge
            label={review.recommend ? "Indicaria" : "Não indicaria"}
            variant={review.recommend ? "success" : "destructive"}
            icon={review.recommend ? "thumbs-up-outline" : "thumbs-down-outline"}
          />
        ) : null}
      </View>
      {review.notes ? (
        <View style={[styles.quote, { borderLeftColor: theme.primary }]}>
          <ThemedText type="default">{review.notes}</ThemedText>
        </View>
      ) : (
        <ThemedText type="small" themeColor="mutedForeground">
          Sem observação escrita.
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10, padding: 12, borderWidth: 1, borderRadius: Radius.xl },
  head: { flexDirection: "row", alignItems: "center", gap: 6 },
  flex: { flex: 1 },
  quote: { borderLeftWidth: 3, paddingLeft: 10 },
});
