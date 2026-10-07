import { useCallback, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, Compass, Maximize2, Plus } from "lucide-react";

import { OrbComposer, type OrbComposerHandle } from "@/components/orb/OrbComposer";
import { OrbSphere } from "@/components/orb/OrbSphere";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { useSidebar } from "@/components/ui/sidebar";
import { useOrbContext } from "@/hooks/useOrb";
import { cn } from "@/lib/utils";
import { ORB_SUGESTOES_DE_CHAT } from "../../../supabase/functions/_shared/orb/suggestions.ts";

/** Quantas mensagens o dock mostra. O resto continua vivo — só não cabe numa coluna de 16rem. */
const MENSAGENS_VISIVEIS = 8;

/**
 * As duas primeiras sugestões da lista compartilhada — a MESMA que a `/orb` e o servidor MCP usam.
 * Duas, e não seis: numa coluna de 16rem, a terceira já empurra o campo de escrever para fora da
 * primeira dobra.
 */
const ATALHOS = ORB_SUGESTOES_DE_CHAT.slice(0, 2);

/**
 * Quantas consultas estão rodando agora. É contagem, e não o nome da tool, por causa do bundle: o
 * rótulo humano mora em `registry.ts`, e importá-lo aqui traria os 34 `run` (SQL e nomes de coluna)
 * para o chunk PRINCIPAL — o dock vive na barra lateral, que não é lazy. Quem quer ver qual consulta
 * rodou abre a tela cheia, onde o cartão de ferramenta já mostra tudo.
 */
function consultasEmCurso(tools: { status: string }[] | undefined): number {
  return tools?.filter((tool) => tool.status === "running").length ?? 0;
}

/**
 * A Orb morando na barra lateral (feature 100).
 *
 * A conversa é a MESMA da tela `/orb` — as duas leem o `OrbProvider`. Este componente é só a
 * janela estreita dela: transcrição curta, campo compacto e um atalho para a tela cheia.
 */
