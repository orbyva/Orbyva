import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Compass, History, Plus } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { OrbCapabilities, OrbCapabilitiesSeal } from "@/components/orb/OrbCapabilities";
import { OrbComposer, type OrbComposerHandle } from "@/components/orb/OrbComposer";
import { OrbMessageBubble } from "@/components/orb/OrbMessageBubble";
import { useAuth } from "@/hooks/useAuth";
import { useOrbContext } from "@/hooks/useOrb";
import { useOrbChat } from "@/hooks/useOrbChat";
import { cn } from "@/lib/utils";
import type { OrbMessage } from "@/types/orb";
// Fonte única das pílulas: o mesmo módulo serve o catálogo de prompts do servidor MCP
// (`mcp/prompts.ts`), para o texto não divergir entre o chat e o host.
import { ORB_SUGESTOES_DE_CHAT as SUGGESTIONS } from "../../../supabase/functions/_shared/orb/suggestions.ts";
// O teto do histórico é decisão do servidor; importar em vez de repetir o número aqui evita a marca
// de memória mentir no dia em que ele mudar. `messages.ts` é TS puro, sem import nem API de runtime.
import { MAX_HISTORY_MESSAGES } from "../../../supabase/functions/orb-agent/messages.ts";

/** Folga para considerar que o usuário está "no fim": ele ainda enxerga a última linha. */
const MARGEM_DE_FIM_PX = 80;
/** Sem isto, cada token do stream agenda uma rolagem e a lista treme. */
const INTERVALO_DE_ROLAGEM_MS = 50;

