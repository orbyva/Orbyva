import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/DatePicker";
import { FormLabel } from "@/components/FormLabel";
import { MoneyInput } from "@/components/MoneyInput";
import { StarRating } from "@/components/StarRating";
import { Input } from "@/components/ui/input";
import {
  createPlaceVisitOccurrence,
  deletePlaceVisitOccurrence,
  fetchPlaceVisitOccurrences,
} from "@/api/places";
import { formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";
import type { PlaceVisitOccurrence } from "@/types/places";

type Props = {
  placeVisitId: string;
  onChanged?: () => void;
};

export function PlaceVisitsPanel({ placeVisitId, onChanged }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<PlaceVisitOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draftDate, setDraftDate] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [draftRating, setDraftRating] = useState<number | null>(null);
  const [draftNotes, setDraftNotes] = useState("");
  const [draftAmount, setDraftAmount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchPlaceVisitOccurrences(placeVisitId));
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível carregar visitas."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [placeVisitId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAdd() {
    if (!draftDate) {
      toast({ title: "Informe a data da visita", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createPlaceVisitOccurrence({
        place_visit_id: placeVisitId,
        visited_date: draftDate,
        rating: draftRating,
        notes: draftNotes.trim() || null,
        amount: draftAmount != null && draftAmount > 0 ? draftAmount : null,
        would_recommend: true,
      });
      setAdding(false);
      setDraftNotes("");
      setDraftRating(null);
      setDraftAmount(null);
      await load();
      onChanged?.();
      toast({ title: "Visita adicionada", duration: 2000 });
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar a visita."),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deletePlaceVisitOccurrence(id);
      await load();
      onChanged?.();
      toast({ title: "Visita removida", duration: 2000 });
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível excluir."),
        variant: "destructive",
      });
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Carregando visitas…</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {items.length === 0
            ? "Nenhuma visita ainda"
            : `${items.length} visita${items.length === 1 ? "" : "s"}`}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1"
          onClick={() => setAdding((v) => !v)}
        >
          <Plus className="h-3.5 w-3.5" />
          Nova visita
        </Button>
      </div>

      {adding ? (
        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
          <div>
            <FormLabel required>Data</FormLabel>
            <DatePicker
              date={new Date(`${draftDate}T12:00:00`)}
              onSelect={(d) =>
                setDraftDate(
                  d ? d.toISOString().split("T")[0] : draftDate
                )
              }
            />
          </div>
          <div>
            <FormLabel optional>Nota</FormLabel>
            <StarRating
              value={draftRating ?? 0}
              onChange={setDraftRating}
              allowHalf
            />
          </div>
          <div>
            <FormLabel optional>Valor</FormLabel>
            <MoneyInput
              value={draftAmount ?? ""}
              onChange={(v) => setDraftAmount(v === "" ? null : v)}
            />
          </div>
          <div>
            <FormLabel optional>Comentário</FormLabel>
            <Input
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              placeholder="Pratos, ambiente..."
            />
          </div>
          <Button
            type="button"
            className="w-full"
            disabled={saving}
            onClick={() => void handleAdd()}
          >
            {saving ? "Salvando…" : "Salvar visita"}
          </Button>
        </div>
      ) : null}

      <ul className="space-y-2">
        {items.map((visit) => (
          <li
            key={visit.id}
            className="flex items-start justify-between gap-2 rounded-lg border px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium tabular-nums">
                {formatDateBR(visit.visited_date)}
                {visit.rating != null ? ` · ${visit.rating}★` : null}
              </p>
              {visit.notes ? (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {visit.notes}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-destructive"
              aria-label="Excluir visita"
              onClick={() => void handleDelete(visit.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
