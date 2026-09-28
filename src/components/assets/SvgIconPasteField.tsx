import { useId, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/FormLabel";
import { cn } from "@/lib/utils";
import { SVG_ICON_REJECTION_MESSAGES, prepareSvgIcon } from "@/domain/tasks/svgIcon";

/** Estado da prévia antes de haver o que prever. */
export const SVG_ICON_PREVIEW_EMPTY = "A prévia aparece quando você colar o SVG";
/** A limpeza tirou alguma coisa: o desenho pode não ser idêntico ao do site de origem, e é melhor
 * o usuário descobrir isso **antes** de salvar do que ao ver o ícone na tarefa. */
export const SVG_ICON_REMOVED_WARNING =
  "Parte do conteúdo foi removida por segurança — confira a prévia antes de salvar.";

/** O SVG limpo embrulhado em data URI, para a prévia sair por `<img>`.
 *
 * `encodeURIComponent` em vez de base64 de propósito: `btoa` quebra com qualquer caractere fora do
 * Latin-1, e SVG copiado de site vem com acento e `→` o tempo todo. */
export function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Campo de colar SVG do seletor de ícone (feature 086): o markup, um nome opcional e a prévia do
 * resultado.
 *
 * **A prévia mostra o SVG já sanitizado, e sempre por `<img>`** — nunca `dangerouslySetInnerHTML`.
 * Essa é a segunda barreira da feature: um SVG carregado por `<img>` roda em modo restrito, sem
 * script e sem acesso ao documento. Renderizar inline aqui — justamente na tela onde o markup ainda
 * é texto arbitrário vindo de um site qualquer — seria executar o conteúdo dentro do app, com
 * sessão e tudo. `svgIconSecurity.test.tsx` afirma isso explicitamente.
 *
 * Controlado no markup (`markup`/`onMarkupChange`) porque o `onPaste` do popover precisa poder
 * preencher o campo de fora; o nome é estado local, que ninguém mais mexe.
 *
 * O aviso de recusa aparece no **blur** (ou ao tentar salvar), não a cada tecla: markup colado
 * chega inteiro de uma vez, mas quem digita/edita à mão passaria o tempo todo por estados
 * inválidos. O botão Salvar não fica desabilitado por invalidez — clicar e receber a frase que diz
 * o que fazer ensina mais do que um botão morto sem explicação.
 */
export function SvgIconPasteField({
  markup,
  onMarkupChange,
  onCancel,
  onSave,
  saving = false,
}: {
  markup: string;
  onMarkupChange: (next: string) => void;
  onCancel: () => void;
  /** Recebe o SVG **já limpo** (não o colado) e o nome escolhido, que pode ser vazio. */
  onSave: (input: { svg: string; name: string }) => void;
  saving?: boolean;
}) {
  const [name, setName] = useState("");
  const [showError, setShowError] = useState(false);
  const markupId = useId();
  const nameId = useId();
  const errorId = useId();

  const prepared = useMemo(
    () => (markup.trim() ? prepareSvgIcon(markup) : null),
    [markup]
  );
  const error = prepared && !prepared.ok ? SVG_ICON_REJECTION_MESSAGES[prepared.reason] : null;
  const visibleError = showError ? error : null;

  function handleSave() {
    if (!prepared?.ok) {
      setShowError(true);
      return;
    }
    onSave({ svg: prepared.svg, name: name.trim() });
  }

  return (
    <div className="space-y-2.5">
      <div className="space-y-1">
        <FormLabel htmlFor={markupId} required>
          Markup do SVG
        </FormLabel>
        <textarea
          id={markupId}
          value={markup}
          onChange={(e) => {
            onMarkupChange(e.target.value);
            setShowError(false);
          }}
          onBlur={() => setShowError(true)}
          rows={3}
          spellCheck={false}
          aria-required="true"
          aria-invalid={visibleError ? true : undefined}
          aria-describedby={visibleError ? errorId : undefined}
          placeholder={'<svg xmlns="http://www.w3.org/2000/svg" …>'}
          className="flex min-h-[64px] w-full rounded-md border border-input bg-transparent px-2 py-1.5 font-mono text-[11px] shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        {visibleError && (
          <p id={errorId} role="alert" className="text-[10px] text-destructive">
            {visibleError}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/30"
          aria-hidden={prepared?.ok ? undefined : true}
        >
          {prepared?.ok && (
            <img
              src={svgDataUri(prepared.svg)}
              alt="Prévia do ícone"
              className="h-5 w-5 object-contain"
            />
          )}
        </div>
        <p
          className={cn(
            "text-[10px] leading-tight",
            prepared?.ok && prepared.removedSomething
              ? "text-amber-600 dark:text-amber-500"
              : "text-muted-foreground"
          )}
        >
          {prepared?.ok
            ? prepared.removedSomething
              ? SVG_ICON_REMOVED_WARNING
              : "Prévia do ícone que será salvo."
            : SVG_ICON_PREVIEW_EMPTY}
        </p>
      </div>

      <div className="space-y-1">
        <FormLabel htmlFor={nameId} optional>
          Nome na lista
        </FormLabel>
        <Input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ícone colado"
          className="h-8 text-xs"
        />
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 flex-1 text-xs"
          onClick={onCancel}
          disabled={saving}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 flex-1 text-xs"
          onClick={handleSave}
          disabled={saving}
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Salvar ícone
        </Button>
      </div>
    </div>
  );
}
