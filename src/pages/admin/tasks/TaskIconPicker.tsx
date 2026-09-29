import { useState } from "react";
import type { ClipboardEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FormLabel } from "@/components/FormLabel";
import { AssetLibrary } from "@/components/assets/AssetLibrary";
import { pastedSvgFromEvent } from "@/components/assets/pastedSvg";
import { useAssetLibrary } from "@/components/assets/useAssetLibrary";
import { cn } from "@/lib/utils";
import type { IconAsset } from "@/types/tasks";
import { TASK_ICON_PRESETS, TaskIconBadge, type TaskIconPreset } from "./TaskIconBadge";

export interface TaskIconValue {
  icon_key: string | null;
  icon_url: string | null;
}

/**
 * Trigger (`TaskIconBadge` do valor atual, ou placeholder compacto "+i") que abre um popover com o
 * grid de presets, a **biblioteca de ícones do usuário** (feature 086) e as duas formas de
 * acrescentar um ícone novo: enviar imagem ou colar SVG. Selecionar um preset limpa `icon_url`; um
 * ícone da biblioteca limpa `icon_key` — só um dos dois fica preenchido por vez.
 *
 * Desde a 131 a biblioteca em si é `AssetLibrary` (`src/components/assets/`), montável fora daqui;
 * o que sobrou neste arquivo é o que é **da tarefa**: o gatilho, os presets, o significado do
 * clique num asset (`icon_url` preenchido, `icon_key` limpo), o "Remover ícone" e o aviso de série.
 *
 * O controlador da biblioteca é criado **aqui**, e não dentro de `AssetLibrary`, porque o
 * `PopoverContent` do Radix desmonta os filhos ao fechar: é o que faz a lista sobreviver ao
 * fecha-e-abre, sem refazer a busca e sem perder o ícone recém-enviado.
 *
 * A biblioteca só é carregada quando o popover abre: o picker aparece em toda linha de tarefa da
 * Lista, do Kanban e do Gantt, e buscar a lista na montagem seria uma consulta por card.
 *
 * **Não recebe mais `taskId`** (feature 086). Ele existia porque o arquivo ia para
 * `{userId}/{taskId}.{ext}`: sem tarefa salva não havia caminho, e por isso o upload nascia
 * desabilitado com a dica "Salve a tarefa antes de enviar uma imagem" — e a 073 tinha de passar o
 * id da *origem* da série para o arquivo não morrer junto com uma ocorrência. Com o caminho por
 * biblioteca, nenhuma das duas coisas é necessária: enviar imagem funciona em tarefa nova, e o
 * que sobrou da 073 aqui é só o aviso `sharedWithSeries`.
 */
export function TaskIconPicker({
  value,
  onChange,
  sharedWithSeries = false,
  presets = TASK_ICON_PRESETS,
  triggerLabel,
}: {
  value: TaskIconValue;
  onChange: (next: TaskIconValue) => void;
  /** Tarefa faz parte de uma série recorrente: o ícone vale para todas as ocorrências (feature
   * 073). Só muda o aviso no popover — o fan-out em si é feito por `updateTask`. */
  sharedWithSeries?: boolean;
  /** Catálogo de presets do grid. Default é o das tarefas; a tela de regras de link (feature 087)
   * passa `LINK_ICON_PRESETS` na frente, porque lá as marcas é que são o caso comum. Trocar a
   * lista, e não o componente, é o que mantém a biblioteca da 086 e o "colar SVG" de graça nos
   * dois lugares. */
  presets?: TaskIconPreset[];
  /** Sobrescreve o `aria-label` do gatilho. A tela de regras tem vários seletores na mesma página
   * (um por diálogo aberto), e "Definir ícone" sozinho não diria de qual regra. */
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  /** Campo de colar aberto + o markup que ele edita. O markup vive aqui, e não dentro do campo,
   * porque o `onPaste` do popover precisa poder preenchê-lo sem que haja foco no textarea. */
  const [pasting, setPasting] = useState(false);
  const [markup, setMarkup] = useState("");
  const library = useAssetLibrary({ enabled: open });
  const hasIcon = !!(value.icon_key || value.icon_url);

  /** Escolher um ícone da biblioteca — e também o destino de um ícone recém-enviado, que já vira o
   * ícone da tarefa: foi para isso que o usuário abriu o popover. */
  function selectAsset(asset: IconAsset) {
    onChange({ icon_key: null, icon_url: asset.url });
    setOpen(false);
  }

  /**
   * `Ctrl+V` com o popover aberto e nenhum campo focado não chega a lugar nenhum — daí o atalho:
   * se o que foi colado **parece** SVG, o campo de colar abre já preenchido. Com o campo já aberto
   * sai da frente, porque quem tem foco é quem deve receber a colagem.
   */
  function handlePaste(e: ClipboardEvent) {
    if (pasting) return;
    const pastedSvg = pastedSvgFromEvent(e);
    if (pastedSvg === null) return;
    e.preventDefault();
    setMarkup(pastedSvg);
    setPasting(true);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={triggerLabel ?? (hasIcon ? "Trocar ícone" : "Definir ícone")}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-sm px-0.5 hover:bg-muted hover:text-foreground",
            !hasIcon && "text-muted-foreground/70"
          )}
        >
          {hasIcon ? (
            <TaskIconBadge iconKey={value.icon_key} iconUrl={value.icon_url} />
          ) : (
            "+i"
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 space-y-2.5 p-3"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onPaste={handlePaste}
      >
        <FormLabel optional>Ícone</FormLabel>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => {
            const Icon = preset.icon;
            const selected = value.icon_key === preset.key && !value.icon_url;
            return (
              <button
                key={preset.key}
                type="button"
                aria-label={preset.label}
                aria-pressed={selected}
                onClick={() => {
                  onChange({ icon_key: preset.key, icon_url: null });
                  setOpen(false);
                }}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted",
                  selected && "border-primary bg-primary/10 text-primary"
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>

        <AssetLibrary
          title="Meus ícones"
          library={library}
          selectedUrl={value.icon_url}
          onSelect={selectAsset}
          onUploaded={selectAsset}
          pasting={pasting}
          onPastingChange={setPasting}
          markup={markup}
          onMarkupChange={setMarkup}
          uploadTrailing={
            hasIcon && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground"
                aria-label="Remover ícone"
                onClick={() => {
                  onChange({ icon_key: null, icon_url: null });
                  setOpen(false);
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )
          }
        />

        {sharedWithSeries && (
          <p className="text-[10px] text-muted-foreground">
            Vale para todas as ocorrências desta recorrência.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
