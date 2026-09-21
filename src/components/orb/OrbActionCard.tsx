import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, Loader2, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { executeOrbProposal } from "@/api/orbActions";
import { useOrbContext, type OrbProposalState } from "@/hooks/useOrb";
import { getErrorMessage } from "@/lib/errors";
import type { OrbProposal } from "../../../supabase/functions/_shared/orb/actions.ts";

/**
 * O cartão de confirmação de uma criação proposta pela Orb (feature 100).
 *
 * A Orb monta; a pessoa confirma; o `src/api/*` grava. O botão é o humano no loop — sem ele, um
 * "cria uma tarefa aí" mal interpretado vira dado no banco de alguém sem ninguém ver o que foi
 * gravado. Por isso o cartão mostra CADA campo antes, e não só o título.
 *
 * A situação (gravando / criado / falhou) vive no `OrbProvider`, não aqui: este componente desmonta
 * a cada navegação, e um estado local faria uma proposta já gravada voltar a oferecer "Criar".
 */
export function OrbActionCard({
  callId,
  proposal,
  onCreated,
}: {
  /** Id da chamada de tool que gerou a proposta — a chave do estado no provider. */
  callId: string;
  proposal: OrbProposal;
  /**
   * Chamado só quando a gravação dá certo. Existe para o tray global: lá o cartão SOME no sucesso
   * (ele deixa de ser pendente), então o "criado · ver" precisa aparecer em outro lugar — um toast.
   * No balão da `/orb` o cartão continua na conversa e mostra o sucesso nele mesmo.
   */
  onCreated?: (outcome: { message: string; link?: string }) => void;
}) {
  const orb = useOrbContext();
  const [estadoLocal, setEstadoLocal] = useState<OrbProposalState>({ status: "idle" });
  const estado = orb?.proposalStates[callId] ?? estadoLocal;

  /**
   * Esta proposta foi reproposta depois (a pessoa pediu um ajuste e o modelo mandou a versão
   * completa de novo). Na conversa o cartão antigo continua na tela — é o histórico —, mas o botão
   * "Criar" dele gravaria justamente a versão SEM o ajuste. O provider é quem sabe qual é a atual.
   */
  const substituida =
    estado.status === "idle" &&
    Boolean(orb) &&
    !orb?.pendingProposals.some((pendente) => pendente.callId === callId);

  const definirEstado = useCallback(
    (proximo: OrbProposalState) => {
      if (orb) orb.setProposalState(callId, proximo);
      else setEstadoLocal(proximo);
    },
    [orb, callId]
  );

  const criar = useCallback(async () => {
    if (estado.status === "saving" || estado.status === "done") return;
    definirEstado({ status: "saving" });
    try {
      const resultado = await executeOrbProposal(proposal);
      definirEstado({ status: "done", message: resultado.message, link: resultado.link });
      onCreated?.(resultado);
    } catch (error) {
      definirEstado({
        status: "error",
        message: getErrorMessage(error, "Não consegui criar agora."),
      });
    }
  }, [definirEstado, estado.status, onCreated, proposal]);

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <Plus className="size-3.5 shrink-0 text-primary" aria-hidden />
        <span className="text-[13px] font-semibold">{proposal.label}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {estado.status === "done" ? "criado" : substituida ? "atualizada" : "aguardando você"}
        </span>
      </div>

      <dl className="mt-2 grid gap-1">
        {proposal.fields.map((campo) => (
          <div key={`${campo.label}-${campo.value}`} className="flex gap-2 text-[12px]">
            <dt className="w-24 shrink-0 text-muted-foreground">{campo.label}</dt>
            <dd className="min-w-0 flex-1 break-words">{campo.value}</dd>
          </div>
        ))}
      </dl>

      {estado.status === "done" ? (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-success">
          <Check className="size-3.5 shrink-0" aria-hidden />
          {estado.message}
          {estado.link ? (
            <Link to={estado.link} className="underline underline-offset-2">
              ver
            </Link>
          ) : null}
        </p>
      ) : substituida ? (
        <p className="mt-2 text-[12px] text-muted-foreground">
          Substituída por uma versão mais nova — o cartão atual é o de baixo.
        </p>
      ) : (
        <div className="mt-2.5 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
            onClick={() => void criar()}
            disabled={estado.status === "saving"}
          >
            {estado.status === "saving" ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Check className="size-3.5" aria-hidden />
            )}
            {estado.status === "saving" ? "Criando…" : "Criar"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground"
            onClick={() => definirEstado({ status: "done", message: "Descartado." })}
            disabled={estado.status === "saving"}
          >
            <X className="size-3.5" aria-hidden />
            Descartar
          </Button>
        </div>
      )}

      {estado.status === "error" ? (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-destructive">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          {estado.message}
        </p>
      ) : null}
    </div>
  );
}
