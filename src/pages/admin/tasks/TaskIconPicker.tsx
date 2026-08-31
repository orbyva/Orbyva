import { useEffect, useRef, useState } from "react";
import { Loader2, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FormLabel } from "@/components/FormLabel";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import {
  deleteIconAsset,
  fetchIconAssets,
  renameIconAsset,
  uploadIconAsset,
} from "@/api/tasks";
import { looksLikeSvgMarkup } from "@/domain/tasks/svgIcon";
import { cn } from "@/lib/utils";
import type { IconAsset } from "@/types/tasks";
import { SvgIconPasteField } from "./SvgIconPasteField";
import { TASK_ICON_PRESETS, TaskIconBadge, type TaskIconPreset } from "./TaskIconBadge";

export interface TaskIconValue {
  icon_key: string | null;
  icon_url: string | null;
}

/** Lista vazia: diz o que fazer, não só que não há nada. */
export const ICON_LIBRARY_EMPTY = "Nenhum ícone seu ainda — envie uma imagem ou cole um SVG.";
/** Falha ao carregar a biblioteca. Uma linha, sem derrubar os presets: escolher um preset continua
 * funcionando mesmo com a lista fora do ar. */
export const ICON_LIBRARY_ERROR = "Não foi possível carregar seus ícones.";
/** A linha do confirmar-exclusão. Excluir tira da lista e **não** apaga o arquivo: as tarefas que
 * já usam aquela URL continuam mostrando o ícone. Dizer isso antes evita o susto de achar que se
 * está quebrando as tarefas antigas. */
export const ICON_DELETE_WARNING =
  "Sai só da lista — as tarefas que já usam este ícone continuam com ele.";

