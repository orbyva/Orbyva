import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Svg, { Line, Polygon, Polyline } from "react-native-svg";

import { createDependency, deleteDependency } from "@/api/tasks/dependencies";
import { StringSelectModal } from "@/components/StringSelectModal";
import { ThemedText } from "@/components/themed-text";
import { Button, EmptyState, Sheet } from "@/components/ui";
import { Radius } from "@/constants/theme";
import {
  buildGanttRows,
  dependencyCandidates,
  layoutGantt,
  type GanttRow,
} from "@/domain/tasks/gantt";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { formatDateBR } from "@/lib/currency";
import { formatLocalIsoDate } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import type { Task, TaskDependency } from "@/types/tasks";

const DAY_WIDTH = 32;
const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 40;
const NAME_WIDTH = 132;
const BAR_HEIGHT = 18;
const MILESTONE_SIZE = 14;
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function TasksGantt({
  tasks,
  dependencies,
  onDependenciesChange,
  onOpenTask,
}: {
  tasks: Task[];
  dependencies: TaskDependency[];
  onDependenciesChange: () => void | Promise<void>;
  onOpenTask: (taskId: string) => void;
}) {
  const theme = useTheme();
  const { fail, ok } = useFeedback();
  const scrollRef = useRef<ScrollView>(null);
  const didScroll = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const todayIso = formatLocalIsoDate(new Date());
  const rows = useMemo(() => buildGanttRows(tasks, todayIso), [tasks, todayIso]);
  const layout = useMemo(
    () => layoutGantt(rows, dependencies, { todayIso, dayWidth: DAY_WIDTH, rowHeight: ROW_HEIGHT }),
    [rows, dependencies, todayIso]
  );
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const selected = selectedId ? tasksById.get(selectedId) : undefined;
  const selectedRow = selectedId ? rows.find((row) => row.id === selectedId) : undefined;
  const dependsOn = selectedId
    ? dependencies.filter((dep) => dep.task_id === selectedId)
    : [];
  const blocks = selectedId
    ? dependencies.filter((dep) => dep.depends_on_task_id === selectedId)
    : [];
  const candidates = selectedId
    ? dependencyCandidates(tasks, dependencies, selectedId).map((task) => ({
        id: task.id,
        label: task.title,
      }))
    : [];

  async function addDependency(dependsOnId: string) {
    if (!selectedId) return;
    setPickerOpen(false);
    setBusy(true);
    try {
      await createDependency(selectedId, dependsOnId);
      await onDependenciesChange();
      ok("Dependência adicionada");
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível adicionar a dependência."));
    } finally {
      setBusy(false);
    }
  }

  function removeDependency(dep: TaskDependency) {
    const title = tasksById.get(dep.depends_on_task_id)?.title ?? "tarefa";
    Alert.alert("Remover dependência", `Deixar de depender de “${title}”?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              await deleteDependency(dep.task_id, dep.depends_on_task_id);
              await onDependenciesChange();
            } catch (err) {
              fail(getErrorMessage(err, "Não foi possível remover a dependência."));
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  }

  if (rows.length === 0) {
    return <EmptyState icon="git-network-outline" title="Nenhuma tarefa para o Gantt" />;
  }

  function renderBar(row: GanttRow, index: number) {
    const bar = layout.bars[index];
    const fill = row.done ? theme.mutedForeground : theme.primary;
    if (bar.kind === "milestone") {
      return (
        <Pressable
          key={bar.id}
          accessibilityRole="button"
          accessibilityLabel={`Marco ${row.title}`}
          hitSlop={10}
          onPress={() => setSelectedId(bar.id)}
          style={[
            styles.milestone,
            {
              left: bar.x - MILESTONE_SIZE / 2,
              top: bar.y + (ROW_HEIGHT - MILESTONE_SIZE) / 2,
              backgroundColor: fill,
              opacity: row.hasPlannedDate ? 1 : 0.5,
            },
          ]}
        />
      );
    }
    return (
      <Pressable
        key={bar.id}
        accessibilityRole="button"
        accessibilityLabel={`${row.title}, ${formatDateBR(row.start)} a ${formatDateBR(row.end)}`}
        onPress={() => setSelectedId(bar.id)}
        style={[
          styles.bar,
          {
            left: bar.x + 2,
            width: Math.max(bar.width - 4, 6),
            top: bar.y + (ROW_HEIGHT - BAR_HEIGHT) / 2,
            opacity: row.done ? 0.55 : 1,
          },
          row.hasPlannedDate
            ? { backgroundColor: fill }
            : { borderColor: fill, borderWidth: 1, borderStyle: "dashed", backgroundColor: theme.muted },
          selectedId === row.id && { borderColor: theme.foreground, borderWidth: 2 },
        ]}
      />
    );
  }

  return (
    <View style={[styles.wrap, { borderColor: theme.border }]}>
      <View style={[styles.names, { borderColor: theme.border }]}>
        <View style={{ height: HEADER_HEIGHT }} />
        {rows.map((row) => (
          <Pressable
            key={row.id}
            onPress={() => setSelectedId(row.id)}
            style={[styles.nameCell, { paddingLeft: row.depth ? 16 : 6 }]}
          >
            {row.kind === "milestone" ? (
              <Ionicons name="diamond-outline" size={11} color={theme.mutedForeground} />
            ) : null}
            <ThemedText
              type="small"
              numberOfLines={1}
              style={styles.flex}
              themeColor={row.done ? "mutedForeground" : undefined}
            >
              {row.title}
            </ThemedText>
          </Pressable>
        ))}
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator
        onContentSizeChange={() => {
          if (didScroll.current || layout.todayX == null) return;
          didScroll.current = true;
          scrollRef.current?.scrollTo({ x: Math.max(0, layout.todayX - DAY_WIDTH * 3), animated: false });
        }}
      >
        <View style={{ width: layout.width }}>
          <View style={[styles.header, { height: HEADER_HEIGHT, borderColor: theme.border }]}>
            {layout.days.map((iso, i) => {
              const day = Number(iso.slice(8, 10));
              const showMonth = i === 0 || day === 1;
              return (
                <View key={iso} style={[styles.dayCell, { width: DAY_WIDTH }]}>
                  <ThemedText type="small" themeColor="mutedForeground" numberOfLines={1}>
                    {showMonth ? MONTHS[Number(iso.slice(5, 7)) - 1] : " "}
                  </ThemedText>
                  <ThemedText
                    type={iso === todayIso ? "smallBold" : "small"}
                    themeColor={iso === todayIso ? "primary" : "mutedForeground"}
                  >
                    {day}
                  </ThemedText>
                </View>
              );
            })}
          </View>
          <View style={{ height: layout.height }}>
            <Svg width={layout.width} height={layout.height} style={StyleSheet.absoluteFill}>
              {layout.days.map((iso, i) => (
                <Line
                  key={iso}
                  x1={i * DAY_WIDTH}
                  x2={i * DAY_WIDTH}
                  y1={0}
                  y2={layout.height}
                  stroke={theme.border}
                  strokeWidth={StyleSheet.hairlineWidth}
                />
              ))}
              {layout.todayX != null ? (
                <Line
                  x1={layout.todayX}
                  x2={layout.todayX}
                  y1={0}
                  y2={layout.height}
                  stroke={theme.destructive}
                  strokeWidth={1.5}
                />
              ) : null}
              {layout.links.map((link) => {
                const end = link.points[link.points.length - 1];
                return [
                  <Polyline
                    key={link.id}
                    points={link.points.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={theme.mutedForeground}
                    strokeWidth={1.2}
                  />,
                  <Polygon
                    key={`${link.id}-head`}
                    points={`${end.x},${end.y} ${end.x - 6},${end.y - 4} ${end.x - 6},${end.y + 4}`}
                    fill={theme.mutedForeground}
                  />,
                ];
              })}
            </Svg>
            {rows.map(renderBar)}
          </View>
        </View>
      </ScrollView>

      <Sheet
        visible={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        title={selected?.title ?? ""}
      >
        {selectedRow ? (
          <ThemedText type="small" themeColor="mutedForeground">
            {selectedRow.kind === "milestone"
              ? `Marco · ${formatDateBR(selectedRow.end)}`
              : `${formatDateBR(selectedRow.start)} a ${formatDateBR(selectedRow.end)}`}
            {selectedRow.hasPlannedDate ? "" : " · sem data definida"}
          </ThemedText>
        ) : null}
        <Button
          label="Abrir tarefa"
          leftIcon="open-outline"
          variant="outline"
          onPress={() => {
            const id = selectedId;
            setSelectedId(null);
            if (id) onOpenTask(id);
          }}
        />
        <ThemedText type="smallBold">Depende de</ThemedText>
        {dependsOn.length === 0 ? (
          <ThemedText type="small" themeColor="mutedForeground">
            Nenhuma dependência.
          </ThemedText>
        ) : (
          dependsOn.map((dep) => (
            <View key={dep.depends_on_task_id} style={styles.depRow}>
              <ThemedText type="small" style={styles.flex}>
                {tasksById.get(dep.depends_on_task_id)?.title ?? "Tarefa fora desta visão"}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remover dependência"
                hitSlop={8}
                disabled={busy}
                onPress={() => removeDependency(dep)}
              >
                <Ionicons name="close-circle-outline" size={20} color={theme.destructive} />
              </Pressable>
            </View>
          ))
        )}
        <Button
          label="Adicionar dependência"
          leftIcon="add"
          variant="outline"
          size="sm"
          disabled={busy || candidates.length === 0}
          onPress={() => setPickerOpen(true)}
        />
        {blocks.length > 0 ? (
          <>
            <ThemedText type="smallBold">Bloqueia</ThemedText>
            {blocks.map((dep) => (
              <ThemedText key={dep.task_id} type="small" themeColor="mutedForeground">
                {tasksById.get(dep.task_id)?.title ?? "Tarefa fora desta visão"}
              </ThemedText>
            ))}
          </>
        ) : null}
        <StringSelectModal
          visible={pickerOpen}
          title="Depende de…"
          options={candidates}
          selectedId={null}
          searchable
          onSelect={(id) => void addDependency(id)}
          onClose={() => setPickerOpen(false)}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: {
    flexDirection: "row",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    overflow: "hidden",
  },
  names: { width: NAME_WIDTH, borderRightWidth: StyleSheet.hairlineWidth },
  nameCell: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingRight: 6,
  },
  header: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  dayCell: { alignItems: "center", justifyContent: "center" },
  bar: { position: "absolute", height: BAR_HEIGHT, borderRadius: Radius.sm },
  milestone: {
    position: "absolute",
    width: MILESTONE_SIZE,
    height: MILESTONE_SIZE,
    transform: [{ rotate: "45deg" }],
  },
  depRow: { flexDirection: "row", alignItems: "center", gap: 8 },
});
