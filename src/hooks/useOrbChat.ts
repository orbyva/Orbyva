import { useCallback, useEffect, useRef, useState } from "react";

import { streamOrbTurn } from "@/api/orb";
import { formatLocalIsoDate } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import { isOrbUsage, type OrbMessage, type OrbStreamEvent, type OrbToolCall } from "@/types/orb";
// Catálogo de navegação compartilhado com a Edge Function: o client valida o caminho contra a MESMA
// whitelist que o montou antes de entregá-lo ao router (feature 100).
import {
  isOrbNavigationTarget,
  ORB_NAVIGATION_TOOL_NAME,
  type OrbNavigationTarget,
} from "../../supabase/functions/_shared/orb/navigation.ts";

type EventoDeTool = Extract<OrbStreamEvent, { type: "tool" }>;
type InicioDeTool = Extract<EventoDeTool, { phase: "start" }>;
type FimDeTool = Extract<EventoDeTool, { phase: "done" }>;

const TEXTO_INTERROMPIDA = "Resposta interrompida.";
const TEXTO_SEM_RESPOSTA = "A Orb terminou sem escrever nada. Tente de novo.";
const TEXTO_FALHA = "A Orb não conseguiu responder agora.";

/** Sessão caída pede "Entrar de novo"; o resto pede "Tentar de novo". */
const ERRO_DE_SESSAO = /sess[ãa]o expirada|not authenticated|jwt|unauthorized/i;

