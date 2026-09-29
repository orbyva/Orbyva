import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter, type Href } from "expo-router";

import {
  isOrbProposal,
  ORB_CREATE_TOOL_NAME,
  orbProposalIdentity,
  type OrbProposal,
} from "@/domain/orb/actionsContract";
import type { OrbNavTargetLite } from "@/domain/orb/chatReduce";
import { mapOrbWebPathToMobile } from "@/domain/orb/navigationMap";
import { useOrbChat } from "@/hooks/useOrbChat";

export type OrbProposalState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "done"; message: string; link?: string }
  | { status: "error"; message: string }
  | { status: "discarded" };

export interface OrbPendingProposal {
  callId: string;
  proposal: OrbProposal;
}

type OrbContextValue = ReturnType<typeof useOrbChat> & {
  proposalStates: Record<string, OrbProposalState>;
  setProposalState: (id: string, state: OrbProposalState) => void;
  pendingProposals: OrbPendingProposal[];
  lastNavigation: OrbNavTargetLite | null;
};

const OrbContext = createContext<OrbContextValue | null>(null);

/**
 * Conversa da Orb acima do Stack — navega e a conversa permanece.
 */
export function OrbProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [proposalStates, setProposalStates] = useState<Record<string, OrbProposalState>>({});
  const [lastNavigation, setLastNavigation] = useState<OrbNavTargetLite | null>(null);

  const onNavigate = useCallback(
    (target: OrbNavTargetLite) => {
      const href = mapOrbWebPathToMobile(target.path);
      if (!href) return;
      setLastNavigation(target);
      if (href.params) {
        router.push({ pathname: href.pathname, params: href.params } as Href);
      } else {
        router.push(href.pathname as Href);
      }
    },
    [router]
  );

  const chat = useOrbChat({ onNavigate });

  const setProposalState = useCallback((id: string, state: OrbProposalState) => {
    setProposalStates((atual) => ({ ...atual, [id]: state }));
  }, []);

  const pendingProposals = useMemo(() => {
    const porIdentidade = new Map<string, OrbPendingProposal>();
    for (const mensagem of chat.messages) {
      for (const tool of mensagem.tools ?? []) {
        if (tool.name !== ORB_CREATE_TOOL_NAME || tool.status !== "ok") continue;
        const st = proposalStates[tool.id]?.status;
        if (st === "done" || st === "discarded") continue;
        if (!isOrbProposal(tool.summary)) continue;
        const proposta = tool.summary;
        porIdentidade.set(orbProposalIdentity(proposta), {
          callId: tool.id,
          proposal: proposta,
        });
      }
    }
    return [...porIdentidade.values()];
  }, [chat.messages, proposalStates]);

  const value = useMemo(
    () => ({
      ...chat,
      proposalStates,
      setProposalState,
      pendingProposals,
      lastNavigation,
    }),
    [chat, proposalStates, setProposalState, pendingProposals, lastNavigation]
  );

  return <OrbContext.Provider value={value}>{children}</OrbContext.Provider>;
}

export function useOrbContext(): OrbContextValue | null {
  return useContext(OrbContext);
}
