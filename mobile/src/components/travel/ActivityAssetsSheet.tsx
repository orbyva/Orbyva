import Ionicons from "@expo/vector-icons/Ionicons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import {
  addActivityLinkAsset,
  deleteActivityAsset,
  fetchAssetsForActivity,
  renameActivityAsset,
  signedAssetUrl,
  uploadActivityFileAsset,
} from "@/api/travel/activityAssets";
import { ThemedText } from "@/components/themed-text";
import { Button, Input, Sheet } from "@/components/ui";
import { Radius } from "@/constants/theme";
import {
  ASSET_URL_REJECTION_MESSAGES,
  assetDisplayLabel,
  formatAssetSize,
  normalizeAssetUrl,
} from "@/domain/travel/activityAssets";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { openExternalUrl } from "@/lib/url";
import type { TripActivityAsset } from "@/types/travel";

export function ActivityAssetsSheet({
  tripId,
  activity,
  onClose,
  onChanged,
}: {
  tripId: string;
  activity: { id: string; title: string } | null;
  onClose: () => void;
  onChanged: (activityId: string, assets: TripActivityAsset[]) => void;
}) {
  const theme = useTheme();
  const { fail, ok } = useFeedback();
  const [assets, setAssets] = useState<TripActivityAsset[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);
  const activityId = activity?.id ?? null;

  useEffect(() => {
    if (!activityId) return;
    let cancelled = false;
    setAssets([]);
    setLinkUrl("");
    setLinkLabel("");
    setLinkError(null);
    setRenamingId(null);
    void fetchAssetsForActivity(activityId)
      .then((rows) => {
        if (!cancelled) setAssets(rows);
      })
      .catch((err) => {
        if (!cancelled) fail(getErrorMessage(err, "Não foi possível carregar os anexos."));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recarrega só ao trocar de atividade
  }, [activityId]);

  function commit(next: TripActivityAsset[]) {
    setAssets(next);
    if (activityId) onChanged(activityId, next);
  }

  async function run(action: () => Promise<void>, errorMessage: string) {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      fail(getErrorMessage(err, errorMessage));
    } finally {
      setBusy(false);
    }
  }

  async function open(asset: TripActivityAsset) {
    try {
      await openExternalUrl(await signedAssetUrl(asset));
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível abrir o anexo."));
    }
  }

  async function addLink() {
    if (!activityId) return;
    const result = normalizeAssetUrl(linkUrl);
    if (!result.ok) {
      setLinkError(ASSET_URL_REJECTION_MESSAGES[result.reason]);
      return;
    }
    setLinkError(null);
    await run(async () => {
      const created = await addActivityLinkAsset({
        tripId,
        activityId,
        url: result.url,
        label: linkLabel,
        existing: assets,
      });
      commit([...assets, created]);
      setLinkUrl("");
      setLinkLabel("");
      ok("Link anexado");
    }, "Não foi possível anexar o link.");
  }

  async function addPhoto() {
    if (!activityId) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      fail("Permita o acesso às fotos para anexar.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (picked.canceled || !picked.assets[0]) return;
    const photo = picked.assets[0];
    await run(async () => {
      const created = await uploadActivityFileAsset({
        tripId,
        activityId,
        file: {
          uri: photo.uri,
          name: photo.fileName ?? `foto-${Date.now()}.jpg`,
          mimeType: photo.mimeType ?? "image/jpeg",
          size: photo.fileSize ?? null,
        },
        existing: assets,
      });
      commit([...assets, created]);
      ok("Foto anexada");
    }, "Não foi possível subir a foto.");
  }

  async function addDocument() {
    if (!activityId) return;
    const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (picked.canceled || !picked.assets[0]) return;
    const doc = picked.assets[0];
    await run(async () => {
      const created = await uploadActivityFileAsset({
        tripId,
        activityId,
        file: {
          uri: doc.uri,
          name: doc.name,
          mimeType: doc.mimeType ?? null,
          size: doc.size ?? null,
        },
        existing: assets,
      });
      commit([...assets, created]);
      ok("Arquivo anexado");
    }, "Não foi possível subir o arquivo.");
  }

  async function saveRename(asset: TripActivityAsset) {
    await run(async () => {
      await renameActivityAsset(asset.id, renameValue);
      const label = renameValue.trim() || null;
      commit(assets.map((row) => (row.id === asset.id ? { ...row, label } : row)));
      setRenamingId(null);
    }, "Não foi possível renomear.");
  }

  function confirmDelete(asset: TripActivityAsset) {
    Alert.alert(
      "Excluir anexo",
      asset.kind === "file"
        ? `“${assetDisplayLabel(asset)}” e o arquivo serão apagados.`
        : `Remover o link “${assetDisplayLabel(asset)}”?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () => {
            void run(async () => {
              await deleteActivityAsset(asset);
              commit(assets.filter((row) => row.id !== asset.id));
            }, "Não foi possível excluir o anexo.");
          },
        },
      ]
    );
  }

  return (
    <Sheet visible={Boolean(activity)} onClose={onClose} title={activity ? `Anexos · ${activity.title}` : ""}>
      {assets.length === 0 ? (
        <ThemedText type="small" themeColor="mutedForeground">
          Nada anexado ainda. Guarde aqui cartão de embarque, reserva, ingresso ou o link do site.
        </ThemedText>
      ) : (
        assets.map((asset) => (
          <View key={asset.id} style={[styles.row, { backgroundColor: theme.muted }]}>
            <View style={styles.head}>
              <Ionicons
                name={asset.kind === "link" ? "link-outline" : "document-attach-outline"}
                size={18}
                color={theme.mutedForeground}
              />
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Abrir ${assetDisplayLabel(asset)}`}
                style={styles.copy}
                onPress={() => void open(asset)}
              >
                <ThemedText type="smallBold" numberOfLines={1}>
                  {assetDisplayLabel(asset)}
                </ThemedText>
                {formatAssetSize(asset.size_bytes) ? (
                  <ThemedText type="small" themeColor="mutedForeground">
                    {formatAssetSize(asset.size_bytes)}
                  </ThemedText>
                ) : null}
              </Pressable>
              <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Renomear anexo"
                    hitSlop={8}
                    onPress={() => {
                      setRenamingId(asset.id);
                      setRenameValue(asset.label ?? "");
                    }}
                  >
                    <Ionicons name="create-outline" size={18} color={theme.mutedForeground} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Excluir anexo"
                    hitSlop={8}
                    disabled={busy}
                    onPress={() => confirmDelete(asset)}
                  >
                    <Ionicons name="trash-outline" size={18} color={theme.destructive} />
                  </Pressable>
                </>
            </View>
            {renamingId === asset.id ? (
              <View style={styles.inline}>
                <Input
                  autoFocus
                  placeholder="Nome do anexo"
                  value={renameValue}
                  onChangeText={setRenameValue}
                  style={styles.flex}
                />
                <Button label="Salvar" size="sm" disabled={busy} onPress={() => void saveRename(asset)} />
                <Button label="Cancelar" size="sm" variant="ghost" onPress={() => setRenamingId(null)} />
              </View>
            ) : null}
          </View>
        ))
      )}
      <>
          <ThemedText type="smallBold">Adicionar link</ThemedText>
          <Input
            autoCapitalize="none"
            keyboardType="url"
            placeholder="https://… ou site.com"
            value={linkUrl}
            onChangeText={(value) => {
              setLinkUrl(value);
              if (linkError) setLinkError(null);
            }}
          />
          {linkError ? (
            <ThemedText type="small" themeColor="destructive">
              {linkError}
            </ThemedText>
          ) : null}
          <Input placeholder="Nome (opcional)" value={linkLabel} onChangeText={setLinkLabel} />
          <Button
            label="Anexar link"
            leftIcon="link-outline"
            variant="outline"
            disabled={busy}
            onPress={() => void addLink()}
          />
          <Button
            label="Anexar foto da galeria"
            leftIcon="image-outline"
            variant="outline"
            disabled={busy}
            loading={busy}
            onPress={() => void addPhoto()}
          />
          <Button
            label="Anexar arquivo (PDF, documento…)"
            leftIcon="document-attach-outline"
            variant="outline"
            disabled={busy}
            onPress={() => void addDocument()}
          />
        </>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { borderRadius: Radius.lg, padding: 10, gap: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  copy: { flex: 1, gap: 2 },
  inline: { flexDirection: "row", alignItems: "center", gap: 6 },
});
