import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/FormLabel";
import { cn } from "@/lib/utils";
import { resolveLinkAppearance } from "@/domain/tasks";
import { useLinkIconRules } from "@/hooks/useLinkIconRules";
import { TaskIconBadge } from "./TaskIconBadge";
import type { TaskExternalLinkDraft } from "@/types/tasks";

/** Mensagem do blur quando a URL não começa com http(s) — afirmativa, dizendo o que fazer, e a
 * mesma frase que o campo único de link usava antes da 085. */
export const EXTERNAL_URL_HINT = "Comece com https://";
/** O `unique (task_id, url)` do banco barraria isto com um erro genérico de PostgREST; o aviso no
 * cliente diz o que aconteceu, na linha em que aconteceu. */
export const EXTERNAL_URL_DUPLICATE_HINT = "Este link já está na lista.";
/** Estado da prévia antes de haver o que prever — um chip fantasma (ícone genérico + rótulo vazio)
 * pareceria um link quebrado. */
export const EXTERNAL_LINK_PREVIEW_EMPTY = "A prévia aparece quando você colar o link";

/** Rota da tela de regras de ícone de link (feature 087). Constante para o teste apontar para o
 * mesmo lugar que o botão, em vez de repetir a string. */
export const LINK_ICON_RULES_PATH = "/tasks/link-icons";

/** Estado de UI de **uma** linha, mantido em paralelo à lista controlada.
 *
 * `preview` é a última URL **confirmada** (no blur, ou vinda de fora ao abrir a tarefa), não a que
 * está sendo digitada: é o que faz o rótulo da prévia parar de tremer a cada tecla. `error` é o
 * aviso de protocolo, que nasce no blur e some ao voltar a digitar — nunca acusa no meio da
 * digitação. */
interface RowUiState {
  preview: string;
  error: string | null;
}

function initialUi(drafts: readonly TaskExternalLinkDraft[]): RowUiState[] {
  return drafts.map((draft) => ({ preview: draft.url, error: null }));
}

/**
 * Lista editável dos links externos de uma tarefa (feature 085): por linha, a URL, o **campo livre
 * de comentário** que o pedido-mãe pede, a prévia de como o link vai aparecer no card, as setas de
 * ordem e o remover. Abaixo da lista, "Adicionar link".
 *
 * Componente **controlado e sem I/O** (`value`/`onChange` sobre `TaskExternalLinkDraft[]`): quem
 * grava é o `handleSave` do formulário, exatamente como acontece com as subtarefas. Assim a mesma
 * lista serve para tarefa nova (rascunho gravado depois do `createTask`) e para tarefa existente.
 *
 * Ordem por setas ↑/↓ e não arraste: a tela já tem lista de subtarefas e um Gantt arrastável, e
 * `position` é o que decide quais links viram chip no card.
 */
