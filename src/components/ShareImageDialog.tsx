import { useEffect, useRef, useState } from "react";
import { ImagePlus, Share2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FORM_DIALOG_CONTENT_CLASS } from "@/components/FormLabel";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { SHARE_MOSAIC_MAX, loadImageFromFile } from "@/lib/shareKit";

export type ShareImageOptions = {
  /** Primeira foto (compatível com lugares). */
  photo?: HTMLImageElement | null;
  /** Todas as fotos (mosaico na viagem). */
  photos?: HTMLImageElement[];
  /** Foto usada no blur de fundo do card. */
  backdropPhoto?: HTMLImageElement | null;
  includeNotes?: boolean;
};

type SharePhotoItem = {
  id: string;
  name: string;
  img: HTMLImageElement;
  previewUrl: string;
};

type ShareImageDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  generateImage: (options?: ShareImageOptions) => Promise<Blob | null>;
  share: (
    blob: Blob | null,
    options?: ShareImageOptions
  ) => Promise<"shared" | "copied" | "downloaded" | "cancelled">;
  /** Mostra seletor de foto no card (lugares / viagens). */
  allowPhoto?: boolean;
  /**
   * Máximo de fotos anexáveis.
   * `1` = troca única (lugares). `>1` = mosaico (viagens).
   */
  maxPhotos?: number;
  /** Mostra toggle para incluir a opinião escrita no card. */
  allowNotes?: boolean;
};

function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp)$/i.test(file.name);
}

