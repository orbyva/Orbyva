import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/PageShell";
import { acceptTripInvite, fetchInviteByToken } from "@/api/tripMembers";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

export default function TripInviteAccept() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [title, setTitle] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [errorMsg, setErrorMsg] = useState("");
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const invite = await fetchInviteByToken(token);
        if (!invite || invite.status !== "pending") {
          setStatus("error");
          setErrorMsg("Convite inválido ou já utilizado.");
          return;
        }
        if (new Date(invite.expires_at).getTime() < Date.now()) {
          setStatus("error");
          setErrorMsg("Este convite expirou.");
          return;
        }
        setTitle(invite.trip_title ?? "Viagem");
        setStatus("ready");
      } catch (error) {
        setStatus("error");
        setErrorMsg(getErrorMessage(error, "Não foi possível aceitar o convite."));
      }
    })();
  }, [token]);

  async function handleAccept() {
    if (!token) return;
    setAccepting(true);
    try {
      const tripId = await acceptTripInvite(token);
      toast({ title: "Você entrou na viagem!", duration: 2500 });
      navigate(`/travel/${tripId}`, { replace: true });
    } catch (error) {
      toast({
        title: "Não foi possível aceitar",
        description: getErrorMessage(error, "Não foi possível aceitar o convite."),
        variant: "destructive",
      });
    } finally {
      setAccepting(false);
    }
  }

  return (
    <PageShell title="Convite de viagem">
      <div className="mx-auto max-w-md space-y-4 text-center">
        {status === "loading" ? (
          <p className="text-muted-foreground">Verificando convite…</p>
        ) : null}
        {status === "error" ? (
          <>
            <p className="text-destructive">{errorMsg}</p>
            <Button asChild variant="outline">
              <Link to="/travel">Ir para Viagens</Link>
            </Button>
          </>
        ) : null}
        {status === "ready" ? (
          <>
            <p className="text-lg font-semibold">{title}</p>
            <p className="text-sm text-muted-foreground">
              Você foi convidado a planejar esta viagem juntos: roteiro, prazos
              e lugares. Gastos pessoais continuam privados.
            </p>
            <Button
              className="w-full"
              disabled={accepting}
              onClick={() => void handleAccept()}
            >
              {accepting ? "Entrando…" : "Aceitar convite"}
            </Button>
          </>
        ) : null}
      </div>
    </PageShell>
  );
}
