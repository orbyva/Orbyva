import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { createClassApi, createTypeApi } from "@/api/finance/dimensions";
import { TypeIcon } from "@/components/TypeIcon";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import {
  listNaturesForCreate,
  listTypesForCreate,
  QUICK_CREATE_TYPE_COLOR,
  QUICK_CREATE_TYPE_ICON,
  resolveNatureForCreate,
  shouldOfferCreateCta,
  type NaturePickOption,
  type TypePickOption,
} from "@/domain/dimensions/classSearchCreate";
import { useTheme } from "@/hooks/use-theme";
import { getErrorMessage } from "@/lib/errors";
import type { Class, Dimension } from "@/types/dimensions";

export const CLASS_SEARCH_SUGGESTION_LIMIT = 12;
const CLASS_SEARCH_RESULT_LIMIT = 20;

type PanelMode = "search" | "create";
type CreateMode = "newType" | "existingType";

export type ClassPickOption = {
  id: number;
  name: string;
  typeId: number;
  typeName: string;
  natureId: number;
  natureName: string;
  hexColor: string | null;
  lucideIcon: string | null;
};

export function flattenClassOptions(
  dimensions: Dimension[],
  natureFilter?: string | null
): ClassPickOption[] {
  const needle = natureFilter?.trim().toLowerCase() || null;
  const out: ClassPickOption[] = [];
  for (const nature of dimensions) {
    if (needle && nature.name.toLowerCase() !== needle) continue;
    for (const type of nature.types) {
      for (const cls of type.classes) {
        out.push({
          id: cls.id,
          name: cls.name,
          typeId: type.id,
          typeName: type.name,
          natureId: nature.id,
          natureName: nature.name,
          hexColor: type.hex_color ?? null,
          lucideIcon: type.lucide_icon ?? null,
        });
      }
    }
  }
  return out.sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
  );
}

function classToPickOption(created: Class): ClassPickOption | null {
  const type = created.type;
  if (!type) return null;
  return {
    id: created.id,
    name: created.name,
    typeId: type.id,
    typeName: type.name,
    natureId: type.nature?.id ?? 0,
    natureName: type.nature?.name ?? "",
    hexColor: type.hex_color ?? null,
    lucideIcon: type.lucide_icon ?? null,
  };
}

function buildSuggestions(
  options: ClassPickOption[],
  frequentIds: number[],
  limit: number
): ClassPickOption[] {
  const byId = new Map(options.map((o) => [o.id, o]));
  const suggested: ClassPickOption[] = [];
  for (const id of frequentIds) {
    const opt = byId.get(id);
    if (!opt) continue;
    suggested.push(opt);
    if (suggested.length >= limit) return suggested;
  }
  if (suggested.length === 0) return options.slice(0, limit);
  return suggested;
}

function sortByUsage(
  options: ClassPickOption[],
  frequentIds: number[]
): ClassPickOption[] {
  const rank = new Map(frequentIds.map((id, index) => [id, index]));
  return [...options].sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra != null && rb != null) return ra - rb;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
  });
}

