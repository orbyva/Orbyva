import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FORM_DIALOG_CONTENT_CLASS } from "@/components/FormLabel";
import { upsertReminderPreference } from "@/api/health";
import {
  DEFAULT_REMINDER_TIME,
  REMINDER_ENTITY_DESCRIPTION,
  REMINDER_ENTITY_LABEL,
  REMINDER_ENTITY_TYPES,
  REMINDER_FREQUENCY_LABEL,
  nextReminderAt,
} from "@/domain/health/reminder";
import { formatDateTimeBR } from "@/lib/currency";
import { formatLocalIsoDate } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type {
  ReminderEntityType,
  ReminderFrequency,
  ReminderPreference,
} from "@/types/health";

interface ReminderPreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preferências já gravadas — tipo sem linha aparece desligado, no padrão. */
  preferences: ReminderPreference[];
  /** Chamado depois de salvar — quem chama recarrega o dashboard. */
  onSaved: () => void;
}

/** Estado editável de uma linha; `null` em `id` = preferência que ainda não existe no banco. */
interface RowState {
  entity_type: ReminderEntityType;
  frequency: ReminderFrequency;
  time_of_day: string;
  enabled: boolean;
  last_notified_at: string | null;
  created_at?: string;
}

function toRows(preferences: ReminderPreference[]): RowState[] {
  return REMINDER_ENTITY_TYPES.map((entityType) => {
    const saved = preferences.find((pref) => pref.entity_type === entityType);
    return {
      entity_type: entityType,
      frequency: saved?.frequency ?? "daily",
      time_of_day: (saved?.time_of_day ?? DEFAULT_REMINDER_TIME).slice(0, 5),
      enabled: saved?.enabled ?? false,
      last_notified_at: saved?.last_notified_at ?? null,
      created_at: saved?.created_at,
    };
  });
}

/** "Próximo: 17/08/2026 09:00" — o horário vem da mesma função pura que decide o disparo. */
function nextLabel(row: RowState): string | null {
  const next = nextReminderAt(
    {
      frequency: row.frequency,
      time_of_day: row.time_of_day,
      enabled: row.enabled,
      last_notified_at: row.last_notified_at,
      created_at: row.created_at ?? null,
    },
    new Date()
  );
  if (!next) return null;
  return formatDateTimeBR(
    formatLocalIsoDate(next),
    `${String(next.getHours()).padStart(2, "0")}:${String(
      next.getMinutes()
    ).padStart(2, "0")}`
  );
}

/**
 * Controle de notificações (feature 063) — é o "CONTROLE DE NOTIFICAÇÕES PARA ALIMENTAÇÃO / PARA
 * INGESTÃO DE ÁGUA" do prompt-mãe: o usuário decide se, com que frequência e a que horas ser
 * lembrado de cada coisa.
 *
 * Cada mexida salva na hora (upsert por `user_id` + `entity_type`) — não há botão "Salvar" porque
 * cada linha é independente e um switch que precisa de confirmação engana. Nenhuma ocorrência
 * futura é gravada: o "Próximo" sai de `nextReminderAt`, calculado aqui.
 */
export function ReminderPreferencesDialog({
  open,
  onOpenChange,
  preferences,
  onSaved,
}: ReminderPreferencesDialogProps) {
  const [rows, setRows] = useState<RowState[]>(() => toRows(preferences));
  const [savingType, setSavingType] = useState<ReminderEntityType | null>(null);
  const { toast } = useToast();

  // Reabrir o diálogo depois de salvar tem de mostrar o que está no banco, não o estado velho.
  useEffect(() => {
    if (open) setRows(toRows(preferences));
  }, [open, preferences]);

  async function persist(next: RowState) {
    const previous = rows;
    setRows((current) =>
      current.map((row) => (row.entity_type === next.entity_type ? next : row))
    );
    setSavingType(next.entity_type);
    try {
      await upsertReminderPreference(next.entity_type, {
        frequency: next.frequency,
        time_of_day: next.time_of_day,
        enabled: next.enabled,
      });
      onSaved();
    } catch (error) {
      setRows(previous);
      toast({
        title: "Erro",
        description: getErrorMessage(
          error,
          "Não foi possível salvar o lembrete."
        ),
        variant: "destructive",
      });
    } finally {
      setSavingType(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>Lembretes</DialogTitle>
        </DialogHeader>

        {/* A limitação do transporte fica visível: o usuário não pode contar com um lembrete que
            não vai chegar. Push com o app fechado é outra camada (ver Notas da feature 063). */}
        <p className="text-xs text-muted-foreground">
          Os lembretes aparecem enquanto o Orbyva estiver aberto — como aviso na
          tela e notificação do navegador. Notificação com o app fechado ainda não
          está disponível.
        </p>

        <ul className="divide-y">
          {rows.map((row) => {
            const next = nextLabel(row);
            return (
              <li key={row.entity_type} className="flex flex-col gap-2 py-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {REMINDER_ENTITY_LABEL[row.entity_type]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {REMINDER_ENTITY_DESCRIPTION[row.entity_type]}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={row.enabled}
                    aria-label={REMINDER_ENTITY_LABEL[row.entity_type]}
                    disabled={savingType === row.entity_type}
                    onClick={() =>
                      void persist({ ...row, enabled: !row.enabled })
                    }
                    className={cn(
                      "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
                      row.enabled
                        ? "border-[hsl(var(--health))] bg-[hsl(var(--health))]"
                        : "border-muted-foreground/30 bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-4 w-4 rounded-full bg-background transition-all",
                        row.enabled ? "left-6" : "left-0.5"
                      )}
                    />
                  </button>
                </div>

                {row.enabled ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={row.frequency}
                      onValueChange={(value) =>
                        void persist({
                          ...row,
                          frequency: value as ReminderFrequency,
                        })
                      }
                    >
                      <SelectTrigger
                        className="h-9 w-40"
                        aria-label={`Frequência de ${REMINDER_ENTITY_LABEL[row.entity_type]}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          Object.keys(REMINDER_FREQUENCY_LABEL) as ReminderFrequency[]
                        ).map((frequency) => (
                          <SelectItem key={frequency} value={frequency}>
                            {REMINDER_FREQUENCY_LABEL[frequency]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Input
                      type="time"
                      className="h-9 w-32"
                      aria-label={`Horário de ${REMINDER_ENTITY_LABEL[row.entity_type]}`}
                      value={row.time_of_day}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item) =>
                            item.entity_type === row.entity_type
                              ? { ...item, time_of_day: event.target.value }
                              : item
                          )
                        )
                      }
                      onBlur={() => void persist(row)}
                    />

                    {next ? (
                      <span className="text-xs text-muted-foreground">
                        Próximo: {next}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
