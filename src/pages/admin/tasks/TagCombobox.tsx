import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { contrastTextColor } from "@/lib/color";
import { randomLabelColor } from "./LabelColorPicker";
import type { Tag } from "@/types/tasks";

/**
 * Busca + seleção múltipla de tags, com criação inline (cor aleatória — mudar a cor depois é
 * feito na página de gestão `/tasks/tags`, não aqui, pra manter o fluxo de digitar-e-criar rápido).
 */
export function TagCombobox({
  allTags,
  selectedIds,
  onChange,
  onCreateTag,
}: {
  allTags: Tag[];
  selectedIds: string[];
  onChange: (nextIds: string[]) => void;
  onCreateTag: (name: string, color: string) => Promise<Tag>;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedTags = selectedIds
    .map((id) => allTags.find((t) => t.id === id))
    .filter((t): t is Tag => !!t);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const available = allTags.filter((t) => !selectedIds.includes(t.id));
    if (!q) return available.slice(0, 8);
    return available.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 8);
  }, [allTags, selectedIds, query]);

  const exactMatch = allTags.some((t) => t.name.toLowerCase() === query.trim().toLowerCase());

  function selectTag(tag: Tag) {
    onChange([...selectedIds, tag.id]);
    setQuery("");
  }

  function removeTag(id: string) {
    onChange(selectedIds.filter((tid) => tid !== id));
  }

  async function handleCreate() {
    const name = query.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const tag = await onCreateTag(name, randomLabelColor());
      onChange([...selectedIds, tag.id]);
      setQuery("");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div ref={containerRef} className="space-y-1.5">
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedTags.map((tag) => (
            <Badge
              key={tag.id}
              className="gap-1 border-none"
              style={{ backgroundColor: tag.color, color: contrastTextColor(tag.color) }}
            >
              {tag.name}
              <button type="button" onClick={() => removeTag(tag.id)} aria-label={`Remover ${tag.name}`}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (filtered[0] && !exactMatch) selectTag(filtered[0]);
                else if (query.trim() && !exactMatch) handleCreate();
              }
            }}
            placeholder="Buscar ou criar tag…"
            className="h-9"
          />
        </PopoverAnchor>
        <PopoverContent
          className="w-64 p-1"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            // O Input é um PopoverAnchor, não um PopoverTrigger — o Radix só isenta o *trigger*
            // da dismissão por interação externa (`targetIsTrigger` em PopoverContentNonModal).
            // Sem esta isenção, qualquer pointerdown/focusin no próprio Input com o popover
            // aberto conta como "fora" e fecha o popover, que reabre em seguida via
            // onFocus/onChange → flicker. Aqui replicamos a isenção pro nosso wrapper.
            if (containerRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
        >
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {filtered.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => selectTag(tag)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </button>
            ))}
            {query.trim() && !exactMatch && (
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-primary hover:bg-muted disabled:opacity-50"
              >
                Criar tag "{query.trim()}"
              </button>
            )}
            {filtered.length === 0 && !query.trim() && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                Digite para buscar ou criar uma tag.
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
