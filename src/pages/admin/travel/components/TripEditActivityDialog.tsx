import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import {
  PlaceCatalogSearch,
  type PlaceCatalogPick,
} from "@/components/PlaceCatalogSearch";
import {
  ACTIVITY_CATEGORY_LABELS,
  normalizeTripActivityCategory,
} from "@/domain/travel";
import type { PlaceVisit } from "@/types/places";
import type { TripActivityCategory } from "@/types/travel";

export type ActivityForm = {
  title: string;
  activity_time: string;
  notes: string;
  link_url: string;
  is_reserved: boolean;
  category: TripActivityCategory;
  place_visit_id: string | null;
  /** Rótulo do local vinculado (busca ou lugar existente). */
  linked_place_label: string | null;
  /** Novo lugar da busca — criado só no salvar. */
  pending_catalog: PlaceCatalogPick | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ActivityForm;
  onChange: (form: ActivityForm) => void;
  onSave: () => void;
  places: PlaceVisit[];
  mode?: "create" | "edit";
};

export function TripEditActivityDialog({
  open,
  onOpenChange,
  form,
  onChange,
  onSave,
  places,
  mode = "edit",
}: Props) {
  const isCreate = mode === "create";
  const linkedLabel =
    form.linked_place_label ||
    places.find((p) => p.id === form.place_visit_id)?.name ||
    null;
  const category = normalizeTripActivityCategory(form.category);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>
            {isCreate ? "Adicionar visita" : "Editar visita"}
          </DialogTitle>
        </DialogHeader>
        <div className={FORM_FIELDS_CLASS}>
          <div className="space-y-1">
            <PlaceCatalogSearch
              label="Local"
              selectedLabel={linkedLabel}
              onClear={() =>
                onChange({
                  ...form,
                  place_visit_id: null,
                  linked_place_label: null,
                  pending_catalog: null,
                })
              }
              onPick={(hit) => {
                const existing = places.find(
                  (p) =>
                    p.geoapify_place_id === hit.geoapify_place_id ||
                    (p.lat === hit.lat &&
                      p.lng === hit.lng &&
                      p.name === hit.name)
                );
                onChange({
                  ...form,
                  title: form.title.trim() ? form.title : hit.name,
                  category: existing?.type ?? hit.type,
                  place_visit_id: existing?.id ?? null,
                  linked_place_label: hit.name,
                  pending_catalog: existing ? null : hit,
                });
              }}
            />
            {!linkedLabel ? (
              <p className="text-xs text-muted-foreground">
                Busque o local para calcular o trajeto no roteiro.
              </p>
            ) : null}
          </div>

          <div>
            <FormLabel required>Título</FormLabel>
            <Input
              value={form.title}
              onChange={(e) => onChange({ ...form, title: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FormLabel optional>Horário</FormLabel>
              <Input
                value={form.activity_time}
                onChange={(e) =>
                  onChange({ ...form, activity_time: e.target.value })
                }
                placeholder="Ex: 09:30"
              />
            </div>
            <div>
              <FormLabel optional>Tipo</FormLabel>
              <Select
                value={category}
                onValueChange={(v) =>
                  onChange({
                    ...form,
                    category: v as TripActivityCategory,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(ACTIVITY_CATEGORY_LABELS) as TripActivityCategory[]
                  ).map((key) => (
                    <SelectItem key={key} value={key}>
                      {ACTIVITY_CATEGORY_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <FormLabel optional>Link</FormLabel>
            <Input
              value={form.link_url}
              onChange={(e) => onChange({ ...form, link_url: e.target.value })}
              placeholder="https://…"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_reserved}
              onChange={(e) =>
                onChange({ ...form, is_reserved: e.target.checked })
              }
              className="size-4 rounded border"
            />
            Já reservado
          </label>
          <div>
            <FormLabel optional>Notas</FormLabel>
            <Input
              value={form.notes}
              onChange={(e) => onChange({ ...form, notes: e.target.value })}
            />
          </div>
          <Button onClick={onSave} className="w-full">
            {isCreate ? "Adicionar" : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
