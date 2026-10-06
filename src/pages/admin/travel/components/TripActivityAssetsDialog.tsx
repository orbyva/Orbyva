import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  Paperclip,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormDialogShell } from "@/components/FormDialogShell";
import { EmptyState } from "@/components/EmptyState";
import {
  addActivityLinkAsset,
  deleteActivityAsset,
  fetchAssetsForActivity,
  renameActivityAsset,
  signedAssetUrl,
  uploadActivityFileAsset,
} from "@/api/travel/activityAssets";
import {
  ASSET_URL_REJECTION_MESSAGES,
  assetDisplayLabel,
  formatAssetSize,
  normalizeAssetUrl,
} from "@/domain/travel/activityAssets";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { TripActivityAsset, TripItineraryActivity } from "@/types/travel";

/** Teto do bucket (`20260930120000_trip_activity_asset.sql`). Checado aqui também para a recusa
 * chegar como frase em vez de erro cru do Storage. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  activity: TripItineraryActivity | null;
  /** Sobe a lista nova para o estado do TripDetail — evita refetch do bundle inteiro depois de
   * cada anexo, no mesmo espírito de `onActivityDeleted`. */
  onAssetsChange?: (activityId: string, assets: TripActivityAsset[]) => void;
  /** Viagem encerrada / sem permissão: a lista continua visível e abrível, só não se escreve. */
  readOnly?: boolean;
};

/**
 * Os assets de uma linha do roteiro (feature 102) — arquivos e links de um evento ou de um
 * deslocamento.
 *
 * Por que um diálogo próprio, e não um campo no `TripEditActivityDialog`: upload precisa de
 * `activity_id`, que em modo `create` ainda não existe. Um campo de arquivo lá não teria onde
 * gravar, e teria de inventar um estado "pendente" que o resto do formulário não tem.
 *
 * O diálogo é a fonte da verdade enquanto está aberto: recarrega a lista do banco a cada escrita
 * (uma consulta por atividade, barata) e empurra o resultado para cima por `onAssetsChange`, para o
 * contador do card acompanhar sem o bundle inteiro voltar.
 */
