import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { fetchNotesMentioningTitle, fetchNotesSharingEntity } from "@/api/notes/mentions";
import { ThemedText } from "@/components/themed-text";
import { Skeleton } from "@/components/ui";
import { Radius } from "@/constants/theme";
import { mentionSnippet, noteCountLabel, noteEditedLabel } from "@/domain/notes/backlinks";
import { noteExcerpt } from "@/domain/notes/listView";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { tintedSurface } from "@/lib/color";
import { getErrorMessage } from "@/lib/errors";
import type { Note } from "@/types/notes";

type IconName = keyof typeof Ionicons.glyphMap;

function BacklinkCard({
  note,
  title,
  onOpen,
}: {
  note: Note;
  /** Título desta nota quando o card vem de um `[[wiki-link]]`; sem ele, mostra o começo da nota. */
  title?: string;
  onOpen: (id: string) => void;
}) {
  const theme = useTheme();
  const snippet = title ? mentionSnippet(note.content ?? "", title) : null;
  const excerpt = snippet ? "" : noteExcerpt(note.content ?? "", 110);
  const edited = noteEditedLabel(note.updated_at);
  const highlight = tintedSurface(theme.primary).backgroundColor;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Abrir ${note.title || "Sem título"}`}
      onPress={() => onOpen(note.id)}
      style={({ pressed }) => [
        styles.card,
        { borderColor: theme.border, backgroundColor: theme.card },
        pressed && { backgroundColor: theme.muted },
      ]}
    >
      <View style={[styles.cardIcon, { backgroundColor: theme.muted }]}>
        <Ionicons
          name={note.kind === "canvas" ? "easel-outline" : "document-text-outline"}
          size={16}
          color={theme.mutedForeground}
        />
      </View>
      <View style={styles.cardCopy}>
        <View style={styles.cardTitleRow}>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.flexText}>
            {note.title || "Sem título"}
          </ThemedText>
          {edited ? (
            <ThemedText type="small" themeColor="mutedForeground">
              {edited}
            </ThemedText>
          ) : null}
        </View>
        {snippet ? (
          <ThemedText type="small" themeColor="mutedForeground" numberOfLines={2}>
            {snippet.before}
            <ThemedText
              type="smallBold"
              style={{ color: theme.primary, backgroundColor: highlight }}
            >
              {` ${snippet.link} `}
            </ThemedText>
            {snippet.after}
          </ThemedText>
        ) : excerpt ? (
          <ThemedText type="small" themeColor="mutedForeground" numberOfLines={2}>
            {excerpt}
          </ThemedText>
        ) : (
          <ThemedText type="small" themeColor="mutedForeground" style={styles.italic}>
            Nota vazia
          </ThemedText>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.mutedForeground} />
    </Pressable>
  );
}

function Group({
  icon,
  caption,
  count,
  children,
}: {
  icon: IconName;
  caption: string;
  count: number;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  if (count === 0) return null;
  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <Ionicons name={icon} size={13} color={theme.mutedForeground} />
        <ThemedText type="small" themeColor="mutedForeground" numberOfLines={1} style={styles.flexText}>
          {caption}
        </ThemedText>
        <ThemedText type="small" themeColor="mutedForeground">
          {count}
        </ThemedText>
      </View>
      <View style={styles.cards}>{children}</View>
    </View>
  );
}

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

  const open = (id: string) => router.push(`/notes/${id}`);
  const shownTitle = title.trim() || "o título desta nota";
  const mentionIds = new Set(mentions.map((n) => n.id));
  const relatedOnly = related.filter((n) => !mentionIds.has(n.id));
  const total = mentions.length + relatedOnly.length;
  const accent = tintedSurface(theme.primary);

  return (
    <View style={[styles.section, { borderTopColor: theme.border }]}>
      <View style={styles.head}>
        <View style={[styles.headIcon, accent]}>
          <Ionicons name="return-up-back-outline" size={16} color={theme.primary} />
        </View>
        <View style={styles.flexText}>
          <ThemedText type="bodyStrong">Mencionada em</ThemedText>
          <ThemedText type="small" themeColor="mutedForeground">
            Notas que apontam para esta
          </ThemedText>
        </View>
        {!loading && total > 0 ? (
          <View style={[styles.countPill, accent]}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              {noteCountLabel(total)}
            </ThemedText>
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.cards}>
          {[0, 1].map((i) => (
            <View key={i} style={[styles.card, { borderColor: theme.border }]}>
              <Skeleton style={styles.skeletonIcon} />
              <View style={styles.cardCopy}>
                <Skeleton style={styles.skeletonTitle} />
                <Skeleton style={styles.skeletonLine} />
              </View>
            </View>
          ))}
        </View>
      ) : total === 0 ? (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Ionicons name="git-network-outline" size={22} color={theme.mutedForeground} />
          <ThemedText type="smallBold">Nenhuma nota aponta para esta ainda</ThemedText>
          <ThemedText type="small" themeColor="mutedForeground" style={styles.center}>
            Escreva o link abaixo em outra nota para conectá-las.
          </ThemedText>
          <View style={[styles.codeChip, { backgroundColor: theme.muted }]}>
            <ThemedText type="smallBold" selectable style={{ color: theme.primary }}>
              {`[[${shownTitle}]]`}
            </ThemedText>
          </View>
        </View>
      ) : (
        <>
          <Group icon="link-outline" caption={`Citam [[${title.trim()}]]`} count={mentions.length}>
            {mentions.map((note) => (
              <BacklinkCard key={note.id} note={note} title={title} onOpen={open} />
            ))}
          </Group>
          <Group
            icon="git-network-outline"
            caption="Ligadas às mesmas tarefas, projetos ou metas"
            count={relatedOnly.length}
          >
            {relatedOnly.map((note) => (
              <BacklinkCard key={note.id} note={note} onOpen={open} />
            ))}
          </Group>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 14, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  headIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  countPill: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  flexText: { flex: 1, minWidth: 0 },
  group: { gap: 8 },
  groupHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  cards: { gap: 8 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderRadius: Radius.xl,
  },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cardCopy: { flex: 1, minWidth: 0, gap: 3 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  italic: { fontStyle: "italic" },
  skeletonIcon: { width: 32, height: 32 },
  skeletonTitle: { width: "55%", height: 12 },
  skeletonLine: { width: "85%", height: 10 },
  empty: {
    alignItems: "center",
    gap: 6,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: Radius.xl,
  },
  center: { textAlign: "center" },
  codeChip: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.md,
  },
});