export function OrbSidebarDock() {
  const orb = useOrbContext();
  const navigate = useNavigate();
  const { state, isMobile, setOpen } = useSidebar();
  const composerRef = useRef<OrbComposerHandle>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const registrar = orb?.registerComposer;
  useEffect(() => {
    if (!registrar) return;
    registrar(() => composerRef.current?.focus());
    return () => registrar(null);
  }, [registrar]);

  // Sem `?? []` na atribuição: um array novo a cada render invalidaria os `useMemo` abaixo sempre.
  const mensagens = orb?.messages;
  const visiveis = useMemo(() => (mensagens ?? []).slice(-MENSAGENS_VISIVEIS), [mensagens]);

  /** Rola para a última linha a cada token e ao reabrir — na coluna estreita, o que importa é o fim. */
  const dockAberto = orb?.dockOpen;
  useEffect(() => {
    const container = listaRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [mensagens, dockAberto]);

  const ultimaPergunta = useMemo(() => {
    const lista = mensagens ?? [];
    for (let i = lista.length - 1; i >= 0; i -= 1) {
      if (lista[i].role === "user") return lista[i].content;
    }
    return "";
  }, [mensagens]);

  const enviar = useCallback(
    (texto: string) => {
      if (!orb) return;
      orb.setDockOpen(true);
      void orb.send(texto);
    },
    [orb]
  );

  // Sem provider (teste de componente solto, ou o dock fora do AdminLayout) não há conversa para
  // mostrar: melhor não renderizar nada do que uma casca que não responde.
  if (!orb) return null;

  const colapsada = state === "collapsed" && !isMobile;
  if (colapsada) {
    return (
      <button
        type="button"
        onClick={() => {
          // Na barra em modo ícone não cabe conversa: abrir a barra é o que dá acesso ao campo.
          setOpen(true);
          orb.openDock();
        }}
        title="Falar com a Orb"
        aria-label="Falar com a Orb"
        className="mx-auto flex size-8 items-center justify-center rounded-full"
      >
        <OrbSphere size={28} state={orb.isStreaming ? "thinking" : "idle"} />
      </button>
    );
  }

  const ultima = visiveis[visiveis.length - 1];
  const emCurso = orb.isStreaming ? consultasEmCurso(ultima?.tools) : 0;

  return (
    <Collapsible
      open={orb.dockOpen}
      onOpenChange={orb.setDockOpen}
      className="rounded-xl border bg-sidebar-accent/40 p-2 transition-shadow duration-300 data-[state=open]:shadow-sm"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => orb.openDock()}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <OrbSphere size={30} state={orb.isStreaming ? "thinking" : "idle"} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-tight">Orb</span>
            <span className="block truncate text-[11px] leading-tight text-muted-foreground">
              {orb.isStreaming
                ? emCurso > 0
                  ? `consultando seus dados (${emCurso})…`
                  : "pensando…"
                : "pergunte ou peça uma tela"}
            </span>
          </span>
        </button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground"
          onClick={() => orb.setDockOpen(!orb.dockOpen)}
          aria-label={orb.dockOpen ? "Recolher a Orb" : "Abrir a Orb"}
          aria-expanded={orb.dockOpen}
        >
          <ChevronDown
            className={cn("size-4 transition-transform", !orb.dockOpen && "-rotate-90")}
            aria-hidden
          />
        </Button>
      </div>

      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down motion-reduce:animate-none">
        <div className="flex flex-col gap-2 pt-2 animate-in fade-in-0 slide-in-from-top-2 duration-300 motion-reduce:animate-none">
          {visiveis.length > 0 ? (
            <div
              ref={listaRef}
              className="max-h-[32vh] space-y-2 overflow-y-auto overscroll-contain pr-0.5"
            >
              {visiveis.map((mensagem) => (
                <OrbDockMessage key={mensagem.id} role={mensagem.role} content={mensagem.content} />
              ))}
              {orb.isStreaming && !ultima?.content ? (
                <p className="flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
                  <span className="size-1 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                  <span className="size-1 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                  <span className="size-1 animate-bounce rounded-full bg-current" />
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {ATALHOS.map((atalho) => (
                <button
                  key={atalho}
                  type="button"
                  onClick={() => enviar(atalho)}
                  className="rounded-lg border bg-background px-2 py-1.5 text-left text-[11px] leading-snug text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {atalho}
                </button>
              ))}
            </div>
          )}

          {orb.lastNavigation ? (
            <Link
              to={orb.lastNavigation.path}
              className="flex items-center gap-1.5 truncate rounded-lg bg-background/70 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Compass className="size-3 shrink-0" aria-hidden />
              <span className="truncate">Abri {orb.lastNavigation.label}</span>
            </Link>
          ) : null}

          <OrbComposer
            handleRef={composerRef}
            compact
            onSubmit={enviar}
            isStreaming={orb.isStreaming}
            onStop={orb.stop}
            lastQuestion={ultimaPergunta}
            placeholder="Pergunte ou peça uma tela…"
          />

          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
              onClick={() => navigate("/orb")}
            >
              <Maximize2 className="size-3" aria-hidden />
              Tela cheia
            </Button>
            {visiveis.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
                onClick={() => orb.reset()}
              >
                <Plus className="size-3" aria-hidden />
                Nova
              </Button>
            ) : null}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Uma linha da transcrição compacta. Sem markdown de propósito: numa coluna de 16rem, tabela e
 * lista viram sopa — quem quer ler a resposta formatada abre a tela cheia, que é um clique.
 */
function OrbDockMessage({ role, content }: { role: string; content: string }) {
  if (!content.trim()) return null;
  if (role === "user") {
    return (
      <p className="ml-auto max-w-[92%] whitespace-pre-wrap break-words rounded-lg rounded-br-sm bg-primary px-2 py-1 text-[11px] leading-snug text-primary-foreground">
        {content}
      </p>
    );
  }
  return (
    <p className="max-w-full whitespace-pre-wrap break-words rounded-lg rounded-bl-sm bg-background px-2 py-1 text-[11px] leading-snug text-foreground">
      {content}
    </p>
  );
}
