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
import { DatePicker } from "@/components/DatePicker";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import { recordHealthMetric, updateHealthMetric } from "@/api/health";
import {
  METRIC_LABEL,
  METRIC_TYPES,
  METRIC_UNIT,
} from "@/domain/health/metrics";
import { formatDateBR } from "@/lib/currency";
import { formatLocalIsoDate } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";
import type { HealthMetric, MetricType } from "@/types/health";

interface RecordMetricDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado depois que a medição é gravada — quem chama recarrega o dashboard. */
  onRecorded: () => void;
  /** Presente = edição da medição. Ausente = registro novo. Remontar com `key` ao trocar o alvo. */
  metric?: HealthMetric | null;
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
  metric = null,
}: RecordMetricDialogProps) {
  const editing = metric != null;
  const [metricType, setMetricType] = useState<MetricType>(
    metric?.metric_type ?? "weight"
  );
  const [value, setValue] = useState(
    metric != null ? String(metric.value).replace(".", ",") : ""
  );
  const [recordedDate, setRecordedDate] = useState(
    () => metric?.recorded_date ?? formatLocalIsoDate(new Date())
  );
  const [notes, setNotes] = useState(metric?.notes ?? "");
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
      if (editing) {
        await updateHealthMetric({
          id: metric.id,
          value: parsedValue,
          recorded_date: recordedDate,
          notes: notes.trim() || null,
        });
        toast({ title: "Medição atualizada!", duration: 2000 });
      } else {
        await recordHealthMetric({
          metric_type: metricType,
          value: parsedValue,
          recorded_date: recordedDate,
          notes: notes.trim() || null,
        });
        toast({ title: "Medição registrada!", duration: 2000 });
        reset();
      }
      onOpenChange(false);
      onRecorded();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(
          error,
          "Não foi possível salvar a medição."
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
        if (!next && !editing) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar medição" : "Registrar medição"}
          </DialogTitle>
        </DialogHeader>
        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel required>Tipo</FormLabel>
            <Select
              value={metricType}
              onValueChange={(next) => setMetricType(next as MetricType)}
              disabled={editing}
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
            <FormLabel required>Data</FormLabel>
            <DatePicker
              date={recordedDate ? new Date(`${recordedDate}T12:00:00`) : undefined}
              ariaLabel={recordedDate ? `Data — ${formatDateBR(recordedDate)}` : "Data"}
              onSelect={(d) => setRecordedDate(d ? formatLocalIsoDate(d) : "")}
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
            {saving
              ? editing
                ? "Salvando..."
                : "Registrando..."
              : editing
                ? "Salvar"
                : "Registrar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
