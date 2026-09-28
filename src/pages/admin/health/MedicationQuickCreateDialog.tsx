import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
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
import { FormLabel, FORM_DIALOG_CONTENT_CLASS, FORM_FIELDS_CLASS } from "@/components/FormLabel";
import { createMedicationWithDoses, updateMedication } from "@/api/health/medications";
import { formatDateBR } from "@/lib/currency";
import { formatLocalIsoDate } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";
import type { Medication } from "@/types/health";

type FrequencyOption = "daily" | "custom";

/**
 * Como o tratamento termina (feature 096).
 *
 * Até a 096, "sem limite" era o campo `Término` **em branco** — ausência de dado. Nada na tela
 * confirmava ao usuário que o tratamento era contínuo, então o modelo mental dele e o banco podiam
 * divergir sem aviso, que é metade do bug que abriu a feature ("está marcado como encerrado, sendo
 * que não coloquei limite"). Agora é uma escolha afirmativa, e "Uso contínuo" é um estado que se vê
 * marcado na tela.
 */
type DurationOption = "continuous" | "until";

interface MedicationQuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado depois que o tratamento é salvo — quem chama recarrega a lista. */
  onCreated: () => void;
  /** Presente = modo edição de um tratamento existente. Ausente = criação. */
  medication?: Medication | null;
}

/** `HH:MM` a partir do que o banco devolve (`HH:MM:SS`), para o `<input type="time">`. */
function toInputTime(value: string): string {
  return value.slice(0, 5);
}

/**
 * O que o toast diz depois de salvar. É o retorno visível da integração remédio → tarefa: sem ele
 * o usuário cadastra o tratamento e não tem como saber que as doses viraram tarefas na agenda.
 */
function doseFeedback(count: number): string {
  if (count === 0) {
    return "Nenhuma dose venceu ainda — elas entram na sua agenda a partir do início do tratamento.";
  }
  if (count === 1) return "1 dose já entrou na sua agenda como tarefa.";
  return `${count} doses já entraram na sua agenda como tarefas.`;
}

/**
 * Cadastro de tratamento medicamentoso (feature 064).
 *
 * Substitui o atalho da 049, que criava uma **tarefa recorrente** com um horário só: aqui o que se
 * cria é uma linha em `medication`, com N horários por dia, posologia e período. As doses continuam
 * sendo tarefas — `createMedicationWithDoses` materializa as que já venceram, e as seguintes saem
 * na carga de tarefas —, então o remédio continua aparecendo no calendário sem tela nova.
 */
