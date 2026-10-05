import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

import {
  createClassApi,
  deleteClassApi,
  deleteTypeApi,
  fetchDimensions,
  updateClassApi,
} from "@/api/finance/dimensions";
import { ClassDragRow } from "@/components/ClassDragRow";
import { ChoiceChip } from "@/components/ChoiceChip";
import { SearchField } from "@/components/SearchField";
import { TypeIcon } from "@/components/TypeIcon";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner, Button, CollapsibleChrome, EmptyState, Input } from "@/components/ui";
import { Radius, Spacing } from "@/constants/theme";
import {
  filterDimensionTree,
  moveClassToType,
  typeIdAtPoint,
  typeIdForClass,
} from "@/domain/dimensions/listView";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { useDropLanding } from "@/lib/dragMotion";
import { getErrorMessage } from "@/lib/errors";
import type { Dimension } from "@/types/dimensions";

type Rect = { x: number; y: number; w: number; h: number };

function TypeDropCard({
  typeId,
  onRegister,
  style,
  children,
}: {
  typeId: number;
  onRegister: (id: number, node: View | null) => void;
  style: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const ref = useRef<View>(null);
  useEffect(() => {
    onRegister(typeId, ref.current);
    return () => onRegister(typeId, null);
  }, [onRegister, typeId]);
  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}

export default function CategoriesScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const router = useRouter();
  const { bottomInset } = useAppShell();
  const [rows, setRows] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoaded = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [natureId, setNatureId] = useState<number | "all">("all");
  const [addingTypeId, setAddingTypeId] = useState<number | null>(null);
  const [editingClassId, setEditingClassId] = useState<number | null>(null);
  const [className, setClassName] = useState("");
  const [savingClass, setSavingClass] = useState(false);
  const [dragging, setDragging] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const typeRects = useRef(new Map<number, Rect>());
  const typeNodes = useRef(new Map<number, View>());
  const rootRef = useRef<View>(null);
  const movingRef = useRef(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const absX = useSharedValue(0);
  const absY = useSharedValue(0);
  const ghostVisible = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const { markLanded, landingKey, landedId } = useDropLanding();

  const ghostStyle = useAnimatedStyle(() => ({
    opacity: ghostVisible.value,
    transform: [
      { translateX: absX.value - originX.value - 16 },
      { translateY: absY.value - originY.value - 20 },
    ],
  }));

  useEffect(() => {
    navigation.setOptions({ title: "Categorias" });
  }, [navigation]);

  const load = useCallback(async () => {
    setError(null);
    setRows(await fetchDimensions());
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoaded.current) setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(
              getErrorMessage(err, "Não foi possível carregar as categorias.")
            );
          }
        })
        .finally(() => {
          if (!cancelled) {
            hasLoaded.current = true;
            setLoading(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível atualizar."));
    } finally {
      setRefreshing(false);
    }
  }

  const filtered = useMemo(
    () => filterDimensionTree(rows, search, natureId),
    [rows, search, natureId]
  );

  const registerTypeNode = useCallback((id: number, node: View | null) => {
    if (node) typeNodes.current.set(id, node);
    else typeNodes.current.delete(id);
  }, []);

  function measureRoot() {
    rootRef.current?.measureInWindow((x, y) => {
      originX.value = x;
      originY.value = y;
    });
  }

  const onDragStart = useCallback(
    (id: number) => {
      movingRef.current = true;
      const from = rowsRef.current
        .flatMap((n) => n.types)
        .flatMap((t) => t.classes);
      const cls = from.find((c) => c.id === id);
      setDragging({ id, name: cls?.name ?? "Subcategoria" });
      setNotice(null);
      setError(null);
      measureRoot();
    },
    [originX, originY]
  );

  const onDragEnd = useCallback((id: number, x: number, y: number) => {
    movingRef.current = false;
    setDragging(null);
    const entries = [...typeNodes.current.entries()];
    if (entries.length === 0) return;

    let pending = entries.length;
    const rects = new Map<number, Rect>();
    const finish = () => {
      const targetId = typeIdAtPoint(rects, x, y);
      const fromId = typeIdForClass(rowsRef.current, id);
      if (targetId == null || fromId == null || fromId === targetId) return;
      const snapshot = rowsRef.current;
      markLanded(String(id));
      setRows(moveClassToType(snapshot, id, targetId));
      void updateClassApi({ id, type_id: targetId })
        .then(() => setNotice("Subcategoria movida."))
        .catch((err) => {
          setRows(snapshot);
          setError(
            getErrorMessage(err, "Não foi possível mover a subcategoria.")
          );
        });
    };

    for (const [typeId, node] of entries) {
      node.measureInWindow((mx, my, w, h) => {
        rects.set(typeId, { x: mx, y: my, w, h });
        typeRects.current.set(typeId, { x: mx, y: my, w, h });
        pending -= 1;
        if (pending === 0) finish();
      });
    }
  }, [markLanded]);

  async function addClass(typeId: number) {
    const name = className.trim();
    if (!name) {
      setError("Informe o nome da subcategoria.");
      return;
    }
    setSavingClass(true);
    setError(null);
    try {
      await createClassApi({ name, type_id: typeId });
      setClassName("");
      setAddingTypeId(null);
      setNotice(`Subcategoria "${name}" criada.`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível criar a subcategoria."));
    } finally {
      setSavingClass(false);
    }
  }

  async function renameClass(classId: number) {
    const name = className.trim();
    if (!name) {
      setError("Informe o nome da subcategoria.");
      return;
    }
    setSavingClass(true);
    setError(null);
    try {
      await updateClassApi({ id: classId, name });
      setClassName("");
      setEditingClassId(null);
      setNotice("Subcategoria atualizada.");
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível renomear a subcategoria."));
    } finally {
      setSavingClass(false);
    }
  }

  function confirmDeleteType(typeId: number, name: string) {
    Alert.alert(
      "Excluir categoria?",
      `${name}. Só funciona se não houver subcategorias.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await deleteTypeApi(typeId);
                setNotice("Categoria excluída.");
                await load();
              } catch (err) {
                setError(getErrorMessage(err, "Não foi possível excluir."));
              }
            })();
          },
        },
      ]
    );
  }

  function confirmDeleteClass(classId: number, name: string) {
    Alert.alert(
      "Excluir subcategoria?",
      `${name}. Só funciona se não houver lançamentos, recorrências ou tetos ligados a ela.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await deleteClassApi(classId);
                setNotice("Subcategoria excluída.");
                await load();
              } catch (err) {
                setError(getErrorMessage(err, "Não foi possível excluir."));
              }
            })();
          },
        },
      ]
    );
  }

  function onClassMenu(id: number, name: string) {
    Alert.alert(name, undefined, [
      {
        text: "Renomear",
        onPress: () => {
          setAddingTypeId(null);
          setEditingClassId(id);
          setClassName(name);
        },
      },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => confirmDeleteClass(id, name),
      },
      { text: "Cancelar", style: "cancel" },
    ]);
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
    <ThemedView style={styles.flex}>
      <View
        ref={rootRef}
        style={styles.flex}
        collapsable={false}
        onLayout={measureRoot}
      >
        <CollapsibleChrome
          label="Filtros"
          hint={
            natureId === "all"
              ? "Todas as naturezas"
              : (rows.find((nature) => nature.id === natureId)?.name ??
                "Filtro")
          }
          footer={
            <>
              <Banner message={error} />
              {notice ? (
                <ThemedText type="small" themeColor="mutedForeground">
                  {notice}
                </ThemedText>
              ) : null}
            </>
          }
        >
          <ThemedText type="small" themeColor="mutedForeground">
            Segure o punho da subcategoria e solte em outra categoria para
            reassociar.
          </ThemedText>
          <SearchField
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar categoria ou subcategoria"
          />
          <View style={styles.chips}>
            <ChoiceChip
              label="Todas"
              active={natureId === "all"}
              onPress={() => setNatureId("all")}
            />
            {rows.map((nature) => (
              <ChoiceChip
                key={nature.id}
                label={nature.name}
                active={natureId === nature.id}
                onPress={() => setNatureId(nature.id)}
              />
            ))}
          </View>
        </CollapsibleChrome>

        {loading && rows.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.list,
              { paddingBottom: bottomInset + 24 },
            ]}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void onRefresh()}
              />
            }
          >
            {filtered.length === 0 ? (
              <EmptyState
                icon="pricetags-outline"
                title="Nenhuma categoria neste recorte"
                description="Use o + para criar."
              />
            ) : (
              filtered.map((nature) => (
                <View key={nature.id} style={styles.nature}>
                  <ThemedText type="small" themeColor="mutedForeground">
                    {nature.name}
                  </ThemedText>
                  {nature.types.length === 0 ? (
                    <ThemedText type="small" themeColor="mutedForeground">
                      Sem categorias nesta natureza.
                    </ThemedText>
                  ) : (
                    nature.types.map((type) => {
                      const color = type.hex_color || theme.mutedForeground;
                      const adding = addingTypeId === type.id;
                      return (
                        <TypeDropCard
                          key={type.id}
                          typeId={type.id}
                          onRegister={registerTypeNode}
                          style={[
                            styles.card,
                            {
                              backgroundColor: theme.muted,
                              borderColor: theme.border,
                            },
                          ]}
                        >
                          <View style={styles.typeHead}>
                            <View
                              style={[
                                styles.iconWrap,
                                { backgroundColor: `${color}22` },
                              ]}
                            >
                              <TypeIcon
                                name={type.lucide_icon}
                                color={color}
                                size={18}
                              />
                            </View>
                            <ThemedText type="smallBold" style={styles.typeName}>
                              {type.name}
                            </ThemedText>
                            <Pressable
                              hitSlop={8}
                              onPress={() =>
                                router.push({
                                  pathname: "/finance/category-form",
                                  params: { id: String(type.id) },
                                })
                              }
                            >
                              <Ionicons
                                name="create-outline"
                                size={18}
                                color={theme.mutedForeground}
                              />
                            </Pressable>
                            <Pressable
                              hitSlop={8}
                              onPress={() =>
                                confirmDeleteType(type.id, type.name)
                              }
                            >
                              <Ionicons
                                name="trash-outline"
                                size={18}
                                color={theme.mutedForeground}
                              />
                            </Pressable>
                          </View>
                          {type.classes.map((cls) =>
                            editingClassId === cls.id ? (
                              <View key={cls.id} style={styles.addRow}>
                                <Input
                                  autoFocus
                                  value={className}
                                  onChangeText={setClassName}
                                  placeholder="Nome da subcategoria"
                                />
                                <Button
                                  label="Salvar"
                                  loading={savingClass}
                                  onPress={() => void renameClass(cls.id)}
                                  size="sm"
                                />
                                <Pressable
                                  onPress={() => {
                                    setEditingClassId(null);
                                    setClassName("");
                                  }}
                                >
                                  <ThemedText type="linkPrimary">
                                    Cancelar
                                  </ThemedText>
                                </Pressable>
                              </View>
                            ) : (
                              <ClassDragRow
                                key={landingKey(String(cls.id))}
                                id={cls.id}
                                name={cls.name}
                                dragging={dragging?.id === cls.id}
                                landed={landedId === String(cls.id)}
                                absX={absX}
                                absY={absY}
                                ghostVisible={ghostVisible}
                                onDragStart={onDragStart}
                                onDragEnd={onDragEnd}
                                onMenu={(id) => onClassMenu(id, cls.name)}
                              />
                            )
                          )}
                          {adding ? (
                            <View style={styles.addRow}>
                              <Input
                                autoFocus
                                value={className}
                                onChangeText={setClassName}
                                placeholder="Nome da subcategoria"
                                onSubmitEditing={() => void addClass(type.id)}
                              />
                              <Button
                                label="Salvar"
                                loading={savingClass}
                                onPress={() => void addClass(type.id)}
                                size="sm"
                              />
                              <Pressable
                                onPress={() => {
                                  setAddingTypeId(null);
                                  setClassName("");
                                }}
                              >
                                <ThemedText type="linkPrimary">
                                  Cancelar
                                </ThemedText>
                              </Pressable>
                            </View>
                          ) : (
                            <Pressable
                              onPress={() => {
                                setAddingTypeId(type.id);
                                setClassName("");
                                setNotice(null);
                                setError(null);
                              }}
                            >
                              <ThemedText type="linkPrimary">
                                Adicionar subcategoria
                              </ThemedText>
                            </Pressable>
                          )}
                        </TypeDropCard>
                      );
                    })
                  )}
                </View>
              ))
            )}
          </ScrollView>
        )}

        <Animated.View
          pointerEvents="none"
          style={[
            styles.ghost,
            {
              backgroundColor: theme.background,
              borderColor: theme.primary,
              shadowColor: theme.foreground,
            },
            ghostStyle,
          ]}
        >
          <ThemedText type="smallBold">
            {dragging?.name ?? "Subcategoria"}
          </ThemedText>
        </Animated.View>
      </View>
    </ThemedView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  list: { padding: Spacing.four, gap: Spacing.four },
  nature: { gap: Spacing.two },
  card: {
    borderWidth: 2,
    borderRadius: Radius.xl,
    padding: 14,
    gap: 8,
  },
  typeHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  typeName: { flex: 1 },
  addRow: { gap: 8 },
  ghost: {
    position: "absolute",
    left: 0,
    top: 0,
    zIndex: 80,
    minWidth: 140,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
