import { useEffect, useState, type ReactNode } from "react";
import {
  Download,
  Instagram,
  MessageCircle,
  Share2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FORM_DIALOG_CONTENT_CLASS } from "@/components/FormLabel";
import type { Movie } from "@/types/movies";
import {
  downloadBlob,
  generateMovieShareImage,
  shareMovieNative,
  shareMovieToWhatsApp,
} from "@/lib/movieShare";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

interface MovieShareDialogProps {
  movie: Movie | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MovieShareDialog({
  movie,
  open,
  onOpenChange,
}: MovieShareDialogProps) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;

    async function build() {
      if (!open || !movie) {
        setBlob(null);
        setPreviewUrl(null);
        return;
      }
      setLoading(true);
      try {
        const image = await generateMovieShareImage(movie);
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

    build();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [open, movie]);

  if (!movie) return null;

  async function handleShare() {
    try {
      const result = await shareMovieNative(movie!, blob);
      if (result === "cancelled") return;
      toast({
        title:
          result === "shared"
            ? "Compartilhado!"
            : result === "downloaded"
              ? "Imagem baixada"
              : "Texto copiado",
        description:
          result === "downloaded"
            ? "Abra o Instagram Stories e escolha a imagem baixada."
            : undefined,
        duration: 2500,
      });
    } catch (error) {
      toast({
        title: "Erro ao compartilhar",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  }

  function handleDownload() {
    if (!blob) return;
    downloadBlob(blob, `${movie!.title}-fintrack.png`);
    toast({
      title: "Imagem baixada",
      description: "Use no Stories do Instagram ou em outros apps.",
      duration: 2500,
    });
  }

  async function handleWhatsApp() {
    try {
      const result = await shareMovieToWhatsApp(movie!, blob);
      if (result === "cancelled") return;
      toast({
        title:
          result === "shared" ? "Pronto para enviar" : "WhatsApp aberto",
        description:
          result === "shared"
            ? "Escolha o WhatsApp — o banner vai junto com a nota."
            : "Neste dispositivo o WhatsApp Web não aceita anexo automático. A imagem foi baixada: anexe na conversa.",
        duration: 3500,
      });
    } catch (error) {
      toast({
        title: "Erro ao compartilhar",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>Compartilhar opinião</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="mx-auto aspect-[9/16] w-full max-w-[220px] overflow-hidden rounded-xl border bg-muted">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Gerando card…
              </div>
            ) : previewUrl ? (
              <img
                src={previewUrl}
                alt={`Card de ${movie.title}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
                Sem prévia — ainda dá para compartilhar o texto.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ShareAction
              icon={<Share2 className="h-4 w-4" />}
              label="Compartilhar"
              onClick={handleShare}
            />
            <ShareAction
              icon={<MessageCircle className="h-4 w-4" />}
              label="WhatsApp"
              onClick={() => void handleWhatsApp()}
              hint="Envia o banner com a nota"
              disabled={loading}
            />
            <ShareAction
              icon={<Download className="h-4 w-4" />}
              label="Baixar imagem"
              onClick={handleDownload}
              disabled={!blob}
            />
            <ShareAction
              icon={<Instagram className="h-4 w-4" />}
              label="Stories"
              onClick={handleDownload}
              disabled={!blob}
              hint="Baixa o card para colar no Stories"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            No celular, WhatsApp e Compartilhar enviam o banner junto. No
            desktop, o WhatsApp Web só aceita texto — baixe a imagem e anexe na
            conversa.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShareAction({
  icon,
  label,
  onClick,
  disabled,
  hint,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-auto flex-col items-start gap-1 px-3 py-3 text-left"
      onClick={onClick}
      disabled={disabled}
    >
      <span className="inline-flex items-center gap-2 font-medium">
        {icon}
        {label}
      </span>
      {hint && (
        <span className="text-[11px] font-normal text-muted-foreground">
          {hint}
        </span>
      )}
    </Button>
  );
}
