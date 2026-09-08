import { useEffect, useRef, useState } from "react";
import { MarkdownTextarea } from "@/components/MarkdownTextarea";
import { stripMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";

/** Alvo de clique de uma tarefa **sem** descrição (feature 100). Hoje o `<p>` simplesmente não é
 * renderizado, então não há onde clicar — mesmo padrão do "+ Prazo" do `TaskDueQuickEdit` e do
 * badge "Sem projeto" da 029. */
export const ADD_DESCRIPTION_LABEL = "+ Descrição";

interface TaskDescriptionInlineEditProps {
  value: string | null;
  /** Markdown **cru**, como está no banco — o card volta a mostrar o `stripMarkdown` assim que
   * salva. String vazia é válida (apagar a descrição é uma edição legítima). */
  onChange: (description: string) => void | Promise<void>;
  /**
   * Título da tarefa, só para compor o nome acessível do "+ Descrição" — sem ele, uma lista de
   * dez tarefas sem descrição teria dez botões chamados "Adicionar descrição", e o `+` de quick add
   * da 098 (que também se chama "Adicionar descrição") ficaria indistinguível deles. Com descrição
   * escrita, quem dá o contexto é a própria prévia.
   */
  taskTitle?: string;
  className?: string;
}

/**
 * Descrição editável no próprio card (feature 100): clicar na prévia (ou no "+ Descrição", quando
 * não há nenhuma) troca o texto por um `MarkdownTextarea` ali mesmo, sem abrir o dialog da tarefa.
 *
 * Regras de teclado **opostas às do título**, e é por isso que não existe um `InlineEditText`
 * genérico: aqui `Enter` puro quebra linha (descrição é multilinha; Enter-salva impediria escrever
 * uma lista) e quem salva é `Ctrl/Cmd+Enter` ou o blur. Escape cancela, com a mesma flag lida pelo
 * `onBlur` que protege o título do defeito do `DimensionsBoard`.
 *
 * Markdown cru, **sem** as abas Escrever/Visualizar do `TaskDescriptionField`: duas abas dentro de
 * uma linha de lista é o oposto de "sem abrir o modal".
 *
 * Consequência assumida: dentro do `MarkdownTextarea` o `Tab` indenta em vez de sair do campo (é o
 * comportamento dele no formulário e nas notas). A saída é Escape ou clicar fora.
 */
export function TaskDescriptionInlineEdit({
  value,
  onChange,
  taskTitle,
  className,
}: TaskDescriptionInlineEditProps) {
  const current = value ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current);
  const cancelledRef = useRef(false);
  const refocusRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing || !refocusRef.current) return;
    refocusRef.current = false;
    buttonRef.current?.focus();
  }, [editing]);

  function open() {
    setDraft(current);
    cancelledRef.current = false;
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setDraft(current);
      return;
    }
    // Sem `trim()`: em Markdown, dois espaços no fim da linha *são* uma quebra de linha.
    if (draft === current) return;
    void onChange(draft);
  }

  /**
   * Atalhos captados no contêiner, e não na textarea, porque o `MarkdownTextarea` compartilhado
   * sobrescreve o `onKeyDown` que recebe por prop (ele precisa do próprio, que indenta no `Tab`) —
   * mesma solução da tira de quick add da 098. O evento borbulha até aqui do mesmo jeito.
   *
   * Os dois atalhos terminam no mesmo `blur()`, para haver uma rota de salvamento só (a do
   * `onBlur`): `Ctrl/Cmd+Enter` grava, `Escape` marca o cancelamento antes e o `onBlur` descarta.
   */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      refocusRef.current = true;
      boxRef.current?.querySelector("textarea")?.blur();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelledRef.current = true;
      refocusRef.current = true;
      boxRef.current?.querySelector("textarea")?.blur();
    }
  }

  if (editing) {
    return (
      <div
        ref={boxRef}
        className={className}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <MarkdownTextarea
          autoFocus
          aria-label="Descrição"
          rows={3}
          value={draft}
          onChange={setDraft}
          // Cursor no fim do texto, como no título: `autoFocus` sozinho deixaria o cursor na
          // posição 0 e continuar escrevendo uma descrição existente inseriria no começo dela.
          onFocus={(e) => {
            const end = e.currentTarget.value.length;
            e.currentTarget.setSelectionRange(end, end);
          }}
          onBlur={commit}
          placeholder="Descrição (Markdown)"
          className="min-h-0 text-xs"
        />
      </div>
    );
  }

  const preview = current ? stripMarkdown(current) : "";
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={
        preview
          ? `Editar descrição: ${preview}`
          : taskTitle
            ? `Adicionar descrição: ${taskTitle}`
            : "Adicionar descrição"
      }
      onClick={(e) => {
        e.stopPropagation();
        open();
      }}
      className={cn(
        "line-clamp-2 rounded-sm text-left text-xs text-muted-foreground hover:bg-muted",
        !preview && "text-muted-foreground/70",
        className
      )}
    >
      {preview || ADD_DESCRIPTION_LABEL}
    </button>
  );
}