export function ShareImageDialog({
  open,
  onOpenChange,
  title,
  generateImage,
  share,
  allowPhoto = false,
  maxPhotos = 1,
  allowNotes = false,
}: ShareImageDialogProps) {
  const limit = Math.min(Math.max(1, maxPhotos), SHARE_MOSAIC_MAX);
  const multi = limit > 1;

  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photos, setPhotos] = useState<SharePhotoItem[]>([]);
  const [backdropId, setBackdropId] = useState<string | null>(null);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickingRef = useRef(false);
  const generateRef = useRef(generateImage);
  const { toast } = useToast();

  generateRef.current = generateImage;

  const backdropPhoto =
    photos.find((p) => p.id === backdropId)?.img ?? photos[0]?.img ?? null;

  useEffect(() => {
    if (!open) {
      setPhotos((prev) => {
        for (const p of prev) URL.revokeObjectURL(p.previewUrl);
        return [];
      });
      setBackdropId(null);
      setIncludeNotes(true);
      setBlob(null);
      setPreviewUrl(null);
      pickingRef.current = false;
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [open]);

  // Se a foto de fundo sumir da lista, cai na primeira
  useEffect(() => {
    if (photos.length === 0) {
      setBackdropId(null);
      return;
    }
    if (!backdropId || !photos.some((p) => p.id === backdropId)) {
      setBackdropId(photos[0].id);
    }
  }, [photos, backdropId]);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;

    async function build() {
      if (!open) return;
      setLoading(true);
      try {
        const imgs = photos.map((p) => p.img);
        const image = await generateRef.current({
          photo: imgs[0] ?? null,
          photos: imgs,
          backdropPhoto,
          includeNotes: allowNotes ? includeNotes : true,
        });
        if (cancelled) return;
        setBlob(image);
        if (image) {
          revoked = URL.createObjectURL(image);
          setPreviewUrl(revoked);
        } else {
          setPreviewUrl(null);
        }
      } catch {
        if (!cancelled) {
          setBlob(null);
          setPreviewUrl(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void build();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [open, photos, backdropPhoto, includeNotes, allowNotes]);

  function openFilePicker() {
    // Evita o Dialog fechar quando o seletor nativo rouba o foco
    pickingRef.current = true;
    fileRef.current?.click();
    window.setTimeout(() => {
      pickingRef.current = false;
    }, 1500);
  }

  function handleDialogOpenChange(next: boolean) {
    if (!next && pickingRef.current) return;
    onOpenChange(next);
  }

  async function handlePickFiles(fileList: FileList | null) {
    pickingRef.current = false;
    if (!fileList?.length) return;

    const incoming = Array.from(fileList).filter(isImageFile);
    if (incoming.length === 0) {
      toast({
        title: "Arquivo inválido",
        description: "Escolha imagens (JPG, PNG, HEIC…).",
        variant: "destructive",
      });
      return;
    }

    const room = multi ? limit - photos.length : 1;
    if (room <= 0) {
      toast({
        title: "Limite de fotos",
        description: `No máximo ${limit} fotos no mosaico.`,
        variant: "destructive",
      });
      return;
    }

    const toLoad = incoming.slice(0, room);
    if (incoming.length > room) {
      toast({
        title: `Só cabem mais ${room}`,
        description: `Limite de ${limit} fotos no card.`,
      });
    }

    try {
      const loaded = await Promise.all(
        toLoad.map(async (file) => {
          const img = await loadImageFromFile(file);
          return {
            id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
            name: file.name,
            img,
            previewUrl: URL.createObjectURL(file),
          };
        })
      );
      if (multi) {
        setPhotos((prev) => {
          const next = [...prev, ...loaded].slice(0, limit);
          if (prev.length === 0 && next[0]) setBackdropId(next[0].id);
          return next;
        });
      } else {
        setPhotos((prev) => {
          for (const p of prev) URL.revokeObjectURL(p.previewUrl);
          return loaded.slice(0, 1);
        });
        if (loaded[0]) setBackdropId(loaded[0].id);
      }
    } catch (error) {
      toast({
        title: "Falha ao carregar foto",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  function clearPhotos() {
    setPhotos((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.previewUrl);
      return [];
    });
    setBackdropId(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleShare() {
    setSharing(true);
    try {
      const imgs = photos.map((p) => p.img);
      const opts: ShareImageOptions = {
        photo: imgs[0] ?? null,
        photos: imgs,
        backdropPhoto,
        includeNotes: allowNotes ? includeNotes : true,
      };
      const result = await share(blob, opts);
      if (result === "cancelled") return;
      toast({
        title:
          result === "shared"
            ? "Compartilhado"
            : result === "copied"
              ? "Texto copiado"
              : "Imagem baixada",
        duration: 2000,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Falha ao compartilhar",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setSharing(false);
    }
  }

  const canAddMore = photos.length < limit;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className={FORM_DIALOG_CONTENT_CLASS}
        onPointerDownOutside={(e) => {
          if (pickingRef.current) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (pickingRef.current) e.preventDefault();
        }}
        onFocusOutside={(e) => {
          if (pickingRef.current) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          {allowPhoto ? (
            <div className="flex w-full flex-col gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.heic,.heif"
                multiple={multi}
                className="hidden"
                onChange={(e) => void handlePickFiles(e.target.files)}
              />

              {multi ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      Fotos do mosaico
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        {photos.length}/{limit}
                      </span>
                    </p>
                    {photos.length > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-muted-foreground"
                        onClick={clearPhotos}
                      >
                        Limpar
                      </Button>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {photos.map((p) => {
                      const isBackdrop = p.id === backdropId;
                      return (
                        <div
                          key={p.id}
                          className={`relative overflow-hidden rounded-lg border bg-muted ${
                            isBackdrop
                              ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                              : ""
                          }`}
                        >
                          <div className="relative aspect-square">
                            <img
                              src={p.previewUrl}
                              alt={p.name}
                              className="h-full w-full object-cover"
                            />
                            <button
                              type="button"
                              className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 shadow"
                              onClick={() => removePhoto(p.id)}
                              title={`Remover ${p.name}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                            {isBackdrop ? (
                              <span className="absolute bottom-1 left-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                                Fundo
                              </span>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            className={`w-full px-1.5 py-1.5 text-[10px] font-medium leading-tight transition-colors ${
                              isBackdrop
                                ? "bg-primary/15 text-primary"
                                : "bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                            onClick={() => setBackdropId(p.id)}
                            disabled={isBackdrop}
                          >
                            {isBackdrop
                              ? "Foto de fundo"
                              : "Escolher como fundo"}
                          </button>
                        </div>
                      );
                    })}
                    {canAddMore ? (
                      <button
                        type="button"
                        className="flex aspect-square flex-col items-center justify-center gap-1 self-start rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                        onClick={openFilePicker}
                      >
                        <ImagePlus className="h-5 w-5" />
                        <span className="text-[10px] font-medium">
                          {photos.length === 0 ? "Fotos" : "Mais"}
                        </span>
                      </button>
                    ) : null}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    disabled={!canAddMore}
                    onClick={openFilePicker}
                  >
                    <ImagePlus className="h-4 w-4" />
                    {photos.length === 0
                      ? `Escolher até ${limit} fotos`
                      : canAddMore
                        ? `Adicionar mais fotos (${photos.length}/${limit})`
                        : `Limite de ${limit} fotos`}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    No seletor, use Cmd/Ctrl para marcar várias de uma vez.
                  </p>
                </>
              ) : (
                <div className="flex w-full flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={openFilePicker}
                  >
                    <ImagePlus className="h-4 w-4" />
                    {photos.length ? "Trocar foto" : "Anexar foto"}
                  </Button>
                  {photos[0] ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="max-w-[200px] gap-1 text-muted-foreground"
                      onClick={clearPhotos}
                    >
                      <span className="truncate">{photos[0].name}</span>
                      <X className="h-3.5 w-3.5 shrink-0" />
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Opcional — sem foto o card usa um layout ilustrado.
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : null}

          {allowNotes ? (
            <label className="flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={includeNotes}
                onChange={(e) => setIncludeNotes(e.target.checked)}
              />
              <div className="min-w-0">
                <Label className="cursor-pointer font-medium">
                  Exibir opinião
                </Label>
                <p className="text-xs text-muted-foreground">
                  Inclui o comentário no card e no texto compartilhado.
                </p>
              </div>
            </label>
          ) : null}

          {loading ? (
            <p className="text-sm text-muted-foreground">Gerando card...</p>
          ) : previewUrl ? (
            <img
              src={previewUrl}
              alt="Preview do card"
              className="max-h-[50vh] w-auto rounded-lg border object-contain"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Não foi possível gerar a imagem.
            </p>
          )}
          <Button
            className="w-full gap-2"
            disabled={sharing || loading}
            onClick={() => void handleShare()}
          >
            <Share2 className="h-4 w-4" />
            {sharing ? "Compartilhando..." : "Compartilhar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
