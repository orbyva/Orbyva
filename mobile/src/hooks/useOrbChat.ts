import { useCallback, useEffect, useRef, useState } from "react";

import { streamOrbTurn } from "@/api/orb";
import {
  applyToolDone,
  applyToolStart,
  closeRunningTools,
  isOrbNavTargetLite,
  ORB_NAVIGATION_TOOL_NAME,
  type OrbNavTargetLite,
} from "@/domain/orb/chatReduce";
import { mapOrbWebPathToMobile } from "@/domain/orb/navigationMap";
import { formatLocalIsoDate } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import { isOrbUsage, type OrbMessage } from "@/types/orb";

const TEXTO_INTERROMPIDA = "Resposta interrompida.";
const TEXTO_SEM_RESPOSTA = "A Orb terminou sem escrever nada. Tente de novo.";
const TEXTO_FALHA = "A Orb não conseguiu responder agora.";
const ERRO_DE_SESSAO = /sess[ãa]o expirada|not authenticated|jwt|unauthorized/i;
/** Folga para o último token pintar antes de trocar de tela. */
const PAUSA_ANTES_DE_NAVEGAR_MS = 400;

function nextId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `orb-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ehErroDeSessao(error: unknown): boolean {
  const bruto = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return ERRO_DE_SESSAO.test(bruto);
}

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
  onNavigate?: (target: OrbNavTargetLite) => void;
}

/**
 * Conversa com a Orb no mobile. `open_screen` navega via `onNavigate` depois do turno
 * (só se o mapa mobile aceitar o path).
 */
export function useOrbChat({ onNavigate }: UseOrbChatOptions = {}) {
  const [messages, setMessages] = useState<OrbMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesRef = useRef<OrbMessage[]>([]);
  const streamingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const navegacaoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navegarRef = useRef(onNavigate);
  useEffect(() => {
    navegarRef.current = onNavigate;
  }, [onNavigate]);

  const cancelarNavegacaoAgendada = useCallback(() => {
    if (navegacaoTimeoutRef.current === null) return;
    clearTimeout(navegacaoTimeoutRef.current);
    navegacaoTimeoutRef.current = null;
  }, []);

  useEffect(() => () => cancelarNavegacaoAgendada(), [cancelarNavegacaoAgendada]);

  const atualizar = useCallback((mudanca: (atual: OrbMessage[]) => OrbMessage[]) => {
    const proximo = mudanca(messagesRef.current);
    messagesRef.current = proximo;
    setMessages(proximo);
  }, []);

  const stop = useCallback(() => {
    cancelarNavegacaoAgendada();
    abortRef.current?.abort();
    abortRef.current = null;
  }, [cancelarNavegacaoAgendada]);

  const reset = useCallback(() => {
    stop();
    messagesRef.current = [];
    setMessages([]);
    streamingRef.current = false;
    setIsStreaming(false);
  }, [stop]);

  const rodarTurno = useCallback(
    async (historico: OrbMessage[]) => {
      cancelarNavegacaoAgendada();
      const replyId = nextId();
      atualizar(() => [
        ...historico,
        { id: replyId, role: "assistant", content: "", tools: [], pending: true },
      ]);
      streamingRef.current = true;
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;
      let destinoPendente: OrbNavTargetLite | null = null;

      const patchReply = (patch: (mensagem: OrbMessage) => OrbMessage) => {
        atualizar((atual) =>
          atual.map((mensagem) => (mensagem.id === replyId ? patch(mensagem) : mensagem))
        );
      };

      const marcarInterrompida = () => {
        destinoPendente = null;
        patchReply((mensagem) => ({
          ...closeRunningTools(mensagem),
          pending: false,
          interrupted: true,
          content: mensagem.content || TEXTO_INTERROMPIDA,
        }));
      };

      const agendarNavegacao = (destino: OrbNavTargetLite) => {
        cancelarNavegacaoAgendada();
        navegacaoTimeoutRef.current = setTimeout(() => {
          navegacaoTimeoutRef.current = null;
          navegarRef.current?.(destino);
        }, PAUSA_ANTES_DE_NAVEGAR_MS);
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
              patchReply((mensagem) => applyToolStart(mensagem, event));
            } else if (event.type === "tool" && event.phase === "done") {
              patchReply((mensagem) => applyToolDone(mensagem, event));
              if (
                event.name === ORB_NAVIGATION_TOOL_NAME &&
                event.ok !== false &&
                isOrbNavTargetLite(event.summary) &&
                mapOrbWebPathToMobile(event.summary.path)
              ) {
                destinoPendente = event.summary;
              }
            } else if (event.type === "done") {
              const usage = event.usage;
              if (isOrbUsage(usage)) patchReply((mensagem) => ({ ...mensagem, usage }));
            } else if (event.type === "error") {
              destinoPendente = null;
              patchReply((mensagem) => ({
                ...closeRunningTools(mensagem),
                pending: false,
                failed: true,
                errorKind: "generic",
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
            const fechada = { ...closeRunningTools(mensagem), pending: false };
            if (fechada.failed || fechada.content.trim()) return fechada;
            return { ...fechada, failed: true, errorKind: "generic", content: TEXTO_SEM_RESPOSTA };
          });
          if (destinoPendente) agendarNavegacao(destinoPendente);
        }
      } catch (error) {
        destinoPendente = null;
        if (controller.signal.aborted) {
          marcarInterrompida();
        } else {
          patchReply((mensagem) => ({
            ...closeRunningTools(mensagem),
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
    [atualizar, cancelarNavegacaoAgendada]
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
