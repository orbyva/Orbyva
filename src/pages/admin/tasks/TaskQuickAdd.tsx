import { useEffect, useId, useRef, useState } from "react";
import { AlignLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownTextarea } from "@/components/MarkdownTextarea";
import { cn } from "@/lib/utils";

/** O que a tira devolve pra quem a hospeda. Só título e descrição: o resto da tarefa vem de
 * `emptyTask(projectId)` na página, exatamente como o input de subtarefa já monta o dele. */
export interface TaskQuickAddPayload {
  title: string;
  description: string;
}

interface TaskQuickAddProps {
  /**
   * Projeto em que a tarefa nasce, resolvido **pela página** — o componente não sabe o que é
   * filtro de projeto. Em `/tasks` isso é `null` até a feature 099 ligar o filtro ativo aqui; em
   * `ProjectDetail` é o projeto da rota. Viaja de volta no payload de `onCreate` pra que a 099
   * precise mexer num lugar só (ver Decisões da 098).
   */
  projectId: string | null;
  onCreate: (payload: TaskQuickAddPayload & { projectId: string | null }) => Promise<void>;
  disabled?: boolean;
  className?: string;
}

/**
 * Quick add da aba Lista (feature 098): um `+` no fim da barra de controles que abre uma tira
 * `[título] [descrição] [Criar]` crescendo para a esquerda, para anotar "comprar pão" sem passar
 * pelo formulário completo (o dialog "Nova tarefa" continua sendo o caminho longo).
 *
 * **Não é o QuickAdd global** (`QuickAddMenu`/`QuickAddHost`/`QuickAddExpenseFab`, do FAB de
 * `AdminLayout`): aquele é um menu de atalhos por área que navega ou abre dialog, este é um campo
 * de digitação que cria a tarefa ali mesmo. Por isso o nome sai sem o prefixo `QuickAdd` — dois
 * `+` chamados da mesma coisa em telas vizinhas é como se erra o arquivo na próxima sessão.
 *
 * Ordem de tabulação da tira, nesta ordem de propósito (ver Decisões da 098): título → "Adicionar
 * descrição" → "Criar". Enter no título faz o submit implícito do `<form>` e cria; Enter/Espaço no
 * botão de descrição abre a descrição (semântica de botão intacta); Enter no "Criar" cria.
 */
