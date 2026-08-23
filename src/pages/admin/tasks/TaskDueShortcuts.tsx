import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { ActionTooltip } from "@/components/ActionTooltip";
import { cn } from "@/lib/utils";
import { formatLocalIsoDate } from "@/lib/dates";
import { formatDateBR } from "@/lib/currency";
import {
  AGENDA_BUCKET_LABELS,
  DUE_DATE_SHORTCUTS,
  dueDateForShortcut,
} from "@/domain/tasks/agenda";

/** Abaixo de `sm` a densidade some e o alvo de toque volta a ≥44px — mesma regra que o painel da
 * `080` aplica aos outros controles do bloco 3. `min-height` vence o `h-7` do botão denso. */
const TOUCH_TARGET_CLASS = "min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0";

interface TaskDueShortcutsProps {
  /** Prazo atual do formulário (ISO local) — só para saber qual atalho está ativo. */
  value: string | null;
  /** Recebe a data resolvida pelo atalho. Nunca é chamado com `null`: limpar o prazo continua
   * sendo o "Limpar" do calendário ao lado. */
  onSelect: (iso: string) => void;
  /** Limite superior (prazo da tarefa-mãe, no caso de subtarefa). Atalho que o ultrapassa fica
   * inerte. */
  maxDate?: string | null;
  /** Só para teste/controle; por padrão é "hoje", calculado **no render** — o dialog pode ficar
   * aberto passando da meia-noite e um `useMemo(..., [])` congelaria o dia anterior. */
  todayIso?: string;
}

/** "sábado, 22/08/2026" — o dia da semana por extenso é o que torna "Esta semana" verificável sem
 * abrir o calendário. */
function describeIso(iso: string): string {
  return format(new Date(`${iso}T12:00:00`), "EEEE, dd/MM/yyyy", { locale: ptBR });
}

/**
 * Atalhos de prazo do formulário de tarefa (feature 083): "Hoje", "Esta semana" e "Este mês",
 * antes do botão de calendário. Cada botão é a **inversa** de `bucketForDueDate` — ele põe a
 * tarefa exatamente na caixa cujo nome ele carrega (os rótulos saem de `AGENDA_BUCKET_LABELS`,
 * não de strings soltas).
 *
 * O estado ativo é **igualdade exata** com a data resolvida, não "cai no mesmo bucket": com
 * `aria-pressed`, um botão pressionado não pode mudar o valor ao ser clicado, e destacar por
 * bucket faria "Esta semana" aparecer pressionado com prazo numa quarta — e mover a data para
 * sábado ao clique. Por isso clicar num atalho já ativo é no-op (e nunca limpa o prazo: perda
 * silenciosa de dado).
 */
export function TaskDueShortcuts({
  value,
  onSelect,
  maxDate,
  todayIso = formatLocalIsoDate(new Date()),
}: TaskDueShortcutsProps) {
  return (
    <div role="group" aria-label="Atalhos de prazo" className="flex flex-wrap items-center gap-1.5">
      {DUE_DATE_SHORTCUTS.map((shortcut) => {
        const label = AGENDA_BUCKET_LABELS[shortcut];
        const resolved = dueDateForShortcut(shortcut, todayIso);
        const isActive = value === resolved;
        const isBlocked = !!maxDate && resolved > maxDate;
        const description = `${label} — ${describeIso(resolved)}`;
        const blockedReason = isBlocked
          ? `Passa do prazo da tarefa principal — ${formatDateBR(maxDate)}`
          : null;
        /* O nome acessível continua começando pelo rótulo mesmo bloqueado: trocar o nome inteiro
           pelo motivo deixaria o leitor de tela sem saber *qual* atalho está inerte. */
        const ariaLabel = blockedReason ? `${description}. ${blockedReason}` : description;

        return (
          <ActionTooltip key={shortcut} label={blockedReason ?? description}>
            <Button
              type="button"
              size="sm"
              variant={isActive ? "secondary" : "outline"}
              /* `aria-disabled` em vez de `disabled`: botão desabilitado de verdade some da ordem
                 de foco e o leitor de tela nunca chega a anunciar o motivo — que é justamente a
                 informação que falta ("passa do prazo da mãe"). O clique é neutralizado à mão. */
              aria-disabled={isBlocked || undefined}
              aria-pressed={isActive}
              aria-label={ariaLabel}
              className={cn(
                "h-7 px-2.5 text-xs",
                TOUCH_TARGET_CLASS,
                isActive && "border border-primary/40",
                isBlocked && "cursor-not-allowed opacity-50"
              )}
              onClick={() => {
                if (isBlocked || isActive) return;
                onSelect(resolved);
              }}
            >
              {label}
            </Button>
          </ActionTooltip>
        );
      })}
    </div>
  );
}