export function TaskExternalLinksField({
  value,
  onChange,
}: {
  value: TaskExternalLinkDraft[];
  onChange: (next: TaskExternalLinkDraft[]) => void;
}) {
  /** As regras da 087, do cache no módulo. A prévia se anuncia como "Assim aparece no card" — e o
   * card é decorado por regra desde a 087, então usar `describeExternalLink` aqui faria a prévia
   * mentir exatamente quando a regra é nova. */
  const rules = useLinkIconRules();
  const [ui, setUi] = useState<RowUiState[]>(() => initialUi(value));
  /** A última lista que **nós** emitimos. Serve para distinguir "o valor mudou porque o usuário
   * digitou aqui" de "o valor foi trocado por fora" (abrir outra tarefa, carregar os links do
   * banco) — no segundo caso as prévias antigas não valem mais e são refeitas. */
  const emittedRef = useRef<TaskExternalLinkDraft[] | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  /** Seletor do botão que deve receber o foco depois de um ↑/↓ — sem isso o foco fica na posição
   * antiga e a segunda seta moveria o link **vizinho**, não o mesmo. */
  const focusAfterMoveRef = useRef<string | null>(null);

  useEffect(() => {
    if (value === emittedRef.current) return;
    setUi(initialUi(value));
  }, [value]);

  useEffect(() => {
    const selector = focusAfterMoveRef.current;
    if (!selector) return;
    focusAfterMoveRef.current = null;
    listRef.current?.querySelector<HTMLButtonElement>(selector)?.focus();
  });

  function emit(next: TaskExternalLinkDraft[], nextUi: RowUiState[]) {
    emittedRef.current = next;
    setUi(nextUi);
    onChange(next);
  }

  function addLink() {
    emit(
      [...value, { url: "", comment: null, position: value.length }],
      [...ui, { preview: "", error: null }]
    );
  }

  function removeLink(index: number) {
    emit(
      value.filter((_, i) => i !== index).map((draft, i) => ({ ...draft, position: i })),
      ui.filter((_, i) => i !== index)
    );
  }

  function moveLink(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const nextValue = [...value];
    [nextValue[index], nextValue[target]] = [nextValue[target], nextValue[index]];
    const nextUi = [...ui];
    [nextUi[index], nextUi[target]] = [nextUi[target], nextUi[index]];
    focusAfterMoveRef.current = `[data-move="${direction === -1 ? "up" : "down"}"][data-row="${target}"]`;
    emit(
      nextValue.map((draft, i) => ({ ...draft, position: i })),
      nextUi
    );
  }

  function patchLink(index: number, patch: Partial<TaskExternalLinkDraft>, nextUi: RowUiState[]) {
    emit(
      value.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)),
      nextUi
    );
  }

  function changeUrl(index: number, url: string) {
    // Validar a cada tecla acusaria erro no meio da digitação: a checagem é no blur. Voltar a
    // digitar limpa o aviso, mas **não** mexe na prévia — ela só se move quando o campo perde o
    // foco.
    patchLink(
      index,
      { url },
      ui.map((row, i) => (i === index ? { ...row, error: null } : row))
    );
  }

  function commitUrl(index: number, raw: string) {
    const url = raw.trim();
    setUi((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              preview: url,
              error: !url || /^https?:\/\//i.test(url) ? null : EXTERNAL_URL_HINT,
            }
          : row
      )
    );
  }

  /** URL repetida: acusa da **segunda** ocorrência em diante, para a linha original não ficar
   * marcada como culpada de um engano cometido depois dela. */
  function isDuplicate(index: number): boolean {
    const url = value[index]?.url.trim();
    if (!url) return false;
    return value.some((other, i) => i < index && other.url.trim() === url);
  }

  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum link ainda. Adicione o primeiro para guardar o endereço e por que ele importa.
        </p>
      ) : (
        <>
          <div className="hidden gap-2 px-0.5 sm:flex">
            <FormLabel className="flex-[3] text-xs">Link</FormLabel>
            <FormLabel optional className="flex-[2] text-xs">
              Comentário
            </FormLabel>
            {/* A coluna de prévia e a das ações não têm rótulo: os botões se nomeiam pelo
                `aria-label`, e a prévia é decorativa. */}
            <span className="w-[9.5rem] shrink-0" aria-hidden="true" />
          </div>
          <ul ref={listRef} className="space-y-2">
            {value.map((draft, index) => {
              const row = ui[index] ?? { preview: draft.url, error: null };
              const duplicate = isDuplicate(index);
              const appearance = resolveLinkAppearance(row.preview, rules);
              const position = `${index + 1} de ${value.length}`;
              return (
                <li
                  key={draft.id ?? `draft-${index}`}
                  role="group"
                  aria-label={`Link externo ${position}`}
                  className="rounded-md border p-2 sm:border-none sm:p-0"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      type="url"
                      inputMode="url"
                      autoComplete="off"
                      spellCheck={false}
                      aria-label={`URL do link ${position}`}
                      aria-invalid={row.error || duplicate ? true : undefined}
                      value={draft.url}
                      onChange={(e) => changeUrl(index, e.target.value)}
                      onBlur={(e) => commitUrl(index, e.target.value)}
                      placeholder="https://github.com/owner/repo/issues/123"
                      className="min-h-[44px] flex-[3] text-sm sm:min-h-0 sm:h-9"
                    />
                    <Input
                      aria-label={`Comentário do link ${position}`}
                      value={draft.comment ?? ""}
                      onChange={(e) =>
                        patchLink(index, { comment: e.target.value || null }, ui)
                      }
                      placeholder="Por que este link importa"
                      className="min-h-[44px] flex-[2] text-sm sm:min-h-0 sm:h-9"
                    />
                    <div className="flex items-center gap-1">
                      {/* Prévia do chip: exatamente o que vai aparecer no card. Decorativa — o
                          ícone é `aria-hidden` e o rótulo já é o conteúdo do campo de URL, então o
                          leitor de tela não ouve a mesma coisa duas vezes. */}
                      <span
                        data-testid={`link-preview-${index}`}
                        title={
                          row.preview
                            ? `Assim aparece no card: ${appearance.label}`
                            : EXTERNAL_LINK_PREVIEW_EMPTY
                        }
                        className={cn(
                          "flex w-[6.5rem] min-w-0 items-center gap-1 text-[10px] text-muted-foreground",
                          // URL sem protocolo continua com prévia, só apagada: sumir esconderia a
                          // consequência do erro justo quando ela é útil.
                          row.error && "opacity-50"
                        )}
                      >
                        {row.preview ? (
                          <>
                            <span aria-hidden="true" className="flex shrink-0 items-center">
                              <TaskIconBadge
                                iconKey={appearance.iconKey}
                                iconUrl={appearance.iconUrl}
                                className="h-3 w-3"
                              />
                            </span>
                            <span className="truncate">{appearance.label}</span>
                          </>
                        ) : (
                          <span className="truncate italic">{EXTERNAL_LINK_PREVIEW_EMPTY}</span>
                        )}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        data-move="up"
                        data-row={index}
                        disabled={index === 0}
                        onClick={() => moveLink(index, -1)}
                        aria-label={`Mover link ${position} para cima`}
                        className="h-11 w-11 shrink-0 sm:h-8 sm:w-8"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        data-move="down"
                        data-row={index}
                        disabled={index === value.length - 1}
                        onClick={() => moveLink(index, 1)}
                        aria-label={`Mover link ${position} para baixo`}
                        className="h-11 w-11 shrink-0 sm:h-8 sm:w-8"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLink(index)}
                        aria-label={`Remover link ${position}`}
                        className="h-11 w-11 shrink-0 text-destructive sm:h-8 sm:w-8"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {(row.error || duplicate) && (
                    <p role="alert" className="mt-1 text-xs text-destructive">
                      {row.error ?? EXTERNAL_URL_DUPLICATE_HINT}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addLink}
          className="h-9 gap-1.5"
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          Adicionar link
        </Button>
        {/* Feature 087: a tela de regras de ícone. Abre em **outra aba** de propósito — este
            botão vive dentro do formulário de tarefa, e navegar por cima dele descartaria os links
            e o resto do que ainda não foi salvo. */}
        <Button asChild type="button" variant="ghost" size="sm" className="h-9">
          <a href={LINK_ICON_RULES_PATH} target="_blank" rel="noreferrer">
            Configurar ícones
          </a>
        </Button>
      </div>
    </div>
  );
}
