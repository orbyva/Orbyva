import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import {
  INBOX_FOLDER,
  NOTE_FOLDER_MAX_DEPTH,
  buildFolderTree,
  folderAncestorIds,
  notesInFolder,
  type FolderNav,
  type FolderNode,
} from "@/domain/notes/folders";
import { useTheme } from "@/hooks/use-theme";
import { hapticLight } from "@/lib/haptics";
import type { Note, NoteFolder } from "@/types/notes";
import type { Project, Tag } from "@/types/tasks";

const DELETE_MESSAGE =
  "As notas desta pasta vão para Sem pasta. Subpastas sobem um nível.";

export function NoteFolderTree({
  folders,
  notes,
  projects,
  tags,
  selected,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
}: {
  folders: NoteFolder[];
  notes: Note[];
  projects: Project[];
  tags: Tag[];
  selected: FolderNav;
  onSelect: (nav: FolderNav) => void;
  onCreate: (parentId: string | null) => void;
  onEdit: (folder: NoteFolder) => void;
  onDelete: (folder: NoteFolder) => void;
}) {
  const theme = useTheme();
  const tree = buildFolderTree(folders);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const allCount = notes.length;
  const inboxCount = notesInFolder(notes, INBOX_FOLDER).length;

  useEffect(() => {
    if (typeof selected !== "string" || selected === INBOX_FOLDER) return;
    const ancestors = folderAncestorIds(folders, selected);
    if (ancestors.length === 0) return;
    setCollapsed((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of ancestors) {
        if (next.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [folders, selected]);

  function toggleCollapsed(id: string, nextCollapsed: boolean) {
    void hapticLight();
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (nextCollapsed) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          Pastas
        </ThemedText>
        <Pressable
          onPress={() => onCreate(null)}
          hitSlop={8}
          accessibilityLabel="Nova pasta"
          style={styles.headBtn}
        >
          <Ionicons name="add" size={20} color={theme.primary} />
        </Pressable>
      </View>
      <NavRow
        icon="library-outline"
        label="Todas"
        count={allCount}
        active={selected == null}
        onPress={() => onSelect(null)}
      />
      <NavRow
        icon="file-tray-outline"
        label="Sem pasta"
        count={inboxCount}
        active={selected === INBOX_FOLDER}
        onPress={() => onSelect(INBOX_FOLDER)}
      />
      {tree.length > 0 ? (
        <View
          style={[styles.tree, { borderTopColor: theme.backgroundSelected }]}
        >
          {tree.map((node) => (
            <FolderRow
              key={node.id}
              node={node}
              depth={1}
              notes={notes}
              projects={projects}
              tags={tags}
              selected={selected}
              collapsed={collapsed}
              onToggleCollapsed={toggleCollapsed}
              onSelect={onSelect}
              onCreateChild={(parentId) => {
                toggleCollapsed(parentId, false);
                onCreate(parentId);
              }}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function NavRow({
  icon,
  label,
  count,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.navRow,
        active && { backgroundColor: theme.backgroundElement },
      ]}
    >
      <Ionicons
        name={icon}
        size={16}
        color={active ? theme.primary : theme.textSecondary}
      />
      <ThemedText
        type={active ? "smallBold" : "small"}
        style={[styles.navLabel, active && { color: theme.primary }]}
        numberOfLines={1}
      >
        {label}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {count}
      </ThemedText>
    </Pressable>
  );
}

function FolderRow({
  node,
  depth,
  notes,
  projects,
  tags,
  selected,
  collapsed,
  onToggleCollapsed,
  onSelect,
  onCreateChild,
  onEdit,
  onDelete,
}: {
  node: FolderNode;
  depth: number;
  notes: Note[];
  projects: Project[];
  tags: Tag[];
  selected: FolderNav;
  collapsed: Set<string>;
  onToggleCollapsed: (id: string, nextCollapsed: boolean) => void;
  onSelect: (nav: FolderNav) => void;
  onCreateChild: (parentId: string) => void;
  onEdit: (folder: NoteFolder) => void;
  onDelete: (folder: NoteFolder) => void;
}) {
  const theme = useTheme();
  const count = notesInFolder(notes, node.id).length;
  const active = selected === node.id;
  const project = projects.find((item) => item.id === node.project_id);
  const tag = tags.find((item) => item.id === node.tag_id);
  const hasChildren = node.children.length > 0;
  const expanded = hasChildren && !collapsed.has(node.id);
  const canNest = depth < NOTE_FOLDER_MAX_DEPTH;

  function openActions() {
    void hapticLight();
    const buttons: {
      text: string;
      style?: "cancel" | "destructive";
      onPress?: () => void;
    }[] = [
      { text: "Editar", onPress: () => onEdit(node) },
    ];
    if (canNest) {
      buttons.push({
        text: "Nova subpasta",
        onPress: () => onCreateChild(node.id),
      });
    }
    buttons.push({
      text: "Excluir",
      style: "destructive",
      onPress: () => {
        Alert.alert(`Excluir a pasta ${node.name}?`, DELETE_MESSAGE, [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Excluir",
            style: "destructive",
            onPress: () => onDelete(node),
          },
        ]);
      },
    });
    buttons.push({ text: "Cancelar", style: "cancel" });
    Alert.alert(node.name, undefined, buttons);
  }

  return (
    <View>
      <View
        style={[
          styles.folderRow,
          active && { backgroundColor: theme.backgroundElement },
        ]}
      >
        {hasChildren ? (
          <Pressable
            onPress={() => onToggleCollapsed(node.id, expanded)}
            hitSlop={6}
            accessibilityLabel={
              expanded ? `Recolher ${node.name}` : `Expandir ${node.name}`
            }
            style={styles.chevron}
          >
            <Ionicons
              name={expanded ? "chevron-down" : "chevron-forward"}
              size={16}
              color={theme.textSecondary}
            />
          </Pressable>
        ) : (
          <View style={styles.chevron} />
        )}
        <Pressable
          onPress={() => onSelect(node.id)}
          onLongPress={openActions}
          style={styles.folderMain}
          accessibilityLabel={`Pasta ${node.name}`}
        >
          <Ionicons
            name={expanded ? "folder-open-outline" : "folder-outline"}
            size={16}
            color={tag?.color ?? (active ? theme.primary : theme.textSecondary)}
          />
          <View style={styles.folderCopy}>
            <View style={styles.folderTitleRow}>
              <ThemedText
                type={active ? "smallBold" : "small"}
                numberOfLines={1}
                style={[styles.navLabel, active && { color: theme.primary }]}
              >
                {node.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {count}
              </ThemedText>
            </View>
            {project || tag ? (
              <View style={styles.meta}>
                {project ? (
                  <View style={styles.metaItem}>
                    <View
                      style={[
                        styles.pip,
                        { backgroundColor: project.color ?? "#94a3b8" },
                      ]}
                    />
                    <ThemedText
                      type="small"
                      themeColor="textSecondary"
                      numberOfLines={1}
                      style={styles.metaLabel}
                    >
                      {project.name}
                    </ThemedText>
                  </View>
                ) : null}
                {tag ? (
                  <View style={styles.metaItem}>
                    <Ionicons
                      name="pricetag-outline"
                      size={10}
                      color={tag.color}
                    />
                    <ThemedText
                      type="small"
                      numberOfLines={1}
                      style={[styles.metaLabel, { color: tag.color }]}
                    >
                      {tag.name}
                    </ThemedText>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </Pressable>
      </View>
      {expanded
        ? node.children.map((child) => (
            <View key={child.id} style={styles.child}>
              <FolderRow
                node={child}
                depth={depth + 1}
                notes={notes}
                projects={projects}
                tags={tags}
                selected={selected}
                collapsed={collapsed}
                onToggleCollapsed={onToggleCollapsed}
                onSelect={onSelect}
                onCreateChild={onCreateChild}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </View>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2, marginBottom: Spacing.two },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  headBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  tree: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
    marginTop: 4,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  navLabel: { flex: 1, minWidth: 0 },
  folderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 10,
    paddingRight: 8,
    paddingVertical: 6,
  },
  chevron: {
    width: 24,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  folderMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingTop: 4,
  },
  folderCopy: { flex: 1, minWidth: 0, gap: 2 },
  folderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  meta: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
    minWidth: 0,
  },
  metaLabel: { flexShrink: 1, fontSize: 11, lineHeight: 14 },
  pip: { width: 6, height: 6, borderRadius: 3 },
  child: { marginLeft: 14 },
});
