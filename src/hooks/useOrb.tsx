import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";

import { useOrbChat } from "@/hooks/useOrbChat";
import {
  isOrbProposal,
  ORB_CREATE_TOOL_NAME,
  orbProposalIdentity,
  type OrbProposal,
} from "../../supabase/functions/_shared/orb/actions.ts";
import type { OrbNavigationTarget } from "../../supabase/functions/_shared/orb/navigation.ts";

/**
 * Situação de uma proposta de criação (feature 100), guardada POR CHAMADA DE TOOL.
 *
 * Mora aqui, e não no componente do cartão, porque o cartão desmonta: a Orb navega, a `/orb` sai da
 * tela, e um estado local voltaria a "esperando confirmação" numa proposta já gravada — convidando
 * a pessoa a criar a mesma tarefa duas vezes.
 */
export type OrbProposalState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "done"; message: string; link?: string }
  | { status: "error"; message: string };

/** Uma proposta de criação que ainda espera a decisão da pessoa. */
export interface OrbPendingProposal {
  /** Id da chamada de tool — a chave do estado e do cartão. */
  callId: string;
  proposal: OrbProposal;
}

/**
 * A conversa da Orb, uma só para o app inteiro (feature 100).
 *
 * Ela precisa viver ACIMA do `Outlet`: a Orb navega, e um estado que morasse dentro da página
 * `/orb` seria destruído pela primeira navegação que ela mesma pediu — a pessoa perguntaria "me
 * mostra as tarefas do Sacada", a tela trocaria e a resposta sumiria no meio do stream.
 *
 * A barra lateral e a `/orb` são duas janelas para este mesmo estado, não duas conversas.
 */
type OrbContextValue = ReturnType<typeof useOrbChat> & {
  /** Última tela que a Orb abriu, para a UI conseguir dizer "te levei para X". */
  lastNavigation: OrbNavigationTarget | null;
  /** Painel da barra lateral aberto. */
  dockOpen: boolean;
  setDockOpen: (open: boolean) => void;
  /** Abre o painel e devolve o foco ao campo — usado pelo atalho e pelo clique na esfera. */
  openDock: () => void;
  /** Registrado pelo dock; `openDock` usa para focar o campo mesmo quando ele acabou de montar. */
  registerComposer: (focus: (() => void) | null) => void;
  /** Situação de cada proposta de criação, por id da chamada de tool. */
  proposalStates: Record<string, OrbProposalState>;
  setProposalState: (id: string, state: OrbProposalState) => void;
  /**
   * As propostas da conversa que ainda esperam decisão — é o que o tray global mostra por cima de
   * qualquer página. Derivado das mensagens, não guardado à parte: proposta duplicada ou perdida
   * seria a consequência óbvia de manter duas listas da mesma coisa.
   */
  pendingProposals: OrbPendingProposal[];
};

const OrbContext = createContext<OrbContextValue | null>(null);

const CHAVE_DO_DOCK = "orb:dock-aberto";

function lerPreferencia(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(CHAVE_DO_DOCK) !== "0";
  } catch {
    // Navegador com storage bloqueado: o padrão aberto é melhor que quebrar a barra lateral.
    return true;
  }
}

export function OrbProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [lastNavigation, setLastNavigation] = useState<OrbNavigationTarget | null>(null);
  const [dockOpen, setDockOpenState] = useState<boolean>(lerPreferencia);
  const composerRef = useRef<(() => void) | null>(null);
  const [proposalStates, setProposalStates] = useState<Record<string, OrbProposalState>>({});

  const setDockOpen = useCallback((open: boolean) => {
    setDockOpenState(open);
    try {
      window.localStorage.setItem(CHAVE_DO_DOCK, open ? "1" : "0");
    } catch {
      // Sem storage a preferência não sobrevive ao reload; a sessão atual continua funcionando.
    }
  }, []);

  const openDock = useCallback(() => {
    setDockOpen(true);
    // O campo pode ainda não existir (dock fechado): o `requestAnimationFrame` espera o render.
    requestAnimationFrame(() => composerRef.current?.());
  }, [setDockOpen]);

  const registerComposer = useCallback((focus: (() => void) | null) => {
    composerRef.current = focus;
  }, []);

  const setProposalState = useCallback((id: string, state: OrbProposalState) => {
    setProposalStates((atual) => ({ ...atual, [id]: state }));
  }, []);

  const onNavigate = useCallback(
    (target: OrbNavigationTarget) => {
      setLastNavigation(target);
      navigate(target.path);
    },
    [navigate]
  );

  const chat = useOrbChat({ onNavigate });

  /**
   * Proposta pendente = chamada de `propose_create` que deu certo, cujo resultado ainda passa por
   * `isOrbProposal` e cujo estado não é `done` (criada ou descartada). O filtro por `isOrbProposal`
   * não é paranoia: o `summary` do SSE pode vir truncado, e um cartão sem payload só ofereceria um
   * botão que falha no clique.
   *
   * Proposta da MESMA coisa (mesmo tipo, mesmo texto principal) substitui a anterior, ficando no
   * lugar dela: como a tool não edita, "com prazo para sexta" faz o modelo repropor a tarefa inteira
   * — e sem isto a pessoa terminava com dois cartões iguais, sendo que confirmar o de cima (o
   * antigo) gravava exatamente a versão sem o ajuste que ela acabou de pedir.
   */
  const pendingProposals = useMemo(() => {
    const porIdentidade = new Map<string, OrbPendingProposal>();
    for (const mensagem of chat.messages) {
      for (const tool of mensagem.tools ?? []) {
        if (tool.name !== ORB_CREATE_TOOL_NAME || tool.status !== "ok") continue;
        if (proposalStates[tool.id]?.status === "done") continue;
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
      lastNavigation,
      dockOpen,
      setDockOpen,
      openDock,
      registerComposer,
      proposalStates,
      setProposalState,
      pendingProposals,
    }),
    [
      chat,
      lastNavigation,
      dockOpen,
      setDockOpen,
      openDock,
      registerComposer,
      proposalStates,
      setProposalState,
      pendingProposals,
    ]
  );

  return <OrbContext.Provider value={value}>{children}</OrbContext.Provider>;
}

/**
 * Fora do provider o hook devolve `null` de propósito, em vez de lançar: a `/orb` e o dock só
 * existem dentro do `AdminLayout`, mas os testes de componente montam os dois soltos, e um throw
 * ali só ensinaria a embrulhar tudo em provider de mentira.
 */
// eslint-disable-next-line react-refresh/only-export-components -- hook irmão do provider
export function useOrbContext(): OrbContextValue | null {
  return useContext(OrbContext);
}
