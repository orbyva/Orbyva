import { PlaceTypeIcon } from "@/components/PlaceTypeIcon";
import { TaskIconBadge } from "@/pages/admin/tasks/TaskIconBadge";
import {
  eventTypeIconFor,
  hasEventTypeIcon,
  type EventTypeIconMap,
} from "@/domain/travel/eventTypes";
import type { PlaceType } from "@/types/places";
import { cn } from "@/lib/utils";

/**
 * O ícone de um tipo de evento do roteiro (feature 258): a personalização do usuário quando existe,
 * o ícone padrão de `PLACE_TYPE_META` quando não.
 *
 * Recebe o mapa pronto em vez de chamar `useEventTypeIcons` por dentro. O componente aparece uma vez
 * por linha do roteiro, e um hook aqui faria cada card assinar o cache — a tela carrega o mapa uma
 * vez e repassa, que é o mesmo padrão de `notesByTask` na Lista de tarefas.
 *
 * A personalização é desenhada por `TaskIconBadge`, e não por um `<img>` próprio, porque ele já
 * resolve as duas formas (preset lucide por `icon_key`, arquivo da biblioteca por `icon_url`) com a
 * barreira que a feature 086 exige: asset é sempre `<img>`, nunca markup inline.
 */
export function EventTypeIcon({
  category,
  icons,
  className,
}: {
  /** Tipo da linha. `transport` não personaliza — deslocamento tem o ícone do modo. */
  category: PlaceType;
  /** Mapa de `useEventTypeIcons()`. Ausente = sem personalização (e é o que a tela mostra enquanto
   * a primeira busca não volta). */
  icons?: EventTypeIconMap | null;
  className?: string;
}) {
  const choice = eventTypeIconFor(icons, category);
  if (hasEventTypeIcon(choice)) {
    return (
      <TaskIconBadge
        iconKey={choice.icon_key}
        iconUrl={choice.icon_url}
        className={cn("h-4 w-4 text-current", className)}
      />
    );
  }
  return <PlaceTypeIcon type={category} className={className} />;
}