export function TripActivityAssetsDialog({
  open,
  onOpenChange,
  tripId,
  activity,
  onAssetsChange,
  readOnly = false,
}: Props) {
  const { toast } = useToast();
  const [assets, setAssets] = useState<TripActivityAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activityId = activity?.id ?? null;

  useEffect(() => {
    if (!open || !activityId) return;
    let alive = true;
    setLoading(true);
    // A lista vem do banco e não da prop: o card pode ter sido montado antes de alguém do grupo
    // anexar algo, e abrir o diálogo é o momento certo de descobrir isso.
    fetchAssetsForActivity(activityId)
      .then((rows) => {
        if (!alive) return;
        setAssets(rows);
        onAssetsChange?.(activityId, rows);
      })
      .catch((err) => {
        if (!alive) return;
        toast({
          title: "Não foi possível carregar os assets",
          description: getErrorMessage(err),
          variant: "destructive",
        });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // `onAssetsChange`/`toast` fora das deps de propósito: identidade nova a cada render do pai
    // refaria a consulta sem motivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activityId]);

  useEffect(() => {
    if (open) return;
    setLinkUrl("");
    setLinkLabel("");
    setLinkError(null);
    setRenamingId(null);
  }, [open]);

  function publish(rows: TripActivityAsset[]) {
    setAssets(rows);
    if (activityId) onAssetsChange?.(activityId, rows);
  }

  async function reload() {
    if (!activityId) return;
    publish(await fetchAssetsForActivity(activityId));
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !activityId) return;
    const tooBig = Array.from(files).find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      toast({
        title: "Arquivo muito grande",
        description: `“${tooBig.name}” passa de 10 MB, o limite por arquivo.`,
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      // Em série, não em paralelo: cada upload precisa da `position` depois do anterior, e um erro
      // no meio deixa claro quais arquivos entraram.
      let current = assets;
      for (const file of Array.from(files)) {
        const created = await uploadActivityFileAsset({
          tripId,
          activityId,
          file,
          existing: current,
        });
        current = [...current, created];
        publish(current);
      }
      await reload();
      toast({ title: files.length > 1 ? "Arquivos anexados" : "Arquivo anexado" });
    } catch (err) {
      toast({
        title: "Não foi possível anexar",
        description: getErrorMessage(err),
        variant: "destructive",
      });
      await reload().catch(() => undefined);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleAddLink() {
    if (!activityId) return;
    const normalized = normalizeAssetUrl(linkUrl);
    if (!normalized.ok) {
      // A recusa aparece no campo, não num toast: o erro é do que está escrito ali.
      setLinkError(ASSET_URL_REJECTION_MESSAGES[normalized.reason]);
      return;
    }
    setLinkError(null);
    setUploading(true);
    try {
      await addActivityLinkAsset({
        tripId,
        activityId,
        url: normalized.url,
        label: linkLabel,
        existing: assets,
      });
      setLinkUrl("");
      setLinkLabel("");
      await reload();
      toast({ title: "Link anexado" });
    } catch (err) {
      toast({
        title: "Não foi possível anexar o link",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleOpen(asset: TripActivityAsset) {
    setBusyId(asset.id);
    try {
      const url = await signedAssetUrl(asset);
      // `noopener` sempre: a URL assinada não pode dar à aba nova referência à nossa.
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast({
        title: "Não foi possível abrir",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleRename(asset: TripActivityAsset) {
    setBusyId(asset.id);
    try {
      await renameActivityAsset(asset.id, renameValue);
      setRenamingId(null);
      await reload();
    } catch (err) {
      toast({
        title: "Não foi possível renomear",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(asset: TripActivityAsset) {
    setBusyId(asset.id);
    try {
      await deleteActivityAsset(asset);
      await reload();
    } catch (err) {
      toast({
        title: "Não foi possível excluir",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  const canWrite = !readOnly && !!activityId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <FormDialogShell
        title={
          <span className="flex items-center gap-2">
            <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            Assets
          </span>
        }
        description={
          activity
            ? `Arquivos e links de “${activity.title}”. Ficam com a viagem, visíveis para quem participa dela.`
            : undefined
        }
      >
        <div className="space-y-4 pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-label="Carregando" />
            </div>
          ) : assets.length === 0 ? (
            <EmptyState
              icon={Paperclip}
              title="Nada anexado ainda"
              description="Cartão de embarque, voucher da reserva, ingresso, link do check-in — o que precisa estar à mão na hora."
            />
          ) : (
            <ul className="space-y-2">
              {assets.map((asset) => {
                const busy = busyId === asset.id;
                const label = assetDisplayLabel(asset);
                const size = formatAssetSize(asset.size_bytes);
                const Icon =
                  asset.kind === "link"
                    ? Link2
                    : asset.mime_type?.startsWith("image/")
                      ? ImageIcon
                      : FileText;

                return (
                  <li
                    key={asset.id}
                    className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2"
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                        asset.kind === "link"
                          ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400"
                          : "border-primary/30 bg-primary/10 text-primary"
                      )}
                      aria-hidden
                    >
                      <Icon className="h-4 w-4" />
                    </span>

                    {renamingId === asset.id ? (
                      <>
                        <Input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleRename(asset);
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          aria-label="Novo nome do asset"
                          className="h-9 min-w-0 flex-1"
                        />
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleRename(asset)}
                        >
                          Salvar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setRenamingId(null)}
                        >
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleOpen(asset)}
                          disabled={busy}
                          className="min-w-0 flex-1 text-left"
                          title={
                            asset.kind === "link"
                              ? (asset.url ?? undefined)
                              : "Abrir arquivo"
                          }
                        >
                          <span className="block truncate text-sm font-medium">
                            {label}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {asset.kind === "link" ? "Link" : "Arquivo"}
                            {size ? ` · ${size}` : ""}
                          </span>
                        </button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground"
                          aria-label={`Abrir ${label}`}
                          disabled={busy}
                          onClick={() => void handleOpen(asset)}
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ExternalLink className="h-4 w-4" />
                          )}
                        </Button>

                        {canWrite ? (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-muted-foreground"
                              aria-label={`Renomear ${label}`}
                              disabled={busy}
                              onClick={() => {
                                setRenamingId(asset.id);
                                setRenameValue(asset.label ?? label);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                              aria-label={`Excluir ${label}`}
                              disabled={busy}
                              onClick={() => void handleDelete(asset)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : null}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {canWrite ? (
            <div className="space-y-3 border-t pt-4">
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  aria-hidden
                  tabIndex={-1}
                  onChange={(e) => void handleFiles(e.target.files)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-dashed"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-1.5 h-4 w-4" />
                  )}
                  Anexar arquivo
                </Button>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Até 10 MB por arquivo. Fica guardado em privado — só quem participa da viagem
                  consegue abrir.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={linkUrl}
                    onChange={(e) => {
                      setLinkUrl(e.target.value);
                      setLinkError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleAddLink();
                    }}
                    placeholder="https://… (check-in, reserva, ingresso)"
                    aria-label="Link do asset"
                    aria-invalid={linkError ? true : undefined}
                    className="min-w-0 flex-1"
                  />
                  <Input
                    value={linkLabel}
                    onChange={(e) => setLinkLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleAddLink();
                    }}
                    placeholder="Nome (opcional)"
                    aria-label="Nome do link"
                    className="min-w-0 sm:max-w-[11rem]"
                  />
                </div>
                {linkError ? (
                  <p className="text-xs text-destructive" role="alert">
                    {linkError}
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-dashed"
                  disabled={uploading || !linkUrl.trim()}
                  onClick={() => void handleAddLink()}
                >
                  <Link2 className="mr-1.5 h-4 w-4" />
                  Anexar link
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </FormDialogShell>
    </Dialog>
  );
}
