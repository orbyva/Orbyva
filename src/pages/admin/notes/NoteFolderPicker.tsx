import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { flattenFolderTree } from "@/domain/notes/folders";
import type { NoteFolder } from "@/types/notes";

const INBOX_VALUE = "inbox";

/**
 * Select plano indentado pela árvore (feature 099) — o picker de pasta do editor e o seletor
 * estreito da lista no mobile. `null` é "Sem pasta".
 */
export function NoteFolderPicker({
  folders,
  value,
  onChange,
  id,
}: {
  folders: NoteFolder[];
  value: string | null;
  onChange: (folderId: string | null) => void;
  id?: string;
}) {
  const items = flattenFolderTree(folders);
  return (
    <Select
      value={value ?? INBOX_VALUE}
      onValueChange={(next) => onChange(next === INBOX_VALUE ? null : next)}
    >
      <SelectTrigger id={id} aria-label="Pasta">
        <SelectValue placeholder="Sem pasta" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={INBOX_VALUE}>Sem pasta</SelectItem>
        {items.map(({ folder, depth }) => (
          <SelectItem key={folder.id} value={folder.id}>
            <span style={{ paddingLeft: `${(depth - 1) * 12}px` }}>
              {folder.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