export function MedicationQuickCreateDialog({
  open,
  onOpenChange,
  onCreated,
  medication = null,
}: MedicationQuickCreateDialogProps) {
  const editing = medication != null;
  const [name, setName] = useState(medication?.name ?? "");
  const [doseAmount, setDoseAmount] = useState(
    medication?.dose_amount != null ? String(medication.dose_amount) : ""
  );
  const [doseUnit, setDoseUnit] = useState(medication?.dose_unit ?? "");
  const [instructions, setInstructions] = useState(medication?.instructions ?? "");
  // Sempre ao menos um horário: uma medicação sem horário não gera dose nenhuma.
  const [times, setTimes] = useState<string[]>(
    medication?.times?.length ? medication.times.map(toInputTime) : [""]
  );
  const [frequency, setFrequency] = useState<FrequencyOption>(
    (medication?.interval_days ?? 1) > 1 ? "custom" : "daily"
  );
  // String (não number) pra não clampar o valor a cada tecla — clampar durante a digitação faz o
  // campo "saltar" de volta pro mínimo assim que o usuário apaga pra digitar outro número (bug
  // real corrigido na 049). O clamp de verdade acontece só em handleSave.
  const [customInterval, setCustomInterval] = useState(
    (medication?.interval_days ?? 1) > 1 ? String(medication!.interval_days) : "2"
  );
  const [startedOn, setStartedOn] = useState(
    medication?.started_on ?? formatLocalIsoDate(new Date())
  );
  const [endedOn, setEndedOn] = useState(medication?.ended_on ?? "");
  // Editar um tratamento que já tem término abre em "Termina em"; sem término, em "Uso contínuo".
  const [duration, setDuration] = useState<DurationOption>(
    medication?.ended_on ? "until" : "continuous"
  );
  const [endedOnError, setEndedOnError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const filledTimes = times.filter((time) => time.trim() !== "");
  const canSave = name.trim() !== "" && filledTimes.length > 0 && startedOn !== "";

  function reset() {
    setName("");
    setDoseAmount("");
    setDoseUnit("");
    setInstructions("");
    setTimes([""]);
    setFrequency("daily");
    setCustomInterval("2");
    setStartedOn(formatLocalIsoDate(new Date()));
    setEndedOn("");
    setDuration("continuous");
    setEndedOnError(null);
  }

  /**
   * O que impede o formulário de salvar um término inconsistente. `null` = pode salvar.
   *
   * Escolher "Termina em" e deixar a data vazia não pode virar `ended_on: null` silencioso: seria
   * o formulário decidindo por conta própria que o tratamento é contínuo, exatamente o tipo de
   * divergência entre a tela e o banco que a 096 existe para fechar.
   */
  function endedOnProblem(until = endedOn): string | null {
    if (duration !== "until") return null;
    if (!until) return "Escolha a data de término ou marque “Uso contínuo”.";
    if (startedOn && until < startedOn) {
      return "O término precisa ser igual ou posterior ao início.";
    }
    return null;
  }

  function pickDuration(next: DurationOption) {
    setDuration(next);
    // Voltar para "Uso contínuo" limpa a data: deixá-la guardada faria o campo reaparecer
    // preenchido e o payload continuaria dizendo `null` — dois estados contando histórias
    // diferentes sobre o mesmo tratamento.
    if (next === "continuous") setEndedOn("");
    setEndedOnError(null);
  }

  function updateTime(index: number, value: string) {
    setTimes((current) => current.map((time, i) => (i === index ? value : time)));
  }

  function removeTime(index: number) {
    setTimes((current) =>
      current.length <= 1 ? current : current.filter((_, i) => i !== index)
    );
  }

  async function handleSave() {
    if (!canSave) return;

    const problem = endedOnProblem();
    if (problem) {
      setEndedOnError(problem);
      return;
    }
    setEndedOnError(null);

    setSaving(true);
    try {
      const intervalDays =
        frequency === "daily" ? 1 : Math.max(1, parseInt(customInterval, 10) || 1);
      const amount = doseAmount.trim() === "" ? null : Number(doseAmount);
      const payload = {
        name: name.trim(),
        dose_amount: amount != null && Number.isFinite(amount) ? amount : null,
        dose_unit: doseUnit.trim() || null,
        instructions: instructions.trim() || null,
        times: filledTimes,
        interval_days: intervalDays,
        started_on: startedOn,
        // Derivado da escolha, não só do campo: "Uso contínuo" significa `null` mesmo que uma data
        // tenha sobrado no estado por algum caminho.
        ended_on: duration === "until" ? endedOn || null : null,
      };

      if (editing) {
        await updateMedication({ id: medication!.id, ...payload });
        toast({ title: "Medicação atualizada!", duration: 2000 });
      } else {
        const { doses } = await createMedicationWithDoses(payload);
        toast({
          title: "Medicação criada!",
          description: doseFeedback(doses.length),
          // Sem dose criada não há o que ver na agenda — a ação levaria a uma tela vazia.
          action:
            doses.length > 0 ? (
              <ToastAction
                altText="Ver as doses na agenda"
                onClick={() => navigate("/tasks/agenda")}
              >
                Ver na agenda
              </ToastAction>
            ) : undefined,
          duration: 6000,
        });
        reset();
      }
      onOpenChange(false);
      onCreated();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar a medicação."),
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
          <DialogTitle>{editing ? "Editar medicação" : "Nova medicação"}</DialogTitle>
        </DialogHeader>
        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel required htmlFor="medication-name">
              Nome do remédio
            </FormLabel>
            <Input
              id="medication-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Losartana"
            />
          </div>

          {/* Posologia: quantidade e unidade separadas porque "2 comprimidos" precisa compor o
              título da dose e ser comparável — não é um texto livre só. */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FormLabel optional htmlFor="medication-dose-amount">
                Quantidade
              </FormLabel>
              <Input
                id="medication-dose-amount"
                type="number"
                min={0}
                step="any"
                value={doseAmount}
                onChange={(e) => setDoseAmount(e.target.value)}
                placeholder="Ex.: 2"
              />
            </div>
            <div>
              <FormLabel optional htmlFor="medication-dose-unit">
                Unidade
              </FormLabel>
              <Input
                id="medication-dose-unit"
                value={doseUnit}
                onChange={(e) => setDoseUnit(e.target.value)}
                placeholder="Ex.: comprimidos"
              />
            </div>
          </div>

          {/* O que a 049 não tinha: N horários por dia num tratamento só. */}
          <div>
            <FormLabel required>Horários</FormLabel>
            <div className="flex flex-col gap-2">
              {times.map((time, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    type="time"
                    aria-label={`Horário ${index + 1}`}
                    value={time}
                    onChange={(e) => updateTime(index, e.target.value)}
                  />
                  {times.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover horário ${index + 1}`}
                      onClick={() => removeTime(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => setTimes((current) => [...current, ""])}
              >
                <Plus className="mr-1 h-4 w-4" />
                Adicionar horário
              </Button>
            </div>
          </div>

          <div>
            <FormLabel required>Frequência</FormLabel>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as FrequencyOption)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Todos os dias</SelectItem>
                <SelectItem value="custom">A cada X dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {frequency === "custom" && (
            <div>
              <FormLabel required htmlFor="medication-interval">
                A cada quantos dias
              </FormLabel>
              <Input
                id="medication-interval"
                type="number"
                min={1}
                value={customInterval}
                onChange={(e) => setCustomInterval(e.target.value)}
              />
            </div>
          )}

          <div>
            <FormLabel required>Início</FormLabel>
            <DatePicker
              className="sm:max-w-[14rem]"
              date={startedOn ? new Date(`${startedOn}T12:00:00`) : undefined}
              ariaLabel={startedOn ? `Início — ${formatDateBR(startedOn)}` : "Início"}
              onSelect={(d) => setStartedOn(d ? formatLocalIsoDate(d) : "")}
            />
          </div>

          {/* Duas opções mutuamente exclusivas ficam num radio group visível, não atrás de um
              select: o ponto da 096 é o usuário **ver** que o tratamento é contínuo. */}
          <div>
            <FormLabel required>Duração</FormLabel>
            <div
              role="radiogroup"
              aria-label="Duração do tratamento"
              className="flex flex-col gap-2"
            >
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="medication-duration"
                  value="continuous"
                  checked={duration === "continuous"}
                  onChange={() => pickDuration("continuous")}
                />
                Uso contínuo
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="medication-duration"
                  value="until"
                  checked={duration === "until"}
                  onChange={() => pickDuration("until")}
                />
                {/* Curso com fim definido (antibiótico por 7 dias) — a 049 mandava editar a
                    recorrência à mão pra isso. */}
                Termina em
              </label>
              {duration === "until" ? (
                <DatePicker
                  className="sm:max-w-[14rem]"
                  clearable
                  date={endedOn ? new Date(`${endedOn}T12:00:00`) : undefined}
                  ariaLabel={
                    endedOn ? `Data de término — ${formatDateBR(endedOn)}` : "Data de término"
                  }
                  aria-invalid={endedOnError != null}
                  aria-describedby={endedOnError ? "medication-ended-on-error" : undefined}
                  onSelect={(d) => {
                    const next = d ? formatLocalIsoDate(d) : "";
                    setEndedOn(next);
                    // Vazio só é erro no submit — Limpar não deve acusar no ato.
                    setEndedOnError(next ? endedOnProblem(next) : null);
                  }}
                />
              ) : null}
            </div>
            {endedOnError ? (
              <p
                id="medication-ended-on-error"
                role="alert"
                className="mt-1 text-xs text-destructive"
              >
                {endedOnError}
              </p>
            ) : null}
          </div>

          <div>
            <FormLabel optional htmlFor="medication-instructions">
              Instruções
            </FormLabel>
            <textarea
              id="medication-instructions"
              className="flex min-h-[64px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Ex.: em jejum, não tomar com leite"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>

          <Button onClick={handleSave} disabled={!canSave || saving} className="w-full">
            {saving ? "Salvando..." : editing ? "Salvar" : "Criar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
