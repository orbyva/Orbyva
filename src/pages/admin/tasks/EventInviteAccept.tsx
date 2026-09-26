import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { acceptEventInvite, getEventInviteByToken } from "@/api/tasks";
import type { EventInvitePreview } from "@/types/tasks";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

/**
 * Tela de aceite do convite de evento (feature 076), no molde de `TripInviteAccept.tsx`.
 *
 * Duas diferenças de propósito em relação à de Viagens:
 *  - a rota é **pública**. O link do convite chega por e-mail para alguém que pode não ter sessão
 *    aberta (ou nem conta); se a rota fosse protegida, o `ProtectedRoute` mandaria para `/login` e o
 *    token se perderia no caminho. Aqui a própria tela trata o estado "deslogado" e leva para
 *    `/login?next=<link do convite>`, que devolve a pessoa exatamente para cá.
 *  - cada motivo de recusa tem texto próprio (expirado, cancelado, já usado, inexistente). "Convite
 *    inválido" para tudo é o tipo de mensagem que faz a pessoa achar que o app quebrou.
 */

type Estado =
  | { tipo: "carregando" }
  | { tipo: "deslogado" }
  | { tipo: "pronto"; convite: EventInvitePreview }
  | { tipo: "outro-email"; convite: EventInvitePreview }
  | { tipo: "ja-aceito-por-mim"; convite: EventInvitePreview }
  | { tipo: "erro"; titulo: string; descricao: string };

function formatarQuando(convite: EventInvitePreview): string | null {
  if (!convite.event_starts_at) return null;
  const inicio = new Date(convite.event_starts_at);
  if (Number.isNaN(inicio.getTime())) return null;
  const data = format(inicio, "EEEE, d 'de' MMMM 'de' yyyy', às' HH:mm", {
    locale: ptBR,
  });
  if (!convite.event_ends_at) return data;
  const fim = new Date(convite.event_ends_at);
  if (Number.isNaN(fim.getTime())) return data;
  return `${data} — ${format(fim, "HH:mm")}`;
}

/** Traduz o convite carregado no estado de tela, já considerando quem está logado. */
export function estadoDoConvite(
  convite: EventInvitePreview | null,
  emailLogado: string | null | undefined
): Estado {
  if (!convite) {
    return {
      tipo: "erro",
      titulo: "Convite não encontrado",
      descricao:
        "O link pode ter sido digitado errado ou o evento foi apagado por quem convidou.",
    };
  }

  if (convite.status === "revoked") {
    return {
      tipo: "erro",
      titulo: "Convite cancelado",
      descricao: "Quem convidou cancelou este convite. Peça um link novo.",
    };
  }

  if (convite.status === "accepted") {
    if (convite.accepted_by_me) return { tipo: "ja-aceito-por-mim", convite };
    return {
      tipo: "erro",
      titulo: "Convite já utilizado",
      descricao: "Este convite já foi aceito por outra pessoa. Peça um link novo.",
    };
  }

  const vencido =
    convite.status === "expired" ||
    (!!convite.expires_at && new Date(convite.expires_at).getTime() < Date.now());
  if (vencido) {
    return {
      tipo: "erro",
      titulo: "Convite expirado",
      descricao:
        "Convites valem 14 dias. Peça para quem convidou enviar um link novo.",
    };
  }

  // Convite endereçado a um e-mail específico: quem está logado com outro não aceita.
  const alvo = convite.email?.trim().toLowerCase();
  const atual = emailLogado?.trim().toLowerCase();
  if (alvo && alvo !== atual) return { tipo: "outro-email", convite };

  return { tipo: "pronto", convite };
}

