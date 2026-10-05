import { useEffect, useState } from "react";
import { StyleSheet, Switch, View } from "react-native";

import { upsertPlaceOpinion } from "@/api/places/places";
import { ChoiceChip } from "@/components/ChoiceChip";
import { ThemedText } from "@/components/themed-text";
import { Button, Card, Input } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { formatRating, summarizePlaceOpinions } from "@/domain/places";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { PlaceVisit, TripPlaceOpinion } from "@/types/places";

const RATINGS = [1, 2, 3, 4, 5] as const;

/** Opiniões dos membros de uma viagem sobre o lugar + edição da opinião de quem está logado. */
export function PlaceOpinionsCard({
  place,
  opinions,
  currentUserId,
  onSaved,
}: {
  place: PlaceVisit;
  opinions: TripPlaceOpinion[];
  currentUserId: string | null;
  onSaved: () => void | Promise<void>;
}) {
  const { ok, fail } = useFeedback();
  const mine = opinions.find((o) => o.user_id === currentUserId) ?? null;
  const [rating, setRating] = useState<number | null>(null);
  const [recommend, setRecommend] = useState(true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRating(mine?.rating ?? null);
    setRecommend(mine?.would_recommend ?? true);
    setNotes(mine?.notes ?? "");
  }, [mine?.rating, mine?.would_recommend, mine?.notes]);

  const summary = summarizePlaceOpinions(opinions);
  const authorLabel = (opinion: TripPlaceOpinion) =>
    opinion.user_id === currentUserId ? "Você" : opinion.display_name?.trim() || "Membro";

  async function save() {
    setSaving(true);
    try {
      await upsertPlaceOpinion(place.id, { rating, notes, would_recommend: recommend });
      ok("Opinião salva");
      await onSaved();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível salvar a opinião."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card style={styles.card}>
      <ThemedText type="smallBold">Opiniões da viagem</ThemedText>
      {summary.totalOpinions > 0 ? (
        <ThemedText type="small" themeColor="mutedForeground">
          {[
            summary.avgRating != null ? `${formatRating(summary.avgRating)}★ de média` : null,
            `${summary.totalOpinions} opini${summary.totalOpinions === 1 ? "ão" : "ões"}`,
            `${summary.recommendYes} recomenda${summary.recommendYes === 1 ? "" : "m"}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </ThemedText>
      ) : null}

      {opinions.map((opinion) => (
        <View key={opinion.id} style={styles.row}>
          <ThemedText type="smallBold">
            {authorLabel(opinion)}
            {opinion.rating ? ` · ${formatRating(opinion.rating)}★` : ""}
            {opinion.would_recommend === false ? " · não recomenda" : " · recomenda"}
          </ThemedText>
          {opinion.notes?.trim() ? (
            <ThemedText type="small" themeColor="mutedForeground">
              {opinion.notes.trim()}
            </ThemedText>
          ) : null}
        </View>
      ))}

      <ThemedText type="smallBold" style={styles.mineTitle}>
        Sua opinião
      </ThemedText>
      <View style={styles.chips}>
        {RATINGS.map((value) => (
          <ChoiceChip
            key={value}
            label={`${value}★`}
            active={rating === value}
            onPress={() => setRating(rating === value ? null : value)}
          />
        ))}
      </View>
      <View style={styles.switchRow}>
        <ThemedText style={styles.flex}>Recomendo</ThemedText>
        <Switch value={recommend} onValueChange={setRecommend} />
      </View>
      <Input
        placeholder="Comentário (opcional)"
        value={notes}
        onChangeText={setNotes}
        multiline
containerStyle={styles.input}
      />
      <Button
        label={saving ? "Salvando…" : mine ? "Atualizar opinião" : "Salvar opinião"}
        disabled={saving}
        loading={saving}
        onPress={() => void save()}
        size="lg"
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, gap: Spacing.two },
  row: { gap: 2 },
  mineTitle: { marginTop: Spacing.two },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
  input: {
    paddingVertical: 10,
  },
});
