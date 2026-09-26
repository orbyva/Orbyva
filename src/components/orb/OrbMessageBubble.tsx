import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, Copy, Gauge, LogIn, Pencil, RotateCcw } from "lucide-react";

import { OrbActionCard } from "@/components/orb/OrbActionCard";
import { OrbClarifyCard } from "@/components/orb/OrbClarifyCard";
import { OrbToolCall } from "@/components/orb/OrbToolCall";
import { OrbResultView } from "@/components/orb/results/OrbResultView";
import { Button } from "@/components/ui/button";
import { orbResultView } from "@/domain/orb/results";
import {
  isOrbProposal,
  ORB_CREATE_TOOL_NAME,
} from "../../../supabase/functions/_shared/orb/actions.ts";
import {
  isOrbAskUser,
  ORB_ASK_USER_TOOL_NAME,
} from "../../../supabase/functions/_shared/orb/clarify.ts";
import type { OrbAskUser } from "../../../supabase/functions/_shared/orb/clarify.ts";
import { formatarTokens } from "@/domain/orb/stream";
import { cn } from "@/lib/utils";
import type { OrbMessage } from "@/types/orb";

interface OrbMessageBubbleProps {
  message: OrbMessage;
  /** `retry` do `useOrbChat`. Opcional: sem ele a barra de ações fica só com "Copiar". */
  onRetry?: (messageId: string) => void;
  /**
   * `editUserMessage` do `useOrbChat`. Opcional: sem ele a pergunta fica só com "Copiar" — é o que
   * acontece em qualquer lugar que monte a bolha fora da conversa completa.
   */
  onEdit?: (messageId: string, texto: string) => void;
  /**
   * Resposta a um `ask_user` (feature 107): chip clicado vira a próxima mensagem do chat.
   * Opcional — sem ele o cartão aparece sem chips clicáveis.
   */
  onAskReply?: (texto: string) => void;
  /**
   * Turno em curso. O hook ignora edição enquanto estiver em stream, então o botão nem aparece:
   * botão que não faz nada é pior que botão ausente.
   */
  isStreaming?: boolean;
}

/** Quanto tempo o botão de copiar fica dizendo "Copiado". */
const FEEDBACK_MS = 2000;

/** Teto do editor inline, igual ao do campo de escrever: acima disso ele rola por dentro. */
const ALTURA_MAXIMA_DO_EDITOR_PX = 168;

/**
 * Rodapé de consumo do turno. `input_tokens` do Gemini (`promptTokenCount`) já inclui o que veio do
 * cache, então os dois números são "do total, tanto foi cache" — é assim que dá para ver o prompt
 * caching funcionando de verdade, em vez de confiar que ele está ligado.
 */
function partesDeUso(message: OrbMessage): string[] {
  const usage = message.usage;
  if (!usage) return [];

  const partes: string[] = [];
  const contexto = formatarTokens(usage.input_tokens);
  if (contexto) partes.push(`≈ ${contexto} tokens de contexto`);

  const cache = usage.cache_read_input_tokens;
  if (cache && cache > 0) {
    const formatado = formatarTokens(cache);
    if (formatado) partes.push(`${formatado} vindos do cache`);
  }

  if (usage.rounds && usage.rounds > 1) partes.push(`${usage.rounds} rodadas`);
  return partes;
}

/**
 * `react-markdown` + GFM direto, em vez do `MarkdownPreview` do módulo de Notas: aquele carrega
 * mermaid, KaTeX e o registro de blocos customizados, que não têm uso numa resposta de chat e
 * pesariam no chunk de `/orb`. HTML cru continua desligado (sem `rehype-raw`), como no resto do app.
 *
 * `memo` não é otimização de luxo: cada token do stream troca a lista inteira de mensagens, e sem
 * ele todas as bolhas reparseiam o markdown acumulado a cada chunk — custo quadrático que trava a
 * tela numa resposta longa.
 */
