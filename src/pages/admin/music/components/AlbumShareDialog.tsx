import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FORM_DIALOG_CONTENT_CLASS } from "@/components/FormLabel";
import type { Album } from "@/types/music";
import { generateAlbumShareImage, shareAlbumNative } from "@/lib/albumShare";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

interface AlbumShareDialogProps {
  album: Album | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AlbumShareDialog({
  album,
  open,
  onOpenChange,
}: AlbumShareDialogProps) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const { toast } = useToast();

  const hasNotes = Boolean(album?.notes?.trim());

  useEffect(() => {
    if (!open) setIncludeNotes(true);
  }, [open]);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;

    async function build() {
      if (!open || !album) {
        setBlob(null);
        setPreviewUrl(null);
        return;
      }
      setLoading(true);
      try {
        const image = await generateAlbumShareImage(album, {
          includeNotes: hasNotes ? includeNotes : false,
        });
        if (cancelled) return;
        setBlob(image);
        if (image) {
          revoked = URL.createObjectURL(image);
          setPreviewUrl(revoked);
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
  }, [open, album, includeNotes, hasNotes]);

  if (!album) return null;

  async function handleShare() {
    setSharing(true);
    try {
      const result = await shareAlbumNative(album!, blob, {
        includeNotes: hasNotes ? includeNotes : false,
      });
      if (result === "cancelled") return;
      toast({
        title:
          result === "shared"
            ? "Compartilhado!"
            : result === "downloaded"
              ? "Imagem pronta"
              : "Texto copiado",
        description:
          result === "downloaded"
            ? "A imagem foi baixada, use no app que preferir."
            : result === "copied"
              ? "O texto foi copiado para a área de transferência."
              : undefined,
        duration: 2500,
      });
    } catch (error) {
      toast({
        title: "Erro ao compartilhar",
        description: getErrorMessage(error, "Não foi possível compartilhar."),
        variant: "destructive",
      });
    } finally {
      setSharing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>Compartilhar opinião</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {hasNotes ? (
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

          <div className="mx-auto aspect-[9/16] w-full max-w-[220px] overflow-hidden rounded-xl border bg-muted">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Gerando card…
              </div>
            ) : previewUrl ? (
              <img
                src={previewUrl}
                alt={`Card de ${album.title}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
                Sem prévia, ainda dá para compartilhar o texto.
              </div>
            )}
          </div>

          <Button
            type="button"
            className="w-full gap-2"
            onClick={() => void handleShare()}
            disabled={loading || sharing}
          >
            <Share2 className="h-4 w-4" />
            {sharing ? "Abrindo…" : "Compartilhar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