export function TaskQuickAdd({ projectId, onCreate, disabled, className }: TaskQuickAddProps) {
  const stripId = useId();
  const descriptionId = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  /** Criação em voo: trava a tira inteira. Enter duplo num campo que já disparou não pode criar
   * duas tarefas. */
  const [saving, setSaving] = useState(false);
  /** Largura já "esticada" do input — ver o efeito de animação abaixo. */
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const plusRef = useRef<HTMLButtonElement>(null);
  const descriptionBoxRef = useRef<HTMLDivElement>(null);
  /** Mesmo problema do `refocusTitleRef`, do outro lado: o `+` só volta ao DOM no render em que a
   * tira sai, então o foco tem de ser devolvido depois dele, não dentro do handler de Escape. */
  const refocusPlusRef = useRef(false);
  /** O `saving` **desabilita** o input de título, e um elemento desabilitado não recebe foco — por
   * isso o retorno do foco não pode ser um `focus()` solto no fim do `submit()`: ele precisa
   * esperar o re-render que reabilita o campo. */
  const refocusTitleRef = useRef(false);

  /** Abrir a tira é o gesto de quem já vai digitar — sem isto o primeiro clique só revelaria o
   * campo e o segundo é que começaria a anotação. */
  useEffect(() => {
    if (open) titleRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (saving || !open || !refocusTitleRef.current) return;
    refocusTitleRef.current = false;
    titleRef.current?.focus();
  }, [saving, open]);

  useEffect(() => {
    if (open || !refocusPlusRef.current) return;
    refocusPlusRef.current = false;
    plusRef.current?.focus();
  }, [open]);

  /**
   * A expansão em si: o input nasce com largura zero e vai a `w-64` no quadro seguinte, e como a
   * tira é ancorada à direita (`ml-auto` na página + `sm:items-end` aqui) esse crescimento acontece
   * **para a esquerda**, como o pedido descreve. Precisa de um quadro de intervalo — mudar a
   * largura no mesmo commit em que o elemento monta não dispara transição nenhuma.
   *
   * Abaixo de `sm` nada disso vale: a tira ocupa a linha inteira (`w-full`), porque um campo
   * expandindo para a esquerda dentro de 360px estoura a tela.
   */
  useEffect(() => {
    if (!open) {
      setExpanded(false);
      return;
    }
    const frame = requestAnimationFrame(() => setExpanded(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  /** `MarkdownTextarea` não encaminha ref; a tira tem uma textarea só, então o contêiner dela é
   * âncora suficiente (e não obriga a mexer num componente compartilhado por notas e formulário). */
  function focusDescription() {
    descriptionBoxRef.current?.querySelector("textarea")?.focus();
  }

  /** O foco entra na descrição assim que ela aparece — clique, Enter e Espaço no botão passam
   * todos por aqui (um `<button>` nativo dispara `click` nas três formas), então teclado e mouse
   * fazem exatamente a mesma coisa. */
  useEffect(() => {
    if (descriptionOpen) focusDescription();
  }, [descriptionOpen]);

  const canCreate = title.trim().length > 0;
  const locked = disabled || saving;
  const hasDraft = title.trim().length > 0 || description.trim().length > 0;

  /**
   * Clicar fora fecha **só** com os dois campos vazios. Com texto dentro a tira continua aberta:
   * nada é criado sem um comando explícito, e nada é apagado por acidente — quem quer sair com o
   * rascunho na mão usa o Escape, que guarda o texto no estado do componente.
   */
  useEffect(() => {
    if (!open || hasDraft) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open, hasDraft]);

  /**
   * O único caminho de criação da tira — Enter no título (submit implícito do `<form>`), clique ou
   * Enter no "Criar", e `Ctrl/Cmd+Enter` dentro da descrição chegam todos aqui.
   *
   * Título em branco (ou só espaço) é no-op silencioso: não há nada a reportar, e o mesmo guard já
   * existe em `handleSave` e em `addKanbanSubtask`.
   *
   * Sucesso limpa os dois campos, recolhe a descrição e **mantém a tira aberta**, com o foco de
   * volta no título: o caso de uso é anotar três coisas seguidas, e fechar a cada criação obrigaria
   * a reabrir toda vez. Falha não limpa nada — perder um título digitado por causa de uma falha de
   * rede é o pior desfecho possível para um campo que existe para ser rápido. Quem avisa o usuário
   * (toast) é a página, não o componente.
   */
  async function submit() {
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onCreate({ title: trimmed, description, projectId });
      setTitle("");
      setDescription("");
      setDescriptionOpen(false);
    } catch {
      // Silêncio proposital: o texto continua no campo e o toast é responsabilidade da página.
    } finally {
      refocusTitleRef.current = true;
      setSaving(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  /** Já aberta, o botão volta a levar o foco pra dentro da descrição em vez de fechá-la: fechar
   * num Enter distraído esconderia texto já digitado. */
  function handleDescriptionToggle() {
    if (descriptionOpen) focusDescription();
    else setDescriptionOpen(true);
  }

  /**
   * Atalhos da tira inteira, captados no contêiner porque o `MarkdownTextarea` compartilhado
   * sobrescreve o `onKeyDown` que recebe por prop (ele precisa do próprio, que indenta no `Tab`) —
   * o evento borbulha até aqui do mesmo jeito.
   *
   * Dentro da textarea, `Enter` puro quebra linha (é um textarea, e ele está **fora** do `<form>`,
   * então não há submit implícito a impedir); quem cria é `Ctrl/Cmd+Enter`.
   */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
      return;
    }
    // Escape fecha e devolve o foco ao `+`. O rascunho fica no estado do componente, então reabrir
    // restaura o que estava escrito (mas não sobrevive a sair da tela — ver Decisões da 098).
    if (event.key === "Escape") {
      event.preventDefault();
      refocusPlusRef.current = true;
      setOpen(false);
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn("flex flex-col items-stretch gap-2 sm:items-end", className)}
      onKeyDown={handleKeyDown}
    >
      {open ? (
        <form
          id={stripId}
          onSubmit={handleSubmit}
          className="flex w-full items-center gap-1.5 sm:w-auto"
        >
          <Input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Título da tarefa"
            placeholder="O que precisa ser feito?"
            className={cn(
              "h-11 w-full text-sm transition-[width] duration-200 motion-reduce:transition-none sm:h-8",
              expanded ? "sm:w-64" : "sm:w-0"
            )}
            disabled={locked}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0 sm:h-8 sm:w-8"
            aria-label="Adicionar descrição"
            title="Adicionar descrição"
            aria-expanded={descriptionOpen}
            aria-controls={descriptionId}
            disabled={locked}
            onClick={handleDescriptionToggle}
          >
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button
            type="submit"
            size="sm"
            className="h-11 shrink-0 sm:h-8"
            disabled={locked || !canCreate}
          >
            Criar
          </Button>
        </form>
      ) : (
        <Button
          ref={plusRef}
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0 sm:h-9 sm:w-9"
          aria-label="Adicionar tarefa rápida"
          title="Adicionar tarefa rápida"
          aria-expanded={false}
          aria-controls={stripId}
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      )}

      {/* Abaixo da tira, não dentro dela: um textarea não cabe numa faixa de uma linha. Markdown
          cru, sem as abas Escrever/Visualizar do `TaskDescriptionField` — preview dentro de um
          quick add é o oposto de rápido. */}
      {open && descriptionOpen && (
        <div ref={descriptionBoxRef} id={descriptionId} className="w-full sm:w-80">
          <MarkdownTextarea
            value={description}
            onChange={setDescription}
            aria-label="Descrição"
            rows={3}
            placeholder="Descrição (opcional)"
            className="min-h-0 text-sm"
            disabled={locked}
          />
        </div>
      )}
    </div>
  );
}
