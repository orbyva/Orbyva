import { useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FormLabel } from "@/components/FormLabel";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { uploadTaskIcon } from "@/api/tasks";
import { cn } from "@/lib/utils";
import { TASK_ICON_PRESETS, TaskIconBadge } from "./TaskIconBadge";

export interface TaskIconValue {
  icon_key: string | null;
  icon_url: string | null;
}

/**
 * Trigger (`TaskIconBadge` do valor atual, ou placeholder compacto "+i") que abre um popover com um
 * grid de presets clicáveis + upload de imagem própria — as duas formas de atribuir um ícone
 * pedidas na feature 035. Selecionar um preset limpa `icon_url`; um upload bem-sucedido limpa
 * `icon_key` — só um dos dois fica preenchido por vez.
 *
 * `taskId` é obrigatório pro upload (o caminho no bucket `task-icons` é `{userId}/{taskId}.{ext}`);
 * quando `null` (formulário de tarefa nova, ainda não salva), o botão de upload fica desabilitado
 * — só presets ficam disponíveis até a tarefa existir.
 */
export function TaskIconPicker({
  taskId,
  value,
  onChange,
}: {
  taskId: string | null;
  value: TaskIconValue;
  onChange: (next: TaskIconValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const hasIcon = !!(value.icon_key || value.icon_url);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !taskId) return;
    setUploading(true);
    try {
      const iconUrl = await uploadTaskIcon(taskId, file);
      onChange({ icon_key: null, icon_url: iconUrl });
      setOpen(false);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível enviar o ícone."),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={hasIcon ? "Trocar ícone" : "Definir ícone"}
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
        className="w-64 space-y-2.5 p-3"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <FormLabel optional>Ícone</FormLabel>
        <div className="flex flex-wrap gap-1.5">
          {TASK_ICON_PRESETS.map((preset) => {
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
        <div className="flex items-center gap-1.5 border-t pt-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 flex-1 text-xs"
            disabled={!taskId || uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading && <Loader2 className="h-3 w-3 animate-spin" />}
            Enviar imagem
          </Button>
          {hasIcon && (
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
          )}
        </div>
        {!taskId && (
          <p className="text-[10px] text-muted-foreground">
            Salve a tarefa antes de enviar uma imagem.
          </p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={handleFileChange}
        />
      </PopoverContent>
    </Popover>
  );
}