function nextId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `orb-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ehErroDeSessao(error: unknown): boolean {
  const bruto = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return ERRO_DE_SESSAO.test(bruto);
}

/** Uma tool começou: entra pelo `id`, nunca pelo nome. Duas consultas iguais são dois cartões. */
function aplicarInicioDeTool(mensagem: OrbMessage, evento: InicioDeTool): OrbMessage {
  const tools = mensagem.tools ?? [];
  const id = evento.id ?? `${evento.name}-${tools.length}`;
  if (tools.some((tool) => tool.id === id)) return mensagem;

  const nova: OrbToolCall = {
    id,
    name: evento.name,
    input: evento.input,
    status: "running",
  };
  return { ...mensagem, tools: [...tools, nova] };
}

/**
 * Uma tool terminou: fecha a chamada daquele `id`. Sem `id` (função publicada mais velha que o
 * bundle) fecha a última chamada aberta com o mesmo nome — a alternativa era fechar a primeira e
 * deixar a segunda girando para sempre.
 */
function aplicarFimDeTool(mensagem: OrbMessage, evento: FimDeTool): OrbMessage {
  const tools = mensagem.tools ?? [];
  const status: OrbToolCall["status"] = evento.ok === false ? "error" : "ok";

  let alvo = -1;
  if (evento.id) {
    alvo = tools.findIndex((tool) => tool.id === evento.id);
  } else {
    for (let i = tools.length - 1; i >= 0; i -= 1) {
      if (tools[i].name === evento.name && tools[i].status === "running") {
        alvo = i;
        break;
      }
    }
  }

  const durationMs = typeof evento.duration_ms === "number" ? evento.duration_ms : undefined;
  if (alvo === -1) {
    // `done` sem `start` correspondente: melhor um cartão fechado do que perder a consulta.
    const orfa: OrbToolCall = {
      id: evento.id ?? `${evento.name}-${tools.length}`,
      name: evento.name,
      status,
      summary: evento.summary,
      durationMs,
    };
    return { ...mensagem, tools: [...tools, orfa] };
  }

  return {
    ...mensagem,
    tools: tools.map((tool, indice) =>
      indice === alvo
        ? { ...tool, status, summary: evento.summary, durationMs: durationMs ?? tool.durationMs }
        : tool
    ),
  };
}

/** Turno acabou (bem ou mal): nada pode continuar em "running", senão o cartão gira para sempre. */
function encerrarToolsAbertas(mensagem: OrbMessage): OrbMessage {
  if (!mensagem.tools?.some((tool) => tool.status === "running")) return mensagem;
  return {
    ...mensagem,
    tools: mensagem.tools.map((tool) =>
      tool.status === "running" ? { ...tool, status: "error" } : tool
    ),
  };
}

/**
 * O que vai para o servidor. Fica de fora o texto que o CLIENT escreveu na bolha — erro e aviso de
 * interrupção — porque devolvê-lo como fala da Orb ensina o modelo a responder no mesmo tom. O
 * pedaço que a Orb chegou a escrever antes de o usuário parar continua indo: aquilo é contexto real.
 */
function historicoParaEnvio(mensagens: OrbMessage[]) {
  return mensagens
    .filter((mensagem) => {
      if (mensagem.failed) return false;
      if (mensagem.interrupted && mensagem.content === TEXTO_INTERROMPIDA) return false;
      return mensagem.content.trim() !== "";
    })
    .map(({ role, content }) => ({ role, content }));
}

export interface UseOrbChatOptions {
  /**
   * Chamado quando a Orb pede para trocar de tela. Só chega aqui alvo que passou por
   * `isOrbNavigationTarget` — caminho de modelo não entra em `navigate()` sem whitelist.
   */
  onNavigate?: (target: OrbNavigationTarget) => void;
}

/**
 * Conversa com a Orb.
 *
 * O histórico vive aqui, no client, e é reenviado inteiro a cada turno — a Messages API é stateless
 * e o P0 da feature 098 não tem as tabelas `orb_threads`/`orb_messages` ainda. Trocar isso por
 * persistência é acrescentar o carregamento inicial e o insert; o resto do hook não muda.
 *
 * A lista de mensagens é lida de uma `ref`, e não da closure do render: `retry` e `editUserMessage`
 * cortam o histórico a partir de uma mensagem, e um callback preso a um render antigo cortaria a
 * lista errada (e reenviaria a conversa sem o último turno).
 */
export function useOrbChat({ onNavigate }: UseOrbChatOptions = {}) {
  const [messages, setMessages] = useState<OrbMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesRef = useRef<OrbMessage[]>([]);
  const streamingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  // Numa `ref` porque o handler do stream é montado uma vez por turno: preso à closure, ele
  // navegaria com o callback de um render antigo (e com o `navigate` de outra rota).
  const navegarRef = useRef(onNavigate);
  useEffect(() => {
    navegarRef.current = onNavigate;
  }, [onNavigate]);

  /** Ref e estado andam juntos: quem chama logo em seguida já lê a lista nova. */
  const atualizar = useCallback((mudanca: (atual: OrbMessage[]) => OrbMessage[]) => {
    const proximo = mudanca(messagesRef.current);
    messagesRef.current = proximo;
    setMessages(proximo);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = useCallback(() => {
    stop();
    messagesRef.current = [];
    setMessages([]);
    streamingRef.current = false;
    setIsStreaming(false);
  }, [stop]);

  /**
   * Roda um turno em cima de `historico` — que já termina na pergunta a responder. `send`, `retry`
   * e `editUserMessage` só montam esse prefixo; daqui para baixo os três são o mesmo caminho.
   */
  const rodarTurno = useCallback(
    async (historico: OrbMessage[]) => {
      const replyId = nextId();
      atualizar(() => [
        ...historico,
        { id: replyId, role: "assistant", content: "", tools: [], pending: true },
      ]);
      streamingRef.current = true;
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const patchReply = (patch: (mensagem: OrbMessage) => OrbMessage) => {
        atualizar((atual) =>
          atual.map((mensagem) => (mensagem.id === replyId ? patch(mensagem) : mensagem))
        );
      };

      const marcarInterrompida = () => {
        patchReply((mensagem) => ({
          ...encerrarToolsAbertas(mensagem),
          pending: false,
          interrupted: true,
          content: mensagem.content || TEXTO_INTERROMPIDA,
        }));
      };

      try {
        await streamOrbTurn({
          messages: historicoParaEnvio(historico),
          today: formatLocalIsoDate(new Date()),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo",
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === "text") {
              patchReply((mensagem) => ({ ...mensagem, content: mensagem.content + event.text }));
            } else if (event.type === "tool" && event.phase === "start") {
              patchReply((mensagem) => aplicarInicioDeTool(mensagem, event));
            } else if (event.type === "tool" && event.phase === "done") {
              patchReply((mensagem) => aplicarFimDeTool(mensagem, event));
              if (
                event.name === ORB_NAVIGATION_TOOL_NAME &&
                event.ok !== false &&
                isOrbNavigationTarget(event.summary)
              ) {
                navegarRef.current?.(event.summary);
              }
            } else if (event.type === "done") {
              const usage = event.usage;
              if (isOrbUsage(usage)) patchReply((mensagem) => ({ ...mensagem, usage }));
            } else if (event.type === "error") {
              patchReply((mensagem) => ({
                ...encerrarToolsAbertas(mensagem),
                pending: false,
                failed: true,
                errorKind: "generic",
                // Texto parcial é resposta de verdade (resposta cortada por limite, por exemplo):
                // o erro entra depois dele em vez de apagá-lo.
                content: mensagem.content.trim()
                  ? `${mensagem.content}\n\n${event.message}`
                  : event.message,
              }));
            }
          },
        });

        if (controller.signal.aborted) {
          marcarInterrompida();
        } else {
          patchReply((mensagem) => {
            const fechada = { ...encerrarToolsAbertas(mensagem), pending: false };
            if (fechada.failed || fechada.content.trim()) return fechada;
            // Bolha vazia sem erro trava a conversa seguinte (dois `user` seguidos no histórico) e
            // ainda parece bug de renderização. Vira falha explícita, sempre.
            return { ...fechada, failed: true, errorKind: "generic", content: TEXTO_SEM_RESPOSTA };
          });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          // Parada pedida pelo usuário: o que já chegou fica na tela, sem virar erro.
          marcarInterrompida();
        } else {
          patchReply((mensagem) => ({
            ...encerrarToolsAbertas(mensagem),
            pending: false,
            failed: true,
            errorKind: ehErroDeSessao(error) ? "session" : "generic",
            content: getErrorMessage(error, TEXTO_FALHA),
          }));
        }
      } finally {
        abortRef.current = null;
        streamingRef.current = false;
        setIsStreaming(false);
      }
    },
    [atualizar]
  );

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || streamingRef.current) return;

      const userMessage: OrbMessage = { id: nextId(), role: "user", content: question };
      await rodarTurno([...messagesRef.current, userMessage]);
    },
    [rodarTurno]
  );

  /**
   * Refaz um turno. `messageId` é a resposta a descartar (falha ou interrompida) — a pergunta que a
   * originou fica de pé, sem virar uma segunda bolha na tela. Passar o id da própria pergunta
   * também vale: o corte é do ponto dela para frente.
   */
  const retry = useCallback(
    async (messageId: string) => {
      if (streamingRef.current) return;

      const atual = messagesRef.current;
      const indice = atual.findIndex((mensagem) => mensagem.id === messageId);
      if (indice === -1) return;

      const prefixo =
        atual[indice].role === "user" ? atual.slice(0, indice + 1) : atual.slice(0, indice);
      const ultima = prefixo[prefixo.length - 1];
      if (!ultima || ultima.role !== "user") return;

      await rodarTurno(prefixo);
    },
    [rodarTurno]
  );

  /** Edita uma pergunta já enviada: o que veio depois dela some (a conversa mudou de rumo ali). */
  const editUserMessage = useCallback(
    async (messageId: string, novoTexto: string) => {
      if (streamingRef.current) return;

      const texto = novoTexto.trim();
      if (!texto) return;

      const atual = messagesRef.current;
      const indice = atual.findIndex(
        (mensagem) => mensagem.id === messageId && mensagem.role === "user"
      );
      if (indice === -1) return;

      await rodarTurno([...atual.slice(0, indice), { ...atual[indice], content: texto }]);
    },
    [rodarTurno]
  );

  return { messages, isStreaming, send, stop, reset, retry, editUserMessage };
}
