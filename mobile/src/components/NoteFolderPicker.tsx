import { useState } from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";

import { StringSelectModal } from "@/components/StringSelectModal";
import { ThemedText } from "@/components/themed-text";
import { flattenFolderTree } from "@/domain/notes/folders";
import type { NoteFolder } from "@/types/notes";

const INBOX = "__inbox__";

/** Select plano indentado pela árvore — mover nota só troca `folder_id`. */
export function NoteFolderPicker({
  folders,
  value,
  onChange,
  disabled,
  style,
}: {
  folders: NoteFolder[];
  value: string | null;
  onChange: (folderId: string | null) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  const items = flattenFolderTree(folders);
  const label =
    value == null
      ? "Sem pasta"
      : (folders.find((folder) => folder.id === value)?.name ?? "Pasta");

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        style={style}
        accessibilityLabel="Pasta"
      >
        <ThemedText type="small" themeColor="mutedForeground">
          Pasta
        </ThemedText>
        <ThemedText>{label}</ThemedText>
      </Pressable>
      <StringSelectModal
        visible={open}
        title="Pasta"
        searchable={items.length > 8}
        selectedId={value ?? INBOX}
        options={[
          { id: INBOX, label: "Sem pasta" },
          ...items.map(({ folder, depth }) => ({
            id: folder.id,
            label: `${"— ".repeat(depth - 1)}${folder.name}`,
          })),
        ]}
        onSelect={(id) => onChange(id === INBOX ? null : id)}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
