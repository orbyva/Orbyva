import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Aviso de título vazio (feature 100). Exportado porque quem mostra o toast é a página, e o
 * texto precisa ser o mesmo em `TaskList`, `ProjectDetail` e nos testes. */
export const TASK_TITLE_EMPTY_MESSAGE = "O título não pode ficar vazio";

interface TaskTitleInlineEditProps {
  value: string;
  /** Só é chamado quando o título **mudou de verdade** e não está em branco — ver `commit()`. */
  onChange: (title: string) => void | Promise<void>;
  /** Tarefa concluída: mantém o `line-through` que o `<p>` de hoje tem. Continua editável de
   * propósito (corrigir o nome de algo já feito faz sentido; reagendar não faz — por isso o prazo
   * trava e o título não). */
  done?: boolean;
  /** Título em branco/só espaço: o valor anterior volta e a mensagem sobe por aqui. Ausente = o
   * componente só restaura, em silêncio. */
  onInvalid?: (message: string) => void;
  className?: string;
}

/**
 * Título editável no próprio card (feature 100): clicar no texto troca ele por um `<Input>` ali
 * mesmo, sem abrir o dialog completo da tarefa.
 *
 * O estado de leitura é um `<button type="button">`, e não um `<p onClick>`: sem isso o `Tab` não
 * alcança e Enter/Espaço não ativam, e o atalho nasceria inacessível por teclado. O clique para
 * aqui (`stopPropagation`), como todos os controles inline da linha, senão o `onClick` do card
 * abriria o dialog junto.
 *
 * **Uma rota de salvamento só: o `onBlur`.** Enter chama `e.currentTarget.blur()` (o caminho do
 * `BookDetailDialog`) e Escape também — mas marcando antes a flag `cancelledRef`, que o `onBlur`
 * lê para **não** salvar. É exatamente o defeito latente de `DimensionsBoard.tsx:796-826`, onde
 * Escape desmonta um input cujo `onBlur` grava: lá, cancelar salva. Aqui não, e há teste próprio
 * pra isso (`TaskTitleInlineEdit.test.tsx`).
 */
export function TaskTitleInlineEdit({
  value,
  onChange,
  done,
  onInvalid,
  className,
}: TaskTitleInlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  /** Escape marcado **antes** do `blur()`: o `onBlur` que vem em seguida vê isto e descarta o
   * rascunho em vez de gravá-lo. */
  const cancelledRef = useRef(false);
  /** Saiu pelo teclado (Enter/Escape) — o foco volta pro botão. Num blur causado por clique fora
   * isso fica `false`, senão a edição roubaria o foco de onde o usuário acabou de clicar. */
  const refocusRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  /** O botão só volta ao DOM no render em que o input sai, então o foco tem de ser devolvido
   * depois do commit — mesmo motivo do `refocusPlusRef` do `TaskQuickAdd` (feature 098). */
  useEffect(() => {
    if (editing || !refocusRef.current) return;
    refocusRef.current = false;
    buttonRef.current?.focus();
  }, [editing]);

  function open() {
    setDraft(value);
    cancelledRef.current = false;
    setEditing(true);
  }

  /**
   * O único ponto de gravação. Três desfechos:
   * - cancelado (Escape): nada é salvo e o rascunho volta ao valor atual;
   * - em branco/só espaço: também não salva (`title` é `not null` no banco, e uma linha sem nome é
   *   um item impossível de reencontrar) e avisa por `onInvalid` — diferente do guard silencioso de
   *   `handleSave`, porque aqui o usuário apagou de propósito e merece saber por que não colou;
   * - inalterado: no-op, pra não gastar round-trip nem carimbar `updated_at` à toa (com
   *   `sortKey = "updated"` isso moveria a linha por nada).
   */
  function commit() {
    setEditing(false);
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setDraft(value);
      return;
    }
    const trimmed = draft.trim();
    if (!trimmed) {
      setDraft(value);
      onInvalid?.(TASK_TITLE_EMPTY_MESSAGE);
      return;
    }
    if (trimmed === value) return;
    void onChange(trimmed);
  }

  if (editing) {
    return (
      <Input
        autoFocus
        aria-label="Título"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        // Cursor no fim, não select-all: quem clica no título quase sempre quer corrigir uma
        // palavra, não substituir a frase inteira.
        onFocus={(e) => {
          const end = e.currentTarget.value.length;
          e.currentTarget.setSelectionRange(end, end);
        }}
        onClick={(e) => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            refocusRef.current = true;
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancelledRef.current = true;
            refocusRef.current = true;
            e.currentTarget.blur();
          }
        }}
        className={cn("h-7 min-w-0 py-0 text-sm font-medium", className)}
      />
    );
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={`Editar título: ${value}`}
      onClick={(e) => {
        e.stopPropagation();
        open();
      }}
      className={cn(
        "truncate rounded-sm text-left font-medium hover:bg-muted",
        done && "text-muted-foreground line-through",
        className
      )}
    >
      {value}
    </button>
  );
}