/**
 * Trigger (`TaskIconBadge` do valor atual, ou placeholder compacto "+i") que abre um popover com o
 * grid de presets, a **biblioteca de ícones do usuário** (feature 086) e as duas formas de
 * acrescentar um ícone novo: enviar imagem ou colar SVG. Selecionar um preset limpa `icon_url`; um
 * ícone da biblioteca limpa `icon_key` — só um dos dois fica preenchido por vez.
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
  const [uploading, setUploading] = useState(false);
  const [assets, setAssets] = useState<IconAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [assetsError, setAssetsError] = useState(false);
  /** Campo de colar aberto + o markup que ele edita. O markup vive aqui, e não dentro do campo,
   * porque o `onPaste` do popover precisa poder preenchê-lo sem que haja foco no textarea. */
  const [pasting, setPasting] = useState(false);
  const [markup, setMarkup] = useState("");
  const [savingSvg, setSavingSvg] = useState(false);
  /** Modo "gerenciar": a mesma lista, em linhas, com renomear e excluir. Fica atrás de um clique
   * porque o caso comum do popover é **escolher** um ícone, não editar a biblioteca. */
  const [managing, setManaging] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** A lista é buscada uma vez por abertura bem-sucedida; um erro libera nova tentativa na próxima
   * vez que o popover abrir. */
  const loadedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const hasIcon = !!(value.icon_key || value.icon_url);

  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    let cancelled = false;
    setLoadingAssets(true);
    setAssetsError(false);
    fetchIconAssets()
      .then((rows) => {
        if (!cancelled) setAssets(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setAssetsError(true);
        loadedRef.current = false;
      })
      .finally(() => {
        if (!cancelled) setLoadingAssets(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function selectAsset(asset: IconAsset) {
    onChange({ icon_key: null, icon_url: asset.url });
    setOpen(false);
  }

  /** O ícone recém-criado entra na lista **e** já vira o ícone da tarefa — foi para isso que o
   * usuário abriu o popover. */
  function adoptNewAsset(asset: IconAsset) {
    setAssets((prev) => [asset, ...prev]);
    onChange({ icon_key: null, icon_url: asset.url });
    setOpen(false);
  }

  function startRename(asset: IconAsset) {
    setConfirmingId(null);
    setRenamingId(asset.id);
    setRenameValue(asset.name);
  }

  async function confirmRename(asset: IconAsset) {
    const name = renameValue.trim();
    if (!name || name === asset.name) {
      setRenamingId(null);
      return;
    }
    setBusyId(asset.id);
    try {
      await renameIconAsset(asset.id, name);
      setAssets((prev) => prev.map((row) => (row.id === asset.id ? { ...row, name } : row)));
      setRenamingId(null);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível renomear o ícone."),
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  /** Tira da lista e **só** da lista: o arquivo fica no bucket e `value` não é tocado, então a
   * tarefa aberta continua com o ícone que já tinha, mesmo que seja este. */
  async function confirmDelete(asset: IconAsset) {
    setBusyId(asset.id);
    try {
      await deleteIconAsset(asset.id);
      setAssets((prev) => prev.filter((row) => row.id !== asset.id));
      setConfirmingId(null);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível excluir o ícone."),
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  function closePasteField() {
    setPasting(false);
    setMarkup("");
  }

  async function handleSaveSvg({ svg, name }: { svg: string; name: string }) {
    setSavingSvg(true);
    try {
      const asset = await uploadIconAsset({ svg }, name);
      adoptNewAsset(asset);
      closePasteField();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar o ícone."),
        variant: "destructive",
      });
    } finally {
      setSavingSvg(false);
    }
  }

  /**
   * `Ctrl+V` com o popover aberto e nenhum campo focado não chega a lugar nenhum — daí o atalho:
   * se o que foi colado **parece** SVG, o campo de colar abre já preenchido. Quem valida de verdade
   * é `prepareSvgIcon`, dentro do campo.
   *
   * Com o campo já aberto — ou com o foco em qualquer campo do popover, como o de renomear — sai da
   * frente: quem tem foco é quem deve receber a colagem.
   */
  function handlePaste(e: React.ClipboardEvent) {
    if (pasting) return;
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (!looksLikeSvgMarkup(text)) return;
    e.preventDefault();
    setMarkup(text);
    setPasting(true);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const asset = await uploadIconAsset({ file });
      adoptNewAsset(asset);
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

        <div className="space-y-1.5 border-t pt-2.5">
          <div className="flex items-center justify-between gap-2">
            <FormLabel>Meus ícones</FormLabel>
            {assets.length > 0 && !loadingAssets && (
              <button
                type="button"
                className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => {
                  setManaging((prev) => !prev);
                  setRenamingId(null);
                  setConfirmingId(null);
                }}
              >
                {managing ? "Concluir" : "Gerenciar"}
              </button>
            )}
          </div>
          {loadingAssets ? (
            <div
              className="flex gap-1.5"
              role="status"
              aria-label="Carregando seus ícones"
            >
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-8 w-8 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : assetsError ? (
            <p className="text-[10px] text-muted-foreground">{ICON_LIBRARY_ERROR}</p>
          ) : assets.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">{ICON_LIBRARY_EMPTY}</p>
          ) : managing ? (
            <ul className="space-y-1">
              {assets.map((asset) => (
                <li key={asset.id} className="rounded-md border px-1.5 py-1">
                  {renamingId === asset.id ? (
                    <div className="flex items-center gap-1">
                      <img src={asset.url} alt="" className="h-4 w-4 shrink-0 object-contain" />
                      <Input
                        aria-label={`Novo nome de ${asset.name}`}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="h-6 flex-1 px-1.5 text-[11px]"
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        disabled={busyId === asset.id}
                        onClick={() => void confirmRename(asset)}
                      >
                        Salvar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => setRenamingId(null)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  ) : confirmingId === asset.id ? (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">
                        Excluir “{asset.name}”? {ICON_DELETE_WARNING}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 flex-1 text-[10px]"
                          onClick={() => setConfirmingId(null)}
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-6 flex-1 bg-destructive text-[10px] text-destructive-foreground hover:bg-destructive/90"
                          disabled={busyId === asset.id}
                          onClick={() => void confirmDelete(asset)}
                        >
                          Excluir
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <img src={asset.url} alt="" className="h-4 w-4 shrink-0 object-contain" />
                      <span className="flex-1 truncate text-[11px]">{asset.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-muted-foreground"
                        aria-label={`Renomear ${asset.name}`}
                        onClick={() => startRename(asset)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-muted-foreground"
                        aria-label={`Excluir ${asset.name}`}
                        onClick={() => {
                          setRenamingId(null);
                          setConfirmingId(asset.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {assets.map((asset) => {
                const selected = value.icon_url === asset.url;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    aria-label={asset.name}
                    aria-pressed={selected}
                    onClick={() => selectAsset(asset)}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted",
                      selected && "border-primary bg-primary/10"
                    )}
                  >
                    <img src={asset.url} alt="" className="h-4 w-4 object-contain" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {pasting ? (
          <div className="border-t pt-2.5">
            <SvgIconPasteField
              markup={markup}
              onMarkupChange={setMarkup}
              onCancel={closePasteField}
              onSave={(input) => void handleSaveSvg(input)}
              saving={savingSvg}
            />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 border-t pt-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 flex-1 text-xs"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading && <Loader2 className="h-3 w-3 animate-spin" />}
              Enviar imagem
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 flex-1 text-xs"
              onClick={() => setPasting(true)}
            >
              Colar SVG
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
        )}
        {sharedWithSeries && (
          <p className="text-[10px] text-muted-foreground">
            Vale para todas as ocorrências desta recorrência.
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