export const OrbMessageBubble = memo(function OrbMessageBubble({
  message,
  onRetry,
  onEdit,
  onAskReply,
  isStreaming = false,
}: OrbMessageBubbleProps) {
  const [copiado, setCopiado] = useState(false);
  const [editando, setEditando] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const copiar = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      return; // Sem permissão de clipboard não há o que avisar aqui além de não mudar o botão.
    }
    setCopiado(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopiado(false), FEEDBACK_MS);
  }, [message.content]);

  if (message.role === "user") {
    if (editando) {
      return (
        <OrbQuestionEditor
          texto={message.content}
          onCancel={() => setEditando(false)}
          onSave={(texto) => {
            setEditando(false);
            // Texto igual não vale um turno: reenviar apagaria as respostas seguintes para
            // recomprar exatamente a mesma pergunta. Quem quer refazer usa "Tentar de novo".
            if (texto !== message.content.trim()) onEdit?.(message.id, texto);
          }}
        />
      );
    }

    return (
      <div className="group flex flex-col items-end gap-1">
        <div className="max-w-[92%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground sm:max-w-[85%]">
          {message.content}
        </div>
        {/* Mesma barra da resposta: escondida até o hover/foco no mouse, sempre visível no toque. */}
        <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void copiar()}
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground [&_svg]:size-3.5"
          >
            {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copiado ? "Copiado" : "Copiar"}
          </Button>
          {onEdit && !isStreaming ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditando(true)}
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground [&_svg]:size-3.5"
            >
              <Pencil aria-hidden />
              Editar
            </Button>
          ) : null}
          <span aria-live="polite" className="sr-only">
            {copiado ? "Pergunta copiada" : ""}
          </span>
        </div>
      </div>
    );
  }

  /**
   * Resultados que sabem virar cartão (feature 100). Ficam DEPOIS do texto: a Orb responde primeiro
   * ("são 12 tarefas, 3 vencem hoje") e o cartão mostra quais — a ordem inversa faria a pessoa ler
   * a lista antes de saber o que ela é. Tool sem adaptador não aparece aqui: ela continua sendo o
   * cartão de consulta, que abre com a tabela crua.
   */
  const visoes = (message.tools ?? [])
    .filter((tool) => tool.status === "ok")
    .map((tool) => ({ id: tool.id, view: orbResultView(tool.name, tool.summary) }))
    .filter((item): item is { id: string; view: NonNullable<ReturnType<typeof orbResultView>> } =>
      item.view !== null
    );

  /** Propostas de criação deste turno — cada uma vira um cartão com "Criar". */
  const propostas = (message.tools ?? [])
    .filter((tool) => tool.name === ORB_CREATE_TOOL_NAME && tool.status === "ok")
    .filter((tool) => isOrbProposal(tool.summary))
    .map((tool) => ({ id: tool.id, proposal: tool.summary as never }));

  /** Perguntas tipadas (`ask_user`) — cartão com chips. */
  const perguntas = (message.tools ?? [])
    .filter((tool) => tool.name === ORB_ASK_USER_TOOL_NAME && tool.status === "ok")
    .filter((tool) => isOrbAskUser(tool.summary))
    // O `filter` acima já provou a forma, mas o type guard mira `tool.summary` e não estreita
    // `tool`: o cast é o que leva essa prova até aqui. Tipado, ao contrário do `as never` das
    // propostas — se `OrbAskUser` mudar, este ponto passa a acusar.
    .map((tool) => ({ id: tool.id, ask: tool.summary as OrbAskUser }));

  /**
   * Criação que falhou (faltou campo, categoria inexistente…): a barra amarela colapsada esconde
   * o motivo. Sem isto, a pessoa só vê "Criar (com confirmação)" em 0ms e acha que a Orb não cria.
   */
  const falhasDeCriacao = (message.tools ?? [])
    .filter((tool) => tool.name === ORB_CREATE_TOOL_NAME && tool.status === "error")
    .map((tool) => {
      const summary = tool.summary;
      const mensagem =
        summary &&
        typeof summary === "object" &&
        !Array.isArray(summary) &&
        typeof (summary as { error?: unknown }).error === "string"
          ? (summary as { error: string }).error
          : "Não consegui preparar essa criação.";
      return { id: tool.id, mensagem };
    });

  const showThinking = message.pending && !message.content;
  const podeTentarDeNovo = !message.pending && (message.failed || message.interrupted);
  const sessaoCaiu = message.failed && message.errorKind === "session";
  const uso = message.pending ? [] : partesDeUso(message);
  const mostrarBarra = !message.pending && message.content.trim() !== "";

  return (
    <div className="group flex min-w-0 flex-col gap-1.5">
      {message.tools && message.tools.length > 0 ? (
        <div className="flex flex-col gap-1">
          {message.tools.map((tool) => (
            <OrbToolCall key={tool.id} tool={tool} />
          ))}
        </div>
      ) : null}

      <div
        className={cn(
          "max-w-full rounded-2xl rounded-bl-sm border bg-card px-4 py-3 text-sm",
          message.failed && "border-destructive/40 bg-destructive/5"
        )}
      >
        {showThinking ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="sr-only">A Orb está pensando</span>
            <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-current" />
          </span>
        ) : (
          <div className="flex items-start gap-2">
            {message.failed ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            ) : null}
            {/* O texto do erro vem depois do que a Orb chegou a escrever, então ele também passa
                pelo markdown — não é mais uma frase de uma linha. */}
            <div className="min-w-0 flex-1 space-y-2 break-words [&_a]:underline [&_li]:ml-4 [&_li]:list-disc [&_ol_li]:list-decimal [&_strong]:font-semibold [&_table]:w-full [&_td]:border-b [&_td]:py-1 [&_th]:border-b [&_th]:py-1 [&_th]:text-left">
              {message.failed ? <span className="sr-only">Erro:</span> : null}
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>

      {perguntas.length > 0 ? (
        <div className="flex flex-col gap-2">
          {perguntas.map((item) => (
            <OrbClarifyCard
              key={item.id}
              ask={item.ask}
              onReply={onAskReply}
              disabled={isStreaming}
            />
          ))}
        </div>
      ) : null}

      {propostas.length > 0 ? (
        <div className="flex flex-col gap-2">
          {propostas.map((item) => (
            <OrbActionCard key={item.id} callId={item.id} proposal={item.proposal} />
          ))}
        </div>
      ) : null}

      {falhasDeCriacao.length > 0 ? (
        <div className="flex flex-col gap-2">
          {falhasDeCriacao.map((item) => (
            <div
              key={item.id}
              className="flex gap-2 rounded-xl border border-warning/40 bg-warning/5 px-3 py-2 text-[12px] text-foreground"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
              <p className="min-w-0 flex-1 break-words">{item.mensagem}</p>
            </div>
          ))}
        </div>
      ) : null}

      {visoes.length > 0 ? (
        <div className="flex flex-col gap-2">
          {visoes.map((item) => (
            <OrbResultView key={item.id} view={item.view} />
          ))}
        </div>
      ) : null}

      {uso.length > 0 ? (
        <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
          <Gauge className="size-3 shrink-0" aria-hidden />
          <span>{uso.join(" · ")}</span>
        </p>
      ) : null}

      {mostrarBarra ? (
        <div
          className={cn(
            "flex items-center gap-1",
            // Numa resposta que deu certo a barra só aparece no hover/foco (e sempre no toque, onde
            // hover não existe). Em resposta falha ou interrompida ela fica visível: o botão de
            // tentar de novo é a única saída, esconder seria o beco sem saída de antes.
            !podeTentarDeNovo &&
              "opacity-100 transition-opacity sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100"
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void copiar()}
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground [&_svg]:size-3.5"
          >
            {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copiado ? "Copiado" : "Copiar"}
          </Button>

          {podeTentarDeNovo && sessaoCaiu ? (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground [&_svg]:size-3.5"
            >
              {/* Sessão expirada: "tentar de novo" só repetiria o mesmo erro. */}
              <Link to="/login">
                <LogIn aria-hidden />
                Entrar de novo
              </Link>
            </Button>
          ) : podeTentarDeNovo && onRetry ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRetry(message.id)}
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground [&_svg]:size-3.5"
            >
              <RotateCcw aria-hidden />
              Tentar de novo
            </Button>
          ) : null}

          <span aria-live="polite" className="sr-only">
            {copiado ? "Resposta copiada" : ""}
          </span>
        </div>
      ) : null}
    </div>
  );
});