function hexTint(hex: string | null, fallback: string): string {
  if (!hex || !/^#([0-9a-fA-F]{6})$/.test(hex)) return fallback;
  return `${hex}33`;
}

function ClassOptionRow({
  option,
  onPress,
  fallbackBg,
}: {
  option: ClassPickOption;
  onPress: () => void;
  fallbackBg: string;
}) {
  const color = option.hexColor || "#64748B";
  return (
    <Pressable onPress={onPress} style={styles.option}>
      <View
        style={[styles.iconWrap, { backgroundColor: hexTint(option.hexColor, fallbackBg) }]}
      >
        <TypeIcon name={option.lucideIcon} color={color} size={18} />
      </View>
      <View style={styles.optionCopy}>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {option.typeName} · {option.natureName}
        </ThemedText>
        <ThemedText type="smallBold" numberOfLines={1}>
          {option.name}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export function ClassSearchPicker({
  dimensions,
  value,
  onChange,
  frequentIds = [],
  preferredNatureName = null,
  allowCreate = true,
}: {
  dimensions: Dimension[];
  value: number | null;
  onChange: (option: ClassPickOption | null) => void;
  frequentIds?: number[];
  preferredNatureName?: string | null;
  allowCreate?: boolean;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [extraOptions, setExtraOptions] = useState<ClassPickOption[]>([]);
  const [panel, setPanel] = useState<PanelMode>("search");
  const [createName, setCreateName] = useState("");
  const [createMode, setCreateMode] = useState<CreateMode>("newType");
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [selectedNatureId, setSelectedNatureId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const baseOptions = useMemo(
    () => flattenClassOptions(dimensions, preferredNatureName),
    [dimensions, preferredNatureName]
  );

  const options = useMemo(() => {
    if (extraOptions.length === 0) return baseOptions;
    const byId = new Map(baseOptions.map((o) => [o.id, o]));
    for (const extra of extraOptions) {
      if (!byId.has(extra.id)) byId.set(extra.id, extra);
    }
    return [...byId.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
    );
  }, [baseOptions, extraOptions]);

  const typeOptions = useMemo(
    () => listTypesForCreate(dimensions, preferredNatureName),
    [dimensions, preferredNatureName]
  );

  const natureOptions = useMemo(
    () => listNaturesForCreate(dimensions),
    [dimensions]
  );

  const defaultNature = useMemo(
    () => resolveNatureForCreate(dimensions, preferredNatureName),
    [dimensions, preferredNatureName]
  );

  const selected = options.find((o) => o.id === value) ?? null;

  useEffect(() => {
    if (!open) {
      setQuery("");
      setPanel("search");
      setCreateError(null);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return buildSuggestions(options, frequentIds, CLASS_SEARCH_SUGGESTION_LIMIT);
    }
    const matches = options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.typeName.toLowerCase().includes(q) ||
        o.natureName.toLowerCase().includes(q)
    );
    return sortByUsage(matches, frequentIds).slice(0, CLASS_SEARCH_RESULT_LIMIT);
  }, [options, query, frequentIds]);

  const trimmedQuery = query.trim();
  const showCreateCta = shouldOfferCreateCta(
    trimmedQuery,
    options,
    allowCreate,
    natureOptions.length > 0
  );
  const showFrequentHint =
    panel === "search" &&
    !trimmedQuery &&
    frequentIds.some((id) => options.some((o) => o.id === id));

  function resetCreatePanel(name: string) {
    setCreateName(name);
    setCreateMode("newType");
    setSelectedTypeId(typeOptions[0]?.id ?? null);
    setSelectedNatureId(defaultNature?.id ?? null);
    setCreateError(null);
    setPanel("create");
    setOpen(true);
  }

  function selectCreated(option: ClassPickOption) {
    setExtraOptions((prev) =>
      prev.some((o) => o.id === option.id) ? prev : [...prev, option]
    );
    onChange(option);
    setQuery("");
    setPanel("search");
    setOpen(false);
  }

  async function createUnderExistingType(type: TypePickOption, name: string) {
    const created = await createClassApi({ name, type_id: type.id });
    const option = classToPickOption(created);
    if (!option) throw new Error("Subcategoria criada sem categoria associada.");
    selectCreated(option);
  }

  async function createNewTypeAndClass(nature: NaturePickOption, name: string) {
    const type = await createTypeApi({
      name,
      nature_id: nature.id,
      hex_color: QUICK_CREATE_TYPE_COLOR,
      lucide_icon: QUICK_CREATE_TYPE_ICON,
      exclude_from_spend: nature.name.toLowerCase() === "investimento",
    });
    const created = await createClassApi({ name, type_id: type.id });
    const option = classToPickOption(created) ?? {
      id: created.id,
      name: created.name,
      typeId: type.id,
      typeName: type.name,
      natureId: nature.id,
      natureName: nature.name,
      hexColor: type.hex_color ?? QUICK_CREATE_TYPE_COLOR,
      lucideIcon: type.lucide_icon ?? QUICK_CREATE_TYPE_ICON,
    };
    selectCreated(option);
  }

  async function submitCreate() {
    const name = createName.trim();
    if (!name || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      if (createMode === "existingType") {
        const type = typeOptions.find((t) => t.id === selectedTypeId);
        if (!type) throw new Error("Selecione uma categoria existente.");
        await createUnderExistingType(type, name);
        return;
      }
      const nature =
        natureOptions.find((n) => n.id === selectedNatureId) ?? defaultNature;
      if (!nature) {
        throw new Error("Nenhuma natureza disponível para criar a categoria.");
      }
      await createNewTypeAndClass(nature, name);
    } catch (error) {
      setCreateError(
        getErrorMessage(error, "Não foi possível criar a categoria.")
      );
    } finally {
      setCreating(false);
    }
  }

  const fieldColors = {
    color: theme.text,
    backgroundColor: theme.backgroundElement,
    borderColor: theme.backgroundSelected,
  };

  if (natureOptions.length === 0) {
    return (
      <ThemedText themeColor="textSecondary">
        Cadastre naturezas no web para poder classificar lançamentos.
      </ThemedText>
    );
  }

  if (selected) {
    const color = selected.hexColor || "#64748B";
    return (
      <Pressable
        onPress={() => {
          onChange(null);
          setOpen(true);
        }}
        style={[
          styles.selected,
          {
            borderColor: theme.backgroundSelected,
            backgroundColor: theme.backgroundElement,
          },
        ]}
      >
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: hexTint(selected.hexColor, theme.backgroundSelected) },
          ]}
        >
          <TypeIcon name={selected.lucideIcon} color={color} size={18} />
        </View>
        <View style={styles.optionCopy}>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {selected.typeName} · {selected.natureName}
          </ThemedText>
          <ThemedText type="smallBold" numberOfLines={1}>
            {selected.name}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Trocar
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          styles.searchBtn,
          {
            borderColor: theme.backgroundSelected,
            backgroundColor: theme.backgroundElement,
          },
        ]}
      >
        <ThemedText themeColor="textSecondary">
          Buscar categoria ou subcategoria
        </ThemedText>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (creating) return;
          setOpen(false);
        }}
      >
        <ThemedView style={styles.flex}>
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
          >
            <View style={styles.head}>
              {panel === "create" ? (
                <Pressable
                  disabled={creating}
                  onPress={() => {
                    setPanel("search");
                    setCreateError(null);
                  }}
                  hitSlop={8}
                >
                  <ThemedText type="linkPrimary">Voltar</ThemedText>
                </Pressable>
              ) : (
                <ThemedText type="smallBold">Categoria</ThemedText>
              )}
              <ThemedText type="smallBold">
                {panel === "create" ? "Criar agora" : ""}
              </ThemedText>
              <Pressable
                disabled={creating}
                onPress={() => setOpen(false)}
                hitSlop={8}
              >
                <ThemedText type="linkPrimary">Fechar</ThemedText>
              </Pressable>
            </View>

            {panel === "create" ? (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.list}
              >
                <ThemedText type="small" themeColor="textSecondary">
                  Nome
                </ThemedText>
                <TextInput
                  value={createName}
                  onChangeText={setCreateName}
                  placeholder="Ex: Farmácia"
                  placeholderTextColor={theme.textSecondary}
                  autoFocus
                  editable={!creating}
                  style={[styles.field, fieldColors]}
                  onSubmitEditing={() => void submitCreate()}
                />

                <ThemedText type="small" themeColor="textSecondary">
                  Onde salvar
                </ThemedText>
                {typeOptions.length > 0 ? (
                  <Pressable
                    disabled={creating}
                    onPress={() => {
                      setCreateMode("existingType");
                      if (selectedTypeId == null && typeOptions[0]) {
                        setSelectedTypeId(typeOptions[0].id);
                      }
                    }}
                    style={[
                      styles.choice,
                      {
                        borderColor:
                          createMode === "existingType"
                            ? theme.primary
                            : theme.backgroundSelected,
                        backgroundColor:
                          createMode === "existingType"
                            ? `${theme.primary}22`
                            : theme.backgroundElement,
                      },
                    ]}
                  >
                    <ThemedText>Em categoria existente</ThemedText>
                  </Pressable>
                ) : null}
                <Pressable
                  disabled={creating}
                  onPress={() => setCreateMode("newType")}
                  style={[
                    styles.choice,
                    {
                      borderColor:
                        createMode === "newType"
                          ? theme.primary
                          : theme.backgroundSelected,
                      backgroundColor:
                        createMode === "newType"
                          ? `${theme.primary}22`
                          : theme.backgroundElement,
                    },
                  ]}
                >
                  <ThemedText>Nova categoria (mesmo nome)</ThemedText>
                </Pressable>

                {createMode === "existingType" && typeOptions.length > 0
                  ? typeOptions.map((type) => {
                      const color = type.hexColor || "#64748B";
                      const active = selectedTypeId === type.id;
                      return (
                        <Pressable
                          key={type.id}
                          disabled={creating}
                          onPress={() => {
                            setSelectedTypeId(type.id);
                            setCreateMode("existingType");
                          }}
                          style={[
                            styles.option,
                            styles.choice,
                            {
                              borderColor: active
                                ? theme.primary
                                : theme.backgroundSelected,
                              backgroundColor: active
                                ? `${theme.primary}22`
                                : theme.backgroundElement,
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.iconWrap,
                              {
                                backgroundColor: hexTint(
                                  type.hexColor,
                                  theme.backgroundSelected
                                ),
                              },
                            ]}
                          >
                            <TypeIcon
                              name={type.lucideIcon}
                              color={color}
                              size={16}
                            />
                          </View>
                          <View style={styles.optionCopy}>
                            <ThemedText type="smallBold" numberOfLines={1}>
                              {type.name}
                            </ThemedText>
                            <ThemedText
                              type="small"
                              themeColor="textSecondary"
                              numberOfLines={1}
                            >
                              {type.natureName}
                            </ThemedText>
                          </View>
                        </Pressable>
                      );
                    })
                  : null}

                {createMode === "newType" &&
                !preferredNatureName &&
                natureOptions.length > 1 ? (
                  <View style={styles.natures}>
                    {natureOptions.map((nature) => {
                      const active = selectedNatureId === nature.id;
                      return (
                        <Pressable
                          key={nature.id}
                          disabled={creating}
                          onPress={() => setSelectedNatureId(nature.id)}
                          style={[
                            styles.chip,
                            {
                              borderColor: active
                                ? theme.primary
                                : theme.backgroundSelected,
                              backgroundColor: active
                                ? `${theme.primary}22`
                                : theme.backgroundElement,
                            },
                          ]}
                        >
                          <ThemedText type="small">{nature.name}</ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                {createMode === "newType" && preferredNatureName ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Natureza: {preferredNatureName}
                  </ThemedText>
                ) : null}

                {createError ? (
                  <ThemedText style={styles.error}>{createError}</ThemedText>
                ) : null}

                <Pressable
                  disabled={creating || !createName.trim()}
                  onPress={() => void submitCreate()}
                  style={[
                    styles.primary,
                    {
                      backgroundColor: theme.primary,
                      opacity: creating || !createName.trim() ? 0.6 : 1,
                    },
                  ]}
                >
                  {creating ? (
                    <ActivityIndicator color="#0B0F1A" />
                  ) : (
                    <ThemedText type="smallBold" style={styles.primaryLabel}>
                      Criar e usar
                    </ThemedText>
                  )}
                </Pressable>
              </ScrollView>
            ) : (
              <>
                <TextInput
                  value={query}
                  onChangeText={(next) => {
                    setQuery(next);
                    setPanel("search");
                  }}
                  placeholder="Buscar (ex: Aluguel, Mercado)"
                  placeholderTextColor={theme.textSecondary}
                  autoFocus
                  autoCorrect={false}
                  editable={!creating}
                  style={[styles.search, fieldColors]}
                />
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.list}
                >
                  {showFrequentHint ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      Subcategorias mais usadas
                    </ThemedText>
                  ) : null}
                  {filtered.length === 0 ? (
                    <ThemedText themeColor="textSecondary" style={styles.empty}>
                      {trimmedQuery
                        ? "Nenhuma categoria encontrada."
                        : "Digite para buscar ou crie uma nova."}
                    </ThemedText>
                  ) : (
                    filtered.map((opt) => (
                      <ClassOptionRow
                        key={opt.id}
                        option={opt}
                        fallbackBg={theme.backgroundSelected}
                        onPress={() => {
                          onChange(opt);
                          setOpen(false);
                        }}
                      />
                    ))
                  )}

                  {allowCreate ? (
                    <View
                      style={[
                        styles.createBlock,
                        filtered.length > 0 && {
                          borderTopColor: theme.backgroundSelected,
                          borderTopWidth: StyleSheet.hairlineWidth,
                          paddingTop: Spacing.three,
                          marginTop: Spacing.two,
                        },
                      ]}
                    >
                      {showCreateCta || filtered.length === 0 ? (
                        <ThemedText type="small" themeColor="textSecondary">
                          Não achou a categoria desejada?
                        </ThemedText>
                      ) : null}
                      <Pressable
                        disabled={creating}
                        onPress={() =>
                          resetCreatePanel(trimmedQuery ? trimmedQuery : "")
                        }
                        style={[
                          styles.createBtn,
                          {
                            borderColor: theme.backgroundSelected,
                            backgroundColor: theme.backgroundElement,
                          },
                        ]}
                      >
                        <Ionicons
                          name="add-outline"
                          size={18}
                          color={theme.textSecondary}
                        />
                        <ThemedText type="smallBold" numberOfLines={1} style={styles.createLabel}>
                          {showCreateCta
                            ? `Crie agora “${trimmedQuery}”`
                            : "Crie agora"}
                        </ThemedText>
                      </Pressable>
                    </View>
                  ) : null}
                </ScrollView>
              </>
            )}
          </KeyboardAvoidingView>
        </ThemedView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  field: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  search: {
    marginHorizontal: Spacing.four,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  searchBtn: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  selected: {
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  list: { padding: Spacing.four, gap: Spacing.two, paddingBottom: 48 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  optionCopy: { flex: 1, minWidth: 0, gap: 2 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { paddingVertical: Spacing.four, textAlign: "center" },
  createBlock: { gap: 8 },
  createBtn: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  createLabel: { flex: 1 },
  choice: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: "center",
  },
  natures: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  primary: {
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.two,
  },
  primaryLabel: { color: "#0B0F1A" },
  error: { color: "#E11D48" },
});
