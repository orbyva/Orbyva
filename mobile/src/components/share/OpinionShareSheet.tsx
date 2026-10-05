import { cloneElement, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { captureRef } from "react-native-view-shot";
import * as ImagePicker from "expo-image-picker";

import {
  SHARE_H,
  SHARE_PREVIEW_H,
  SHARE_PREVIEW_W,
  SHARE_W,
} from "@/components/share/shareStory";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Button } from "@/components/ui";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { shareOpinionPayload } from "@/lib/shareNative";

export function OpinionShareSheet({
  visible,
  onClose,
  title,
  sheetTitle = "Compartilhar opinião",
  message,
  hasNotes,
  allowPhoto,
  maxPhotos = 1,
  renderCard,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  sheetTitle?: string;
  message: (includeNotes: boolean) => string;
  hasNotes: boolean;
  allowPhoto?: boolean;
  maxPhotos?: number;
  renderCard: (opts: {
    includeNotes: boolean;
    photoUri: string | null;
    photoUris: string[];
  }) => ReactNode;
}) {
  const theme = useTheme();
  const { fail, ok } = useFeedback();
  const cardRef = useRef<View>(null);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const generation = useRef(0);

  const limit = Math.min(Math.max(1, maxPhotos), 4);
  const captureKey = `${includeNotes}:${photoUris.join("|")}`;

  useEffect(() => {
    if (!visible) {
      setIncludeNotes(true);
      setPhotoUris([]);
      setPreviewUri(null);
      setReadyKey(null);
      setSharing(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setPreviewUri(null);
    setReadyKey(null);
    const fallback = setTimeout(() => setReadyKey(captureKey), 2000);
    return () => clearTimeout(fallback);
  }, [visible, captureKey]);

  useEffect(() => {
    if (!visible || readyKey !== captureKey) return;
    const id = ++generation.current;
    let cancelled = false;

    async function snap() {
      await new Promise((resolve) => setTimeout(resolve, 80));
      if (cancelled || !cardRef.current) return;
      try {
        const uri = await captureRef(cardRef, {
          format: "png",
          quality: 1,
          result: "tmpfile",
          width: SHARE_W,
          height: SHARE_H,
        });
        if (!cancelled && generation.current === id) setPreviewUri(uri);
      } catch {
        if (!cancelled && generation.current === id) setPreviewUri(null);
      }
    }

    void snap();
    return () => {
      cancelled = true;
    };
  }, [visible, readyKey, captureKey]);

  async function pickPhoto() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        fail("Permita o acesso às fotos para anexar no card.");
        return;
      }
      const room = limit - photoUris.length;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.85,
        allowsMultipleSelection: limit > 1,
        selectionLimit: Math.max(1, room),
      });
      if (result.canceled) return;
      const next = result.assets
        .map((asset) => asset.uri)
        .filter(Boolean)
        .slice(0, Math.max(1, room));
      if (limit === 1) {
        setPhotoUris(next.slice(0, 1));
        return;
      }
      setPhotoUris((cur) => [...cur, ...next].slice(0, limit));
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível abrir a galeria."));
    }
  }

  async function share() {
    setSharing(true);
    try {
      const result = await shareOpinionPayload({
        title,
        message: message(hasNotes ? includeNotes : false),
        fileUri: previewUri,
      });
      if (result === "cancelled") return;
      ok("Pronto para compartilhar");
      onClose();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível compartilhar."));
    } finally {
      setSharing(false);
    }
  }

  const card = renderCard({
    includeNotes: hasNotes ? includeNotes : false,
    photoUri: photoUris[0] ?? null,
    photoUris,
  });
  const cardNode =
    isValidElement(card)
      ? cloneElement(card as ReactElement<{ onReady?: () => void }>, {
          onReady: () => setReadyKey(captureKey),
        })
      : card;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ThemedView style={styles.flex}>
        <View style={styles.head}>
          <View style={styles.headCopy}>
            <ThemedText type="smallBold">{sheetTitle}</ThemedText>
            <ThemedText type="small" themeColor="mutedForeground" numberOfLines={2}>
              {title}
            </ThemedText>
          </View>
          <Pressable onPress={onClose} hitSlop={8} disabled={sharing}>
            <ThemedText type="linkPrimary">Fechar</ThemedText>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {hasNotes ? (
            <View
              style={[
                styles.switchCard,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.switchCopy}>
                <ThemedText type="smallBold">Exibir opinião</ThemedText>
                <ThemedText type="small" themeColor="mutedForeground">
                  Inclui o comentário no card e no texto.
                </ThemedText>
              </View>
              <Switch
                value={includeNotes}
                onValueChange={setIncludeNotes}
                trackColor={{
                  false: theme.border,
                  true: theme.primary,
                }}
                thumbColor="#FFFFFF"
              />
            </View>
          ) : null}

          {allowPhoto ? (
            limit > 1 ? (
              <View
                style={[
                  styles.photosCard,
                  { borderColor: theme.border },
                ]}
              >
                <View style={styles.photosHead}>
                  <ThemedText type="smallBold">
                    Fotos do mosaico{" "}
                    <ThemedText type="small" themeColor="mutedForeground">
                      {photoUris.length}/{limit}
                    </ThemedText>
                  </ThemedText>
                  {photoUris.length ? (
                    <Pressable onPress={() => setPhotoUris([])} hitSlop={8}>
                      <ThemedText type="small" themeColor="mutedForeground">
                        Limpar
                      </ThemedText>
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.photoGrid}>
                  {photoUris.map((uri, index) => (
                    <View key={`${uri}-${index}`} style={styles.photoCell}>
                      <Image
                        source={{ uri }}
                        style={styles.photoThumb}
                        resizeMode="cover"
                      />
                      <Pressable
                        onPress={() =>
                          setPhotoUris((cur) =>
                            cur.filter((_, itemIndex) => itemIndex !== index)
                          )
                        }
                        hitSlop={6}
                        style={[
                          styles.photoRemove,
                          { backgroundColor: theme.card },
                        ]}
                        accessibilityLabel="Remover foto"
                      >
                        <Ionicons
                          name="close"
                          size={12}
                          color={theme.mutedForeground}
                        />
                      </Pressable>
                    </View>
                  ))}
                  {photoUris.length < limit ? (
                    <Pressable
                      onPress={() => void pickPhoto()}
                      style={[
                        styles.photoAdd,
                        { borderColor: theme.border },
                      ]}
                    >
                      <Ionicons
                        name="image-outline"
                        size={18}
                        color={theme.mutedForeground}
                      />
                      <ThemedText type="small" themeColor="mutedForeground">
                        {photoUris.length === 0 ? "Fotos" : "Mais"}
                      </ThemedText>
                    </Pressable>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => void pickPhoto()}
                  disabled={photoUris.length >= limit}
                  style={[
                    styles.toggle,
                    { borderColor: theme.border },
                    photoUris.length >= limit ? { opacity: 0.5 } : null,
                  ]}
                >
                  <ThemedText type="smallBold">
                    {photoUris.length === 0
                      ? `Escolher até ${limit} fotos`
                      : photoUris.length < limit
                        ? `Adicionar mais fotos (${photoUris.length}/${limit})`
                        : `Limite de ${limit} fotos`}
                  </ThemedText>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => void pickPhoto()}
                style={[styles.toggle, { borderColor: theme.border }]}
              >
                <ThemedText type="smallBold">
                  {photoUris.length ? "Trocar foto" : "Anexar foto"}
                </ThemedText>
                {photoUris.length ? (
                  <Pressable onPress={() => setPhotoUris([])} hitSlop={8}>
                    <ThemedText type="small" themeColor="mutedForeground">
                      Remover
                    </ThemedText>
                  </Pressable>
                ) : null}
              </Pressable>
            )
          ) : null}

          <View style={styles.preview}>
            {previewUri ? (
              <Image
                source={{ uri: previewUri }}
                style={styles.previewImg}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.previewPlaceholder}>
                <ActivityIndicator color={theme.primary} />
                <ThemedText type="small" themeColor="mutedForeground">
                  Gerando card...
                </ThemedText>
              </View>
            )}
          </View>

          <Button
            label={sharing ? "Compartilhando..." : "Compartilhar"}
            onPress={() => void share()}
            disabled={sharing}
            loading={sharing}
            size="lg"
          />
          <ThemedText type="small" themeColor="mutedForeground" style={styles.hint}>
            O menu do sistema sugere apps de mensagem e redes. O card vai como
            imagem; o texto acompanha se o app aceitar.
          </ThemedText>
        </ScrollView>

        {visible ? (
          <View style={styles.captureHost} pointerEvents="none">
            <View
              ref={cardRef}
              collapsable={false}
              key={`${includeNotes}-${photoUris.join("|")}`}
            >
              {cardNode}
            </View>
          </View>
        ) : null}
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
  },
  headCopy: { flex: 1, gap: 4 },
  body: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  toggle: {
    minHeight: 48,
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  switchCard: {
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  switchCopy: { flex: 1, gap: 2 },
  photosCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  photosHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photoCell: {
    width: "23%",
    aspectRatio: 1,
    borderRadius: Radius.md,
    overflow: "hidden",
    position: "relative",
  },
  photoThumb: { width: "100%", height: "100%" },
  photoRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  photoAdd: {
    width: "23%",
    aspectRatio: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  preview: { alignItems: "center", paddingVertical: 8 },
  previewImg: {
    width: SHARE_PREVIEW_W,
    height: SHARE_PREVIEW_H,
    borderRadius: Radius.xl,
  },
  previewPlaceholder: {
    width: SHARE_PREVIEW_W,
    height: SHARE_PREVIEW_H,
    borderRadius: Radius.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(11,15,26,0.06)",
  },
  hint: { textAlign: "center", paddingHorizontal: 8 },
  captureHost: {
    position: "absolute",
    top: 0,
    left: 0,
    width: SHARE_W,
    height: SHARE_H,
    transform: [{ translateX: -(SHARE_W + 80) }],
    opacity: 1,
  },
});