/**
 * Edição inline de uma pergunta já enviada (099, tarefa 3.3).
 *
 * O rascunho nasce e morre com o editor, num componente próprio: guardá-lo na bolha faria "cancelar"
 * esconder o texto descartado em vez de jogá-lo fora, e reabrir traria de volta o que a pessoa
 * acabou de desistir de mandar.
 *
 * Os atalhos são os mesmos do campo de escrever — Enter manda, Shift+Enter quebra linha, Esc
 * cancela — porque este editor aparece exatamente onde o outro não está, e duas gramáticas de
 * teclado para a mesma caixa de texto seria uma a mais.
 */
function OrbQuestionEditor({
  texto,
  onCancel,
  onSave,
}: {
  texto: string;
  onCancel: () => void;
  onSave: (texto: string) => void;
}) {
  const [draft, setDraft] = useState(texto);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** Cresce com o texto até o teto — `auto` primeiro, senão ele nunca encolhe de volta. */
  useLayoutEffect(() => {
    const campo = textareaRef.current;
    if (!campo) return;
    campo.style.height = "auto";
    campo.style.height = `${Math.min(campo.scrollHeight, ALTURA_MAXIMA_DO_EDITOR_PX)}px`;
  }, [draft]);

  /** Cursor no fim, e não selecionando tudo: quase toda edição é acrescentar uma condição. */
  useEffect(() => {
    const campo = textareaRef.current;
    if (!campo) return;
    campo.focus();
    campo.selectionStart = campo.value.length;
    campo.selectionEnd = campo.value.length;
  }, []);

  const salvar = () => {
    const limpo = draft.trim();
    if (!limpo) return;
    onSave(limpo);
  };

  return (
    <form
      className="flex justify-end"
      onSubmit={(event) => {
        event.preventDefault();
        salvar();
      }}
    >
      <div className="w-full max-w-[92%] rounded-2xl rounded-br-sm border bg-card p-2 shadow-sm focus-within:border-ring/50 sm:max-w-[85%]">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              salvar();
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
          rows={1}
          aria-label="Editar a pergunta"
          className="max-h-[10.5rem] w-full resize-none overflow-y-auto bg-transparent px-2 py-1.5 text-sm outline-none"
        />
        {/* A truncagem tem que ser dita ANTES do clique: a resposta que está na tela some. */}
        <p className="px-2 pb-1 pt-0.5 text-[11px] text-muted-foreground">
          Ao salvar, a conversa volta a partir daqui — o que veio depois desta pergunta é descartado.
        </p>
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="h-7 px-2 text-xs text-muted-foreground"
          >
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={!draft.trim()} className="h-7 px-2.5 text-xs">
            Salvar e enviar
          </Button>
        </div>
      </div>
    </form>
  );
}
