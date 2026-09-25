import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, Loader2, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { executeOrbProposal } from "@/api/orbActions";
import { useOrbContext, type OrbProposalState } from "@/hooks/useOrb";
import {
  tripDayPlanAguardandoViagem,
  viagemConfirmadaNaConversa,
} from "@/domain/orb/tripDayPlanGate";
import { getErrorMessage } from "@/lib/errors";
import type { OrbCreateKind, OrbProposal } from "../../../supabase/functions/_shared/orb/actions.ts";

function botaoConfirmar(kind: OrbCreateKind, proposal?: OrbProposal): string {
  if (kind === "budget_delete" || kind === "recurring_quit") return "Confirmar";
  if (kind === "budget_replicate") return "Replicar";
  if (kind === "trip_day_plan") return "Adicionar ao roteiro";
  if (
    kind === "recurring_payment" ||
    kind === "habit_checkin" ||
    kind === "place_visit" ||
    kind === "fuel_log" ||
    kind === "maintenance" ||
    kind === "trip_expense"
  ) {
    return "Registrar";
  }
  if (kind === "movie_mark") {
    return proposal?.payload?.is_new === true ? "Adicionar" : "Atualizar";
  }
  if (kind === "book_progress") {
    return proposal?.payload?.is_new === true ? "Adicionar" : "Atualizar";
  }
  if (kind === "series_episode") {
    return proposal?.payload?.is_new === true ? "Adicionar e marcar" : "Marcar";
  }
  if (kind === "goal_update") {
    return "Atualizar";
  }
  return "Criar";
}

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

  const viagemPendente = tripDayPlanAguardandoViagem(proposal);
  const viagemPronta = !viagemPendente
    ? true
    : orb
      ? viagemConfirmadaNaConversa({
          titulo: viagemPendente,
          messages: orb.messages,
          proposalStates: orb.proposalStates,
        })
      : false;
  const bloqueadoPorViagem = Boolean(viagemPendente) && !viagemPronta;

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
    if (bloqueadoPorViagem) return;
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
  }, [bloqueadoPorViagem, definirEstado, estado.status, onCreated, proposal]);

  const selo =
    estado.status === "done"
      ? "criado"
      : substituida
        ? "atualizada"
        : bloqueadoPorViagem
          ? "aguardando criar a viagem"
          : "aguardando você";

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <Plus className="size-3.5 shrink-0 text-primary" aria-hidden />
        <span className="text-[13px] font-semibold">{proposal.label}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">{selo}</span>
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
      ) : bloqueadoPorViagem ? (
        <div className="mt-2.5 space-y-2">
          <p className="text-[12px] text-muted-foreground">
            Confirme primeiro o cartão <span className="font-medium">Nova viagem</span>
            {viagemPendente ? ` (“${viagemPendente}”)` : ""}. Depois o roteiro libera aqui.
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground"
            onClick={() => definirEstado({ status: "done", message: "Descartado." })}
          >
            <X className="size-3.5" aria-hidden />
            Descartar
          </Button>
        </div>
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
            {estado.status === "saving" ? "Confirmando…" : botaoConfirmar(proposal.kind, proposal)}
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
