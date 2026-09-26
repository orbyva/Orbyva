import { useCallback, useEffect, useId, useState } from "react";
import { Copy, Link2, Send, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import {
  createEventInvite,
  eventInviteUrl,
  listEventInvites,
  revokeEventInvite,
} from "@/api/tasks";
import type { EventInvite, EventInviteStatus } from "@/types/tasks";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

/**
 * Dialog de convidar alguém para um evento da agenda (feature 076), no molde de
 * `TripMembersDialog.tsx`.
 *
 * O e-mail é best-effort de propósito: se o disparo falhar, o convite **continua válido** e a tela
 * empurra o "Copiar link", que é o caminho que sempre funciona. Convidar o mesmo e-mail duas vezes
 * não cria convite novo — vira reenvio (a API trata a violação do índice parcial).
 */

const STATUS_LABEL: Record<EventInviteStatus, string> = {
  pending: "Pendente",
  accepted: "Aceito",
  revoked: "Cancelado",
  expired: "Expirado",
};

/** Validação afirmativa: diz o que fazer, não só que está errado. */
export function validateInviteEmail(value: string): string | null {
  const email = value.trim();
  if (!email) return "Escreva o e-mail de quem você quer convidar.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return "Use um e-mail completo, como nome@dominio.com.";
  }
  return null;
}

export type EventInviteDialogProps = {
  eventId: string;
  eventTitle?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EventInviteDialog({
  eventId,
  eventTitle,
  open,
  onOpenChange,
}: EventInviteDialogProps) {
  const { toast } = useToast();
  const emailFieldId = useId();
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [convites, setConvites] = useState<EventInvite[]>([]);
  /** Token destacado para copiar quando o e-mail não saiu. */
  const [linkDeFallback, setLinkDeFallback] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setConvites(await listEventInvites(eventId));
    } catch (error) {
      toast({
        title: "Não foi possível carregar os convites",
        description: getErrorMessage(error, "Tente de novo em alguns instantes."),
        variant: "destructive",
      });
    } finally {
      setCarregando(false);
    }
  }, [eventId, toast]);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setErro(null);
    setLinkDeFallback(null);
    void carregar();
  }, [open, carregar]);

  async function copiar(url: string, titulo = "Link copiado") {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: titulo, duration: 2000 });
    } catch {
      // Sem clipboard (permissão negada, http): mostra o link para copiar na mão.
      toast({ title: "Copie o link", description: url });
    }
  }

  async function enviar() {
    const mensagem = validateInviteEmail(email);
    if (mensagem) {
      setErro(mensagem);
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const { invite, emailSent, resent } = await createEventInvite(eventId, email);
      const url = eventInviteUrl(invite.token);
      if (emailSent) {
        setLinkDeFallback(null);
        toast({
          title: resent ? "Convite reenviado" : "Convite enviado",
          description: `Avisamos ${invite.email} por e-mail.`,
        });
      } else {
        // O convite existe e é válido — o que faltou foi só o e-mail.
        setLinkDeFallback(url);
        toast({
          title: "Convite criado, mas o e-mail não saiu",
          description: "Copie o link e mande por onde preferir.",
        });
      }
      setEmail("");
      await carregar();
    } catch (error) {
      toast({
        title: "Não foi possível convidar",
        description: getErrorMessage(error, "Tente de novo em alguns instantes."),
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  }

  async function criarLinkSemEmail() {
    setEnviando(true);
    try {
      const { invite } = await createEventInvite(eventId);
      const url = eventInviteUrl(invite.token);
      setLinkDeFallback(url);
      await copiar(url, "Link do convite copiado");
      await carregar();
    } catch (error) {
      toast({
        title: "Não foi possível gerar o link",
        description: getErrorMessage(error, "Tente de novo em alguns instantes."),
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  }

  async function revogar(inviteId: string) {
    try {
      await revokeEventInvite(inviteId);
      toast({ title: "Convite cancelado" });
      await carregar();
    } catch (error) {
      toast({
        title: "Não foi possível cancelar",
        description: getErrorMessage(error, "Tente de novo em alguns instantes."),
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>
            Convidar para {eventTitle?.trim() || "o evento"}
          </DialogTitle>
        </DialogHeader>

        <div className={FORM_FIELDS_CLASS}>
          <div className="space-y-1.5">
            <FormLabel htmlFor={emailFieldId}>E-mail de quem você quer convidar</FormLabel>
            <Input
              id={emailFieldId}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="nome@dominio.com"
              value={email}
              aria-invalid={erro ? true : undefined}
              aria-describedby={erro ? `${emailFieldId}-erro` : undefined}
              onChange={(e) => {
                setEmail(e.target.value);
                if (erro) setErro(null);
              }}
              // Validação no blur: cobrar enquanto a pessoa ainda digita é ruído.
              onBlur={() => {
                if (email.trim()) setErro(validateInviteEmail(email));
              }}
            />
            {erro ? (
              <p id={`${emailFieldId}-erro`} className="text-sm text-destructive">
                {erro}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Ela recebe um link para aceitar e o evento vai para a agenda dela.
                O anexo do e-mail já adiciona no Google, Apple ou Outlook Calendar.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="gap-1.5"
              disabled={enviando}
              onClick={() => void enviar()}
            >
              <Send className="h-4 w-4" />
              {enviando ? "Enviando…" : "Enviar convite"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              disabled={enviando}
              onClick={() => void criarLinkSemEmail()}
            >
              <Link2 className="h-4 w-4" />
              Copiar link
            </Button>
          </div>

          {linkDeFallback && (
            <div className="rounded-lg border border-dashed p-3 text-sm">
              <p className="font-medium">Link do convite</p>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                {linkDeFallback}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 gap-1.5"
                onClick={() => void copiar(linkDeFallback)}
              >
                <Copy className="h-3.5 w-3.5" />
                Copiar
              </Button>
            </div>
          )}

          <div>
            <FormLabel>Convites deste evento</FormLabel>
            {carregando ? (
              <p className="mt-2 text-sm text-muted-foreground">Carregando…</p>
            ) : convites.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Ninguém foi convidado ainda.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {convites.map((convite) => (
                  <li
                    key={convite.id}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {convite.email ?? "Convite por link"}
                      </p>
                      <Badge variant="outline" className="mt-1 text-[10px]">
                        {STATUS_LABEL[convite.status] ?? convite.status}
                      </Badge>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Copiar link do convite de ${
                          convite.email ?? "link"
                        }`}
                        onClick={() => void copiar(eventInviteUrl(convite.token))}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      {convite.status === "pending" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          aria-label={`Cancelar convite de ${
                            convite.email ?? "link"
                          }`}
                          onClick={() => void revogar(convite.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
