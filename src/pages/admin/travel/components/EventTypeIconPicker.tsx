import { useState } from "react";
import { Loader2 } from "lucide-react";
import { EventTypeIcon } from "@/components/EventTypeIcon";
import { TaskIconPicker } from "@/pages/admin/tasks/TaskIconPicker";
import {
  clearEventTypeIcon,
  setEventTypeIcon,
} from "@/api/travel/eventTypeIcons";
import {
  eventTypeIconFor,
  hasEventTypeIcon,
} from "@/domain/travel/eventTypes";
import {
  invalidateEventTypeIcons,
  useEventTypeIcons,
} from "@/hooks/useEventTypeIcons";
import { ACTIVITY_CATEGORY_LABELS } from "@/domain/travel";
import { placeTypeMeta } from "@/domain/places";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { PlaceType } from "@/types/places";

/**
 * Escolhe o ícone de um **tipo** de evento (feature 258) — não o do evento que está sendo editado.
 *
 * Duas coisas que o desenho precisa deixar claras, e deixa:
 *
 * 1. **Grava na hora, fora do "Salvar" do formulário.** O ícone do tipo é configuração do usuário,
 *    não campo do evento: cancelar o formulário não pode desfazê-lo, e salvar o evento não é o que o
 *    confirma. Mesmo contrato do `TaskIconPicker` na tela de regras de link.
 * 2. **A prévia à esquerda é o que o card vai desenhar** — com personalização ou com o ícone padrão
 *    do tipo. Sem ela, "+i" no gatilho pareceria dizer que o tipo não tem ícone nenhum hoje.
 *
 * O catálogo de presets é o de tarefas (`TASK_ICON_PRESETS`, o default do `TaskIconPicker`): junto
 * dele vêm a biblioteca da 086, o "enviar imagem" e o "colar SVG" sem nada a mais aqui.
 */
export function EventTypeIconPicker({ category }: { category: PlaceType }) {
  const icons = useEventTypeIcons();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const choice = eventTypeIconFor(icons, category);
  const label = ACTIVITY_CATEGORY_LABELS[category] ?? "evento";

  async function apply(next: { icon_key: string | null; icon_url: string | null }) {
    setSaving(true);
    try {
      if (next.icon_key || next.icon_url) {
        await setEventTypeIcon(category, next);
      } else {
        // "Remover ícone" apaga a linha: sem linha é o único jeito de dizer "sem personalização".
        await clearEventTypeIcon(category);
      }
      // Invalida o cache do módulo: é o que faz os cards do roteiro, montados fora deste diálogo,
      // trocarem de ícone sem recarregar a página.
      invalidateEventTypeIcons();
    } catch (error) {
      toast({
        title: "Não foi possível salvar o ícone do tipo",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent",
          placeTypeMeta(category).tone
        )}
        aria-hidden
      >
        <EventTypeIcon category={category} icons={icons} className="h-4 w-4" />
      </span>
      <TaskIconPicker
        value={choice}
        onChange={(next) => void apply(next)}
        triggerLabel={
          hasEventTypeIcon(choice)
            ? `Trocar o ícone do tipo ${label}`
            : `Escolher o ícone do tipo ${label}`
        }
      />
      {saving ? (
        <Loader2
          className="h-3.5 w-3.5 animate-spin text-muted-foreground"
          aria-label="Salvando"
        />
      ) : null}
    </div>
  );
}
