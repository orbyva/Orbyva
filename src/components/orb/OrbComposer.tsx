import { useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { ArrowUp, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Teto do campo: acima disso ele rola por dentro em vez de comer a conversa. */
const ALTURA_MAXIMA_PX = 168;
const ALTURA_MAXIMA_COMPACTA_PX = 96;

export interface OrbComposerHandle {
  focus: () => void;
  /** Escreve no campo sem enviar — é como as pílulas de sugestão devolvem o texto para edição. */
  setDraft: (texto: string) => void;
}

export interface OrbComposerProps {
  onSubmit: (texto: string) => void;
  isStreaming: boolean;
  onStop: () => void;
  /** Última pergunta do usuário, para o ↑ de campo vazio (histórico de terminal). */
  lastQuestion?: string;
  /** Versão da barra lateral: menor, sem a linha de atalhos. */
  compact?: boolean;
  placeholder?: string;
  className?: string;
  handleRef?: Ref<OrbComposerHandle>;
}

/**
 * O campo de escrever para a Orb — um só, usado pela tela `/orb` e pelo dock da barra lateral.
 *
 * Ele guarda o próprio rascunho de propósito: os dois lugares onde a Orb aparece têm rascunhos
 * independentes (quem começou a escrever na barra lateral não perde o texto ao abrir a `/orb`),
 * enquanto a CONVERSA é a mesma nos dois — ela vive no `OrbProvider`.
 */
export function OrbComposer({
  onSubmit,
  isStreaming,
  onStop,
  lastQuestion,
  compact = false,
  placeholder = "Fale com a Orb…",
  className,
  handleRef,
}: OrbComposerProps) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tetoPx = compact ? ALTURA_MAXIMA_COMPACTA_PX : ALTURA_MAXIMA_PX;

  useImperativeHandle(handleRef, () => ({
    focus: () => textareaRef.current?.focus(),
    setDraft: (texto: string) => {
      setDraft(texto);
      textareaRef.current?.focus();
    },
  }));

  /** O campo cresce com o texto até o teto — `auto` primeiro, senão ele nunca encolhe de volta. */
  useLayoutEffect(() => {
    const campo = textareaRef.current;
    if (!campo) return;
    campo.style.height = "auto";
    campo.style.height = `${Math.min(campo.scrollHeight, tetoPx)}px`;
  }, [draft, tetoPx]);

  const enviar = () => {
    const texto = draft.trim();
    if (!texto || isStreaming) return;
    setDraft("");
    onSubmit(texto);
    textareaRef.current?.focus();
  };

  return (
    <form
      className={cn(
        "shrink-0 rounded-2xl border bg-card shadow-sm focus-within:border-ring/50",
        compact ? "p-1.5" : "p-2",
        className
      )}
      onSubmit={(event) => {
        event.preventDefault();
        enviar();
      }}
    >
      <div className="flex items-end gap-1.5">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              enviar();
              return;
            }
            if (event.key === "Escape" && draft) {
              event.preventDefault();
              setDraft("");
              return;
            }
            // Campo vazio + seta para cima: traz a última pergunta de volta para editar, como no
            // histórico de um terminal. Não reenvia sozinha — quem decide é o Enter seguinte.
            if (event.key === "ArrowUp" && !draft && lastQuestion) {
              event.preventDefault();
              const campo = event.currentTarget;
              setDraft(lastQuestion);
              requestAnimationFrame(() => {
                campo.selectionStart = campo.value.length;
                campo.selectionEnd = campo.value.length;
              });
            }
          }}
          rows={1}
          placeholder={placeholder}
          aria-label="Mensagem para a Orb"
          className={cn(
            "flex-1 resize-none overflow-y-auto bg-transparent outline-none placeholder:text-muted-foreground",
            compact
              ? "max-h-24 min-h-[1.75rem] px-1.5 py-1 text-[13px]"
              : "max-h-[10.5rem] min-h-[2.25rem] px-2 py-2 text-sm"
          )}
        />
        {isStreaming ? (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={onStop}
            aria-label="Parar"
            className={compact ? "size-7 shrink-0" : undefined}
          >
            <Square className={compact ? "size-3" : "size-4"} aria-hidden />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            disabled={!draft.trim()}
            aria-label="Enviar"
            className={compact ? "size-7 shrink-0" : undefined}
          >
            <ArrowUp className={compact ? "size-3.5" : "size-4"} aria-hidden />
          </Button>
        )}
      </div>
      {compact ? null : (
        <p className="px-2 pb-0.5 pt-1 text-[11px] text-muted-foreground">
          Enter envia · Shift+Enter quebra linha
          <span className="hidden sm:inline"> · Esc limpa · ↑ repete a última pergunta</span>
        </p>
      )}
    </form>
  );
}
