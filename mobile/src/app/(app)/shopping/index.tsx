import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import {
  createTaskFromShoppingItemApi,
  fetchShoppingCategories,
  fetchShoppingItems,
  fetchTaskLinksForItems,
  setShoppingItemStatusApi,
} from "@/api/shopping/items";
import { fetchProjects } from "@/api/tasks/projects";
import { ChipBar } from "@/components/ChipBar";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Card } from "@/components/ui/Card";
import { Spacing } from "@/constants/theme";
import {
  filterShoppingByProject,
  formatShoppingQty,
  groupShoppingItems,
  SHOPPING_PROJECT_ALL,
  SHOPPING_PROJECT_NONE,
} from "@/domain/shopping/listView";
import { visibleProjects } from "@/domain/tasks/listView";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { getErrorMessage } from "@/lib/errors";
import type { ShoppingCategory, ShoppingItem } from "@/types/shopping";
import type { Project } from "@/types/tasks";

export default function ShoppingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { bottomInset } = useAppShell();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [categories, setCategories] = useState<ShoppingCategory[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [taskLinks, setTaskLinks] = useState<Map<string, string>>(new Map());
  const [projectFilter, setProjectFilter] = useState(SHOPPING_PROJECT_ALL);
  const [loading, setLoading] = useState(true);
  const hasLoaded = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [nextItems, nextCategories, nextProjects] = await Promise.all([
      fetchShoppingItems(),
      fetchShoppingCategories(),
      fetchProjects(),
    ]);
    setItems(nextItems);
    setCategories(nextCategories);
    setProjects(nextProjects);
    setTaskLinks(await fetchTaskLinksForItems(nextItems.map((item) => item.id)));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoaded.current) setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(
              getErrorMessage(err, "Não foi possível carregar a lista.")
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

  async function onToggle(item: ShoppingItem) {
    const next = item.status === "pending" ? "purchased" : "pending";
    setBusyId(item.id);
    setError(null);
    const previous = items;
    setItems((cur) =>
      cur.map((row) => (row.id === item.id ? { ...row, status: next } : row))
    );
    try {
      await setShoppingItemStatusApi(item.id, next);
    } catch (err) {
      setItems(previous);
      setError(getErrorMessage(err, "Não foi possível atualizar o item."));
    } finally {
      setBusyId(null);
    }
  }

  async function onConvert(item: ShoppingItem) {
    if (taskLinks.has(item.id)) return;
    setBusyId(item.id);
    setError(null);
    try {
      const category =
        categories.find((row) => row.id === item.shopping_category_id) ?? null;
      const created = await createTaskFromShoppingItemApi(item, category);
      setTaskLinks((cur) => new Map(cur).set(item.id, created.id));
    } catch (err) {
      setError(
        getErrorMessage(err, "Não foi possível criar a tarefa deste item.")
      );
    } finally {
      setBusyId(null);
    }
  }

  const projectChips = useMemo(
    () => [
      { id: SHOPPING_PROJECT_ALL, label: "Todos" },
      { id: SHOPPING_PROJECT_NONE, label: "Sem projeto" },
      ...visibleProjects(projects).map((project) => ({
        id: project.id,
        label: project.name,
      })),
    ],
    [projects]
  );
  const scoped = useMemo(
    () => filterShoppingByProject(items, categories, projectFilter),
    [categories, items, projectFilter]
  );
  const groups = useMemo(
    () => groupShoppingItems(scoped.items, scoped.categories),
    [scoped]
  );

  return (
    <ThemedView style={styles.flex}>
      <Banner message={error} style={styles.banner} />
      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.list,
            { paddingBottom: bottomInset + 24 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
            />
          }
        >
          {projectChips.length > 2 ? (
            <ChipBar
              options={projectChips}
              value={projectFilter}
              onChange={setProjectFilter}
            />
          ) : null}
          {groups.length === 0 ? (
            <View style={styles.empty}>
              <ThemedText type="smallBold">Lista vazia</ThemedText>
              <ThemedText themeColor="textSecondary">
                Use o + para adicionar um item. O check no app reflete no web.
              </ThemedText>
            </View>
          ) : (
            groups.map((group) => (
              <View key={group.key} style={styles.section}>
                <Pressable
                  onPress={() => {
                    if (group.key === "uncategorized") return;
                    router.push({
                      pathname: "/shopping/category-form",
                      params: { id: group.key },
                    });
                  }}
                  style={styles.sectionHead}
                >
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: group.color || theme.textSecondary },
                    ]}
                  />
                  <ThemedText type="small" themeColor="textSecondary">
                    {group.label}
                    {group.key === "uncategorized" ? "" : " · editar"}
                  </ThemedText>
                </Pressable>
                <Card>
                  {group.items.map((item, index) => {
                    const purchased = item.status === "purchased";
                    const qty = formatShoppingQty(item);
                    const linked = taskLinks.has(item.id);
                    return (
                      <View
                        key={item.id}
                        style={[
                          styles.row,
                          index > 0 && {
                            borderTopWidth: StyleSheet.hairlineWidth,
                            borderTopColor: theme.backgroundSelected,
                          },
                          { opacity: busyId === item.id ? 0.5 : 1 },
                        ]}
                      >
                        <Pressable
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: purchased }}
                          disabled={busyId === item.id}
                          onPress={() => void onToggle(item)}
                          style={[
                            styles.check,
                            {
                              borderColor: purchased
                                ? theme.primary
                                : theme.textSecondary,
                              backgroundColor: purchased
                                ? theme.primary
                                : "transparent",
                            },
                          ]}
                        />
                        <Pressable
                          onPress={() =>
                            router.push({
                              pathname: "/shopping/form",
                              params: { id: item.id },
                            })
                          }
                          style={styles.copy}
                        >
                          <ThemedText
                            style={purchased ? styles.purchased : undefined}
                            numberOfLines={2}
                          >
                            {item.title}
                          </ThemedText>
                          {qty ? (
                            <ThemedText
                              type="small"
                              themeColor="textSecondary"
                            >
                              {qty}
                            </ThemedText>
                          ) : null}
                        </Pressable>
                        {linked ? (
                          <ThemedText type="small" themeColor="textSecondary">
                            Tarefa
                          </ThemedText>
                        ) : (
                          <Pressable
                            disabled={busyId === item.id}
                            onPress={() =>
                              Alert.alert(
                                "Criar tarefa",
                                `Criar “Comprar ${item.title}”?`,
                                [
                                  { text: "Cancelar", style: "cancel" },
                                  {
                                    text: "Criar",
                                    onPress: () => void onConvert(item),
                                  },
                                ]
                              )
                            }
                          >
                            <ThemedText type="small" themeColor="textSecondary">
                              Criar
                            </ThemedText>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </Card>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.four,
  },
  section: { gap: Spacing.two },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
  },
  copy: { flex: 1, gap: 2 },
  purchased: { textDecorationLine: "line-through", opacity: 0.55 },
  empty: { gap: Spacing.one, paddingVertical: Spacing.four },
  banner: {
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
});
