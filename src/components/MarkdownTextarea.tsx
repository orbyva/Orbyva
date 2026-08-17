import type { KeyboardEvent, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type MarkdownTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
> & {
  value: string;
  onChange: (value: string) => void;
};

/**
 * Textarea de Markdown cru compartilhada (descrição de tarefa e corpo de nota).
 *
 * `Tab` insere `\t` no cursor (substituindo a seleção) e `Shift+Tab` remove um tab antes do cursor,
 * em vez do padrão do browser (mover o foco) — indentar lista aninhada e bloco de código sem sair
 * do campo. `setRangeText` atualiza o DOM antes do re-render, então o React não reposiciona o
 * cursor pro fim do texto.
 */
export function MarkdownTextarea({
  value,
  onChange,
  className,
  ...props
}: MarkdownTextareaProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const textarea = e.currentTarget;
    const { selectionStart, selectionEnd } = textarea;
    if (e.shiftKey) {
      if (selectionStart !== selectionEnd || textarea.value[selectionStart - 1] !== "\t")
        return;
      textarea.setRangeText("", selectionStart - 1, selectionStart, "end");
    } else {
      textarea.setRangeText("\t", selectionStart, selectionEnd, "end");
    }
    onChange(textarea.value);
  };

  return (
    <textarea
      {...props}
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className
      )}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
    />
  );
}
