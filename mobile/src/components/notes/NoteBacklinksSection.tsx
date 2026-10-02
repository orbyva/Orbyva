import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { fetchNotesMentioningTitle, fetchNotesSharingEntity } from "@/api/notes/mentions";
import { MentionList } from "@/components/notes/MentionList";
import { ThemedText } from "@/components/themed-text";
import { noteExcerpt } from "@/domain/notes/listView";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { Note } from "@/types/notes";

/** "Mencionada em": notas com `[[título desta]]` e notas ligadas às mesmas entidades. */
export function NoteBacklinksSection({ noteId, title }: { noteId: string; title: string }) {
  const theme = useTheme();
  const router = useRouter();
  const { fail } = useFeedback();
  const [mentions, setMentions] = useState<Note[]>([]);
  const [related, setRelated] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const handle = setTimeout(() => {
      setLoading(true);
      void Promise.all([
        fetchNotesMentioningTitle(title, noteId),
        fetchNotesSharingEntity(noteId),
      ])
        .then(([nextMentions, nextRelated]) => {
          if (!alive) return;
          setMentions(nextMentions);
          setRelated(nextRelated);
        })
        .catch((err) => {
          if (alive) fail(getErrorMessage(err, "Erro ao carregar as menções."));
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 600);
    return () => {
      alive = false;
      clearTimeout(handle);
    };
  }, [noteId, title, fail]);

  const toRows = (notes: Note[]) =>
    notes.map((note) => ({
      id: note.id,
      title: note.title,
      excerpt: noteExcerpt(note.content ?? "", 100),
    }));
  const open = (id: string) => router.push(`/notes/${id}`);

  return (
    <View style={[styles.section, { borderTopColor: theme.backgroundSelected }]}>
      <View style={styles.head}>
        <Ionicons name="return-up-back-outline" size={16} color={theme.textSecondary} />
        <ThemedText type="smallBold">Mencionada em</ThemedText>
      </View>
      {loading ? (
        <ThemedText type="small" themeColor="textSecondary">
          Procurando menções…
        </ThemedText>
      ) : mentions.length === 0 && related.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Nenhuma nota aponta para esta. Escreva [[{title.trim() || "o título desta nota"}]] em
          outra nota para criar a ligação.
        </ThemedText>
      ) : (
        <>
          <MentionList
            caption={`Com [[${title.trim()}]] no texto`}
            rows={toRows(mentions)}
            onOpen={open}
          />
          <MentionList
            caption="Ligadas às mesmas coisas que esta"
            rows={toRows(related)}
            onOpen={open}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: "row", alignItems: "center", gap: 6 },
});