function saudacaoDaHora(hora: number): string {
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Primeiro nome vindo do `user_metadata` que já está em memória (o `useAuth` lê a sessão local, sem
 * ida à rede). Só nome de verdade conta: o prefixo do e-mail não é nome e chamar alguém de
 * "rafael.medeiros2001" é pior que a saudação neutra.
 */
function primeiroNome(metadata: Record<string, unknown> | undefined): string {
  for (const chave of ["full_name", "name"]) {
    const valor = metadata?.[chave];
    if (typeof valor === "string" && valor.trim()) return valor.trim().split(/\s+/)[0];
  }
  return "";
}

/**
 * Índice da primeira mensagem que ainda cabe no histórico reenviado ao servidor, ou `null` enquanto
 * a conversa inteira couber. É onde entra a marca "a Orb não lembra daqui para cima".
 *
 * A conta espelha o que o hook manda (bolha de erro e bolha vazia ficam de fora) e erra sempre para
 * o lado pessimista: o servidor ainda colapsa dois turnos do mesmo papel numa mensagem só, então
 * ele pode lembrar de um pouco mais do que a linha promete — prometer memória a mais seria pior.
 */
function indiceDoLimiteDeMemoria(messages: OrbMessage[]): number | null {
  const enviaveis: number[] = [];
  messages.forEach((mensagem, indice) => {
    if (mensagem.failed) return;
    if (!mensagem.content.trim()) return;
    enviaveis.push(indice);
  });
  if (enviaveis.length <= MAX_HISTORY_MESSAGES) return null;
  return enviaveis[enviaveis.length - MAX_HISTORY_MESSAGES];
}

export function OrbChat({ className }: { className?: string }) {
  /**
   * A conversa vem do `OrbProvider` — a MESMA que a barra lateral mostra. O `useOrbChat` local só
   * entra quando não há provider (teste de componente solto): hook não pode ser chamado dentro de
   * condicional, então os dois são chamados e um deles é ignorado.
   */
  const contexto = useOrbContext();
  const local = useOrbChat();
  const { messages, isStreaming, send, stop, reset, retry, editUserMessage } = contexto ?? local;
  const { user } = useAuth();
  const [painelAberto, setPainelAberto] = useState(false);
  const [confirmandoReset, setConfirmandoReset] = useState(false);
  const [estaNoFim, setEstaNoFim] = useState(true);

  const listaRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<OrbComposerHandle>(null);
  const estaNoFimRef = useRef(true);
  const ultimaRolagemRef = useRef(0);
  const timerDeRolagemRef = useRef<number | null>(null);

  const nome = primeiroNome(user?.user_metadata);
  const saudacao = saudacaoDaHora(new Date().getHours());
  const limiteDeMemoria = useMemo(() => indiceDoLimiteDeMemoria(messages), [messages]);

  const ultimaPergunta = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "user") return messages[i].content;
    }
    return "";
  }, [messages]);

  const irParaOFim = useCallback(() => {
    const container = listaRef.current;
    if (!container) return;
    // `scrollTop` direto, e não `scrollIntoView`: aquele rola todos os ancestrais roláveis junto
    // para alinhar o elemento, e a página inteira dava um pulo a cada token.
    container.scrollTop = container.scrollHeight;
  }, []);

  const marcarNoFim = useCallback((valor: boolean) => {
    if (estaNoFimRef.current === valor) return;
    estaNoFimRef.current = valor;
    setEstaNoFim(valor);
  }, []);

  const aoRolar = useCallback(() => {
    const container = listaRef.current;
    if (!container) return;
    marcarNoFim(
      container.scrollTop + container.clientHeight >= container.scrollHeight - MARGEM_DE_FIM_PX
    );
  }, [marcarNoFim]);

  const descer = useCallback(() => {
    marcarNoFim(true);
    ultimaRolagemRef.current = Date.now();
    irParaOFim();
  }, [irParaOFim, marcarNoFim]);

  /**
   * Auto-rolagem só enquanto o usuário está no fim: se ele subiu para reler, a conversa continua
   * crescendo embaixo sem arrastar a leitura dele. O `setTimeout` da cauda garante que o último
   * token também desce, mesmo tendo chegado dentro da janela do throttle.
   */
  useEffect(() => {
    if (!estaNoFimRef.current) return;

    const agora = Date.now();
    const espera = INTERVALO_DE_ROLAGEM_MS - (agora - ultimaRolagemRef.current);
    if (espera <= 0) {
      ultimaRolagemRef.current = agora;
      irParaOFim();
      return;
    }
    if (timerDeRolagemRef.current !== null) return;
    timerDeRolagemRef.current = window.setTimeout(() => {
      timerDeRolagemRef.current = null;
      ultimaRolagemRef.current = Date.now();
      if (estaNoFimRef.current) irParaOFim();
    }, espera);
  }, [messages, irParaOFim]);

  useEffect(
    () => () => {
      if (timerDeRolagemRef.current !== null) window.clearTimeout(timerDeRolagemRef.current);
    },
    []
  );

  const submit = (text: string) => {
    if (!text.trim() || isStreaming) return;
    // Mandar é intenção explícita de acompanhar a resposta: volta para o fim mesmo se subiu.
    descer();
    void send(text);
    composerRef.current?.focus();
  };

  /**
   * Editar uma pergunta refaz o turno a partir dela — mesma intenção de acompanhar a resposta que o
   * envio tem, então a lista volta para o fim. `useCallback` porque a bolha é `memo`: uma função
   * nova a cada render reparsearia o markdown de toda a conversa a cada token do stream.
   */
  const editarPergunta = useCallback(
    (messageId: string, texto: string) => {
      descer();
      void editUserMessage(messageId, texto);
    },
    [descer, editUserMessage]
  );

  const pedirNovaConversa = () => {
    if (messages.length === 0) {
      composerRef.current?.focus();
      return;
    }
    setConfirmandoReset(true);
  };

  const novaConversa = () => {
    reset();
    setConfirmandoReset(false);
    descer();
    composerRef.current?.focus();
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-3", className)}>
      <div className="flex shrink-0 items-center justify-between gap-1 border-b pb-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => setPainelAberto(true)}
        >
          <Compass className="size-4" aria-hidden />
          O que eu sei consultar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={pedirNovaConversa}
        >
          <Plus className="size-4" aria-hidden />
          Nova conversa
        </Button>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={listaRef}
          onScroll={aoRolar}
          className="h-full space-y-4 overflow-y-auto overscroll-contain pr-1"
        >
          {messages.length === 0 ? (
            <div className="flex min-h-full flex-col items-center justify-center gap-5 py-8 text-center">
              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold tracking-tight">
                  {nome ? `${saudacao}, ${nome}.` : `${saudacao}.`}
                </h2>
                <p className="mx-auto max-w-md text-sm text-muted-foreground">
                  Pergunte o que quiser sobre o que já está no seu Orbyva: finanças, tarefas,
                  agenda, viagens, lugares, carro, compras, saúde, notas, filmes e livros. Eu
                  consulto e respondo com o número real.
                </p>
              </div>

              <OrbCapabilitiesSeal />

              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => submit(suggestion)}
                    className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              <Button
                type="button"
                variant="link"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setPainelAberto(true)}
              >
                Ver tudo que eu sei consultar
              </Button>
            </div>
          ) : (
            messages.map((message, indice) => (
              <Fragment key={message.id}>
                {indice === limiteDeMemoria ? (
                  <div className="flex items-center gap-3 py-1 text-[11px] text-muted-foreground">
                    <span className="h-px flex-1 bg-border" aria-hidden />
                    <span className="flex items-center gap-1.5 text-center">
                      <History className="size-3 shrink-0" aria-hidden />
                      A Orb não lembra das mensagens acima daqui
                    </span>
                    <span className="h-px flex-1 bg-border" aria-hidden />
                  </div>
                ) : null}
                <OrbMessageBubble
                  message={message}
                  onRetry={retry}
                  onEdit={editarPergunta}
                  isStreaming={isStreaming}
                />
              </Fragment>
            ))
          )}
        </div>

        {!estaNoFim ? (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={descer}
            aria-label="Ir para a última mensagem"
            className="absolute bottom-3 left-1/2 size-9 -translate-x-1/2 rounded-full border shadow-md"
          >
            <ChevronDown className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>

      <OrbComposer
        handleRef={composerRef}
        onSubmit={submit}
        isStreaming={isStreaming}
        onStop={stop}
        lastQuestion={ultimaPergunta}
      />

      <OrbCapabilities open={painelAberto} onOpenChange={setPainelAberto} />

      <AlertDialog open={confirmandoReset} onOpenChange={setConfirmandoReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Começar uma conversa nova?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta conversa some da tela — ela ainda não fica salva em lugar nenhum.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar aqui</AlertDialogCancel>
            <AlertDialogAction onClick={novaConversa}>Nova conversa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
