import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, UserMinus, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  createTripInvite,
  inviteUrl,
  leaveTrip,
  listTripInvites,
  listTripMembers,
  removeTripMember,
  revokeTripInvite,
} from "@/api/tripMembers";
import type { TripInvite, TripMember } from "@/types/tripSharing";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { useAuth } from "@/hooks/useAuth";

type TripMembersDialogProps = {
  tripId: string;
  myRole?: "owner" | "editor" | null;
  isShared?: boolean;
  onChanged?: () => void;
  /** Gatilho só com ícone, para toolbars densas. */
  compact?: boolean;
};

export function TripMembersDialog({
  tripId,
  myRole,
  isShared,
  onChanged,
  compact = false,
}: TripMembersDialogProps) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [invites, setInvites] = useState<TripInvite[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const isOwner = myRole === "owner";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const m = await listTripMembers(tripId);
      setMembers(m);
      if (isOwner) {
        setInvites(await listTripInvites(tripId));
      } else {
        setInvites([]);
      }
    } catch (error) {
      toast({
        title: "Não foi possível carregar membros",
        description: getErrorMessage(error, "Não foi possível atualizar os membros."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [tripId, isOwner, toast]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function handleCreateInvite() {
    try {
      const invite = await createTripInvite(tripId, email || null);
      const url = inviteUrl(invite.token);
      const emailed = Boolean(email?.trim());
      try {
        await navigator.clipboard.writeText(url);
        toast({
          title: emailed ? "Convite enviado" : "Link copiado",
          description: emailed
            ? "E-mail disparado e link copiado."
            : "Envie para quem for viajar com você.",
        });
      } catch {
        toast({
          title: emailed ? "Convite criado" : "Convite criado",
          description: emailed
            ? `E-mail enviado. Link: ${url}`
            : url,
        });
      }
      setEmail("");
      await load();
      onChanged?.();
    } catch (error) {
      toast({
        title: "Erro ao convidar",
        description: getErrorMessage(error, "Não foi possível atualizar os membros."),
        variant: "destructive",
      });
    }
  }

  async function handleCopy(token: string) {
    const url = inviteUrl(token);
    await navigator.clipboard.writeText(url);
    toast({ title: "Link copiado", duration: 2000 });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {compact ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={isShared ? "Membros" : "Compartilhar viagem"}
          >
            <Users className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="gap-2">
            <Users className="h-4 w-4" />
            {isShared ? "Membros" : "Compartilhar viagem"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>Viagem compartilhada</DialogTitle>
        </DialogHeader>

        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel>Quem está nesta viagem</FormLabel>
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {members.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {m.display_name || "Viajante"}
                        {m.user_id === user?.id ? " (você)" : ""}
                      </p>
                      <Badge variant="outline" className="mt-1 text-[10px]">
                        {m.role === "owner" ? "Dono" : "Editor"}
                      </Badge>
                    </div>
                    {isOwner && m.role !== "owner" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() =>
                          void removeTripMember(tripId, m.user_id)
                            .then(() => {
                              toast({ title: "Membro removido" });
                              return load();
                            })
                            .then(() => onChanged?.())
                            .catch((error) =>
                              toast({
                                title: "Erro",
                                description: getErrorMessage(error, "Não foi possível atualizar os membros."),
                                variant: "destructive",
                              })
                            )
                        }
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </li>
                ))}
                {members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Rode o script shared_trips.sql e recarregue para ativar
                    membros.
                  </p>
                ) : null}
              </ul>
            )}
          </div>

          {isOwner ? (
            <div className="space-y-3">
              <FormLabel>Convidar por link</FormLabel>
              <p className="text-xs text-muted-foreground">
                A pessoa precisa ter conta Orbyva. O link vale 14 dias.
              </p>
              <Input
                type="email"
                placeholder="E-mail (opcional, só lembrete)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button
                type="button"
                className="w-full gap-2"
                onClick={() => void handleCreateInvite()}
              >
                <Link2 className="h-4 w-4" />
                Gerar link de convite
              </Button>

              {invites.length > 0 ? (
                <ul className="space-y-2">
                  {invites.map((inv) => (
                    <li
                      key={inv.id}
                      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono">
                        {inviteUrl(inv.token)}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => void handleCopy(inv.token)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() =>
                          void revokeTripInvite(inv.id)
                            .then(load)
                            .catch((error) =>
                              toast({
                                title: "Erro",
                                description: getErrorMessage(error, "Não foi possível atualizar os membros."),
                                variant: "destructive",
                              })
                            )
                        }
                      >
                        Revogar
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full text-destructive"
              onClick={() =>
                void leaveTrip(tripId)
                  .then(() => {
                    toast({ title: "Você saiu da viagem" });
                    setOpen(false);
                    onChanged?.();
                    window.location.href = "/travel";
                  })
                  .catch((error) =>
                    toast({
                      title: "Erro",
                      description: getErrorMessage(error, "Não foi possível atualizar os membros."),
                      variant: "destructive",
                    })
                  )
              }
            >
              Sair da viagem
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
