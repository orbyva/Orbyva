import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import { recordHealthMetric } from "@/api/health";
import {
  METRIC_LABEL,
  METRIC_TYPES,
  METRIC_UNIT,
} from "@/domain/health/metrics";
import { formatLocalIsoDate } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";
import type { MetricType } from "@/types/health";

interface RecordMetricDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado depois que a medição é gravada — quem chama recarrega o dashboard. */
  onRecorded: () => void;
}

/**
 * Registro de uma medição corporal (feature 063) — mesmo padrão dos outros atalhos do Health
 * Dashboard (`MedicationQuickCreateDialog`, `ConsultationQuickCreateDialog`).
 *
 * O valor é `string` no estado, não `number`: digitar "78," ou apagar tudo no meio da edição não
 * pode virar `NaN` nem clampar o campo (mesmo motivo documentado em `MedicationQuickCreateDialog`).
 * Aceita vírgula como separador decimal — é o teclado brasileiro.
 */
export function RecordMetricDialog({
  open,
  onOpenChange,
  onRecorded,
}: RecordMetricDialogProps) {
  const [metricType, setMetricType] = useState<MetricType>("weight");
  const [value, setValue] = useState("");
  const [recordedDate, setRecordedDate] = useState(() =>
    formatLocalIsoDate(new Date())
  );
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const parsedValue = Number(value.replace(",", "."));
  const canSave =
    value.trim() !== "" &&
    Number.isFinite(parsedValue) &&
    parsedValue > 0 &&
    !!recordedDate;

  function reset() {
    setMetricType("weight");
    setValue("");
    setRecordedDate(formatLocalIsoDate(new Date()));
    setNotes("");
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await recordHealthMetric({
        metric_type: metricType,
        value: parsedValue,
        recorded_date: recordedDate,
        notes: notes.trim() || null,
      });
      toast({ title: "Medição registrada!", duration: 2000 });
      reset();
      onOpenChange(false);
      onRecorded();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(
          error,
          "Não foi possível registrar a medição."
        ),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>Registrar medição</DialogTitle>
        </DialogHeader>
        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel required>Tipo</FormLabel>
            <Select
              value={metricType}
              onValueChange={(next) => setMetricType(next as MetricType)}
            >
              <SelectTrigger aria-label="Tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METRIC_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {METRIC_LABEL[type]} ({METRIC_UNIT[type]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FormLabel required htmlFor="metric-value">
              Valor ({METRIC_UNIT[metricType]})
            </FormLabel>
            <Input
              id="metric-value"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={metricType === "weight" ? "Ex.: 78,4" : "Ex.: 84"}
            />
          </div>
          <div>
            <FormLabel required htmlFor="metric-date">
              Data
            </FormLabel>
            <Input
              id="metric-date"
              type="date"
              value={recordedDate}
              onChange={(e) => setRecordedDate(e.target.value)}
            />
          </div>
          <div>
            <FormLabel optional htmlFor="metric-notes">
              Observação
            </FormLabel>
            <Input
              id="metric-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: em jejum"
            />
          </div>
          <Button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="w-full"
          >
            {saving ? "Registrando..." : "Registrar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
