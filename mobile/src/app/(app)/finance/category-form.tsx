import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { createTypeApi, fetchDimensions, updateTypeApi } from "@/api/finance/dimensions";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Spacing } from "@/constants/theme";
import {
  QUICK_CREATE_TYPE_ICON,
  resolveNatureForCreate,
} from "@/domain/dimensions/classSearchCreate";
import {
  CATEGORY_COLORS,
  normalizeHexColor,
} from "@/domain/dimensions/listView";
import { useTheme } from "@/hooks/use-theme";
import { getErrorMessage } from "@/lib/errors";
import type { Dimension } from "@/types/dimensions";

export default function CategoryFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ id?: string }>();
  const editIdRaw = Number(Array.isArray(params.id) ? params.id[0] : params.id);
  const editId = Number.isFinite(editIdRaw) && editIdRaw > 0 ? editIdRaw : null;
  const isEditing = editId != null;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [name, setName] = useState("");
  const [natureId, setNatureId] = useState<number | null>(null);
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0]);

  const load = useCallback(async () => {
    const dims = await fetchDimensions();
    setDimensions(dims);
    if (isEditing && editId != null) {
      const found = dims
        .flatMap((nature) =>
          nature.types.map((type) => ({ nature, type }))
        )
        .find((item) => item.type.id === editId);
      if (!found) throw new Error("Categoria não encontrada.");
      setName(found.type.name);
      setNatureId(found.nature.id);
      setColor(found.type.hex_color || CATEGORY_COLORS[0]);
      return;
    }
    setNatureId((current) => {
      if (current != null && dims.some((n) => n.id === current)) return current;
      return resolveNatureForCreate(dims)?.id ?? null;
    });
  }, [editId, isEditing]);

  useEffect(() => {
    navigation.setOptions({
      title: isEditing ? "Editar categoria" : "Nova categoria",
    });
  }, [isEditing, navigation]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void load()
      .catch((err) => {
        if (!cancelled) {
          setError(
            getErrorMessage(err, "Não foi possível carregar as naturezas.")
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function onSave() {
    const trimmed = name.trim();
    const hex = normalizeHexColor(color);
    if (!trimmed) {
      setError("Informe o nome da categoria.");
      return;
    }
    if (natureId == null) {
      setError("Escolha a natureza (receita, despesa ou investimento).");
      return;
    }
    if (!hex) {
      setError("Escolha uma cor válida.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEditing && editId != null) {
        await updateTypeApi({
          id: editId,
          name: trimmed,
          nature_id: natureId,
          hex_color: hex,
        });
      } else {
        await createTypeApi({
          name: trimmed,
          nature_id: natureId,
          hex_color: hex,
          lucide_icon: QUICK_CREATE_TYPE_ICON,
        });
      }
      router.back();
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          isEditing
            ? "Não foi possível salvar a categoria."
            : "Não foi possível criar a categoria."
        )
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Banner message={error} />

          <Field label="Nome" required>
            <TextInput
              autoFocus
              value={name}
              onChangeText={setName}
              placeholder="Ex: Alimentação"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                {
                  color: theme.text,
                  borderColor: theme.backgroundSelected,
                  backgroundColor: theme.backgroundElement,
                },
              ]}
            />
          </Field>

          <Field label="Natureza" required>
            <View style={styles.chipRow}>
              {dimensions.map((nature) => {
                const active = nature.id === natureId;
                return (
                  <Pressable
                    key={nature.id}
                    onPress={() => setNatureId(nature.id)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active
                          ? theme.primary
                          : theme.backgroundElement,
                      },
                    ]}
                  >
                    <ThemedText
                      type="smallBold"
                      style={active ? styles.chipOn : undefined}
                    >
                      {nature.name}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field label="Cor" required>
            <View style={styles.swatches}>
              {CATEGORY_COLORS.map((hex) => {
                const active = color.toLowerCase() === hex.toLowerCase();
                return (
                  <Pressable
                    key={hex}
                    accessibilityLabel={`Cor ${hex}`}
                    onPress={() => setColor(hex)}
                    style={[
                      styles.swatch,
                      { backgroundColor: hex },
                      active && styles.swatchOn,
                    ]}
                  />
                );
              })}
            </View>
          </Field>

          <Pressable
            disabled={saving}
            onPress={() => void onSave()}
            style={[styles.primary, { backgroundColor: theme.primary }]}
          >
            {saving ? (
              <ActivityIndicator color="#0B0F1A" />
            ) : (
              <ThemedText type="smallBold" style={styles.primaryLabel}>
                Salvar categoria
              </ThemedText>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
        {required ? " *" : ""}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 48 },
  field: { gap: 8 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipOn: { color: "#0B0F1A" },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  swatchOn: {
    borderWidth: 3,
    borderColor: "#0B0F1A",
  },
  primary: {
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.two,
  },
  primaryLabel: { color: "#0B0F1A" },
  error: { color: "#E11D48", textAlign: "center" },
});
