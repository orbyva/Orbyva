import { useCallback } from "react";
import { Link, useLocation } from "react-router-dom";

import { OrbActionCard } from "@/components/orb/OrbActionCard";
import { OrbSphere } from "@/components/orb/OrbSphere";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useOrbContext } from "@/hooks/useOrb";

/**
 * O cartão de confirmação da Orb por cima de QUALQUER página (feature 100, Onda 5).
 *
 * PORQUÊ existir: até aqui a proposta de criação só aparecia dentro da `/orb`. Com a Orb morando na
 * barra lateral, quem pede "cria uma tarefa" de qualquer outra tela recebia "preparei, é só
 * confirmar" — e não tinha onde confirmar. O motor estava inteiro; faltava a porta.
 *
 * PORQUÊ UM componente global, e não um por página: o pedido falava em "um componente específico em
 * cada página", mas 27 variantes seriam 27 lugares para o mesmo bug, e o estado da proposta já mora
 * no `OrbProvider` — o tray é só a janela dele. Na `/orb` ele não aparece: o balão da conversa já
 * mostra o mesmo cartão, e dois botões "Criar" para a mesma proposta convidam ao clique duplo.
 *
 * Só é montado (e só baixa o chunk com `src/api/*`) quando existe proposta pendente — quem decide é
 * o host no `AdminLayout`.
 */
export default function OrbProposalTray() {
  const orb = useOrbContext();
  const location = useLocation();
  const { toast } = useToast();

  /**
   * No sucesso a proposta deixa de ser pendente e o cartão some daqui — sem isto a pessoa clicaria
   * "Criar" e veria só o cartão desaparecer, sem confirmação nenhuma nem como chegar no que criou.
   */
  const aoCriar = useCallback(
    (resultado: { message: string; link?: string }) => {
      toast({
        title: resultado.message,
        duration: 4000,
        action: resultado.link ? (
          <ToastAction altText="Ver o que foi criado" asChild>
            <Link to={resultado.link}>Ver</Link>
          </ToastAction>
        ) : undefined,
      });
    },
    [toast]
  );

  if (!orb || orb.pendingProposals.length === 0) return null;
  if (location.pathname.startsWith("/orb")) return null;

  return (
    <div
      // `pointer-events-none` no trilho e `auto` no cartão: o tray ocupa a faixa inteira para ficar
      // à direita, mas não pode roubar clique do conteúdo da página embaixo dele.
      //
      // O recuo de baixo desvia dos dois fixos que já moram nesse canto: a `MobileBottomNav` no
      // celular (~3,75rem + safe area) e o FAB de gasto rápido no desktop (h-14 em `bottom-6`).
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-end px-3 pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:px-6 md:pb-24"
    >
      <div
        role="region"
        aria-label="Criação proposta pela Orb"
        className="pointer-events-auto flex w-full max-w-sm flex-col gap-2 rounded-2xl border bg-popover p-2.5 shadow-lg"
      >
        <div className="flex items-center gap-2">
          <OrbSphere size={22} state="idle" />
          <p className="text-[12px] font-medium">
            {orb.pendingProposals.length > 1
              ? `A Orb preparou ${orb.pendingProposals.length} criações`
              : "A Orb preparou uma criação"}
          </p>
          <span className="ml-auto text-[11px] text-muted-foreground">confirme para gravar</span>
        </div>

        {orb.pendingProposals.map((pendente) => (
          <OrbActionCard
            key={pendente.callId}
            callId={pendente.callId}
            proposal={pendente.proposal}
            onCreated={aoCriar}
          />
        ))}
      </div>
    </div>
  );
}