export default function EventInviteAccept() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: carregandoSessao } = useAuth();
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [aceitando, setAceitando] = useState(false);

  const caminhoDoConvite = `/events/invite/${token ?? ""}`;

  const carregar = useCallback(async () => {
    if (!token) {
      setEstado({
        tipo: "erro",
        titulo: "Convite não encontrado",
        descricao: "O link do convite está incompleto.",
      });
      return;
    }
    setEstado({ tipo: "carregando" });
    try {
      const convite = await getEventInviteByToken(token);
      setEstado(estadoDoConvite(convite, user?.email));
    } catch (error) {
      setEstado({
        tipo: "erro",
        titulo: "Não foi possível abrir o convite",
        descricao: getErrorMessage(
          error,
          "Tente de novo em alguns instantes."
        ),
      });
    }
  }, [token, user?.email]);

  useEffect(() => {
    if (carregandoSessao) return;
    if (!user) {
      setEstado({ tipo: "deslogado" });
      return;
    }
    void carregar();
  }, [carregandoSessao, user, carregar]);

  async function aceitar() {
    if (!token) return;
    setAceitando(true);
    try {
      await acceptEventInvite(token);
      toast({ title: "Evento adicionado à sua agenda", duration: 2500 });
      navigate("/tasks/agenda", { replace: true });
    } catch (error) {
      toast({
        title: "Não foi possível aceitar",
        description: getErrorMessage(error, "Tente de novo em alguns instantes."),
        variant: "destructive",
      });
      // Estado do convite pode ter mudado (revogado, expirado) — recarrega para mostrar o motivo.
      void carregar();
    } finally {
      setAceitando(false);
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-[#0c1222] px-6 py-12 text-center text-zinc-100">
      <BrandLogo variant="mark" className="size-14 rounded-2xl bg-white p-1" />
      <div className="w-full max-w-sm space-y-4">
        {estado.tipo === "carregando" && (
          <div className="space-y-3" aria-busy="true" aria-live="polite">
            <p className="text-sm text-zinc-400">Verificando convite…</p>
            <Skeleton className="mx-auto h-6 w-3/4 bg-white/10" />
            <Skeleton className="mx-auto h-4 w-2/3 bg-white/10" />
            <Skeleton className="h-10 w-full bg-white/10" />
          </div>
        )}

        {estado.tipo === "deslogado" && (
          <>
            <h1 className="text-xl font-semibold tracking-tight">
              Entre para ver o convite
            </h1>
            <p className="text-sm text-zinc-400">
              Você foi convidado para um evento no Orbyva. Entre ou crie sua
              conta — a gente traz você de volta para este convite.
            </p>
            <Button asChild className="w-full">
              <Link
                to={`/login?next=${encodeURIComponent(caminhoDoConvite)}`}
              >
                Entrar / criar conta
              </Link>
            </Button>
          </>
        )}

        {estado.tipo === "erro" && (
          <>
            <h1 className="text-xl font-semibold tracking-tight">
              {estado.titulo}
            </h1>
            <p className="text-sm text-zinc-400">{estado.descricao}</p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/tasks/agenda">Ir para a agenda</Link>
            </Button>
          </>
        )}

        {estado.tipo === "outro-email" && (
          <>
            <h1 className="text-xl font-semibold tracking-tight">
              Convite para outra conta
            </h1>
            <p className="text-sm text-zinc-400">
              Este convite foi enviado para{" "}
              <strong className="text-zinc-100">{estado.convite.email}</strong>,
              e você está logado como{" "}
              <strong className="text-zinc-100">{user?.email}</strong>. Entre
              com a conta convidada para aceitar.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/tasks/agenda">Ir para a agenda</Link>
            </Button>
          </>
        )}

        {estado.tipo === "ja-aceito-por-mim" && (
          <>
            <h1 className="text-xl font-semibold tracking-tight">
              Você já aceitou este convite
            </h1>
            <p className="text-sm text-zinc-400">
              {estado.convite.event_title} já está na sua agenda.
            </p>
            <Button asChild className="w-full">
              <Link to="/tasks/agenda">Ver na agenda</Link>
            </Button>
          </>
        )}

        {estado.tipo === "pronto" && (
          <>
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Convite de evento
            </p>
            <h1 className="text-xl font-semibold tracking-tight">
              {estado.convite.event_title ?? "Evento"}
            </h1>
            {formatarQuando(estado.convite) && (
              <p className="flex items-center justify-center gap-2 text-sm text-zinc-400">
                <CalendarDays className="h-4 w-4" />
                {formatarQuando(estado.convite)}
              </p>
            )}
            <p className="text-sm text-zinc-400">
              Aceitar cria uma cópia deste evento na sua agenda. Ninguém passa a
              ver o resto da sua conta.
            </p>
            <Button
              className="w-full"
              disabled={aceitando}
              onClick={() => void aceitar()}
            >
              {aceitando ? "Adicionando…" : "Aceitar convite"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
