import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Link2, Pen, Plus, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { EmptyState } from "@/components/EmptyState";
import {
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
  FormLabel,
  ICON_EDIT_BUTTON_CLASS,
} from "@/components/FormLabel";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import {
  createLinkIconRule,
  deleteLinkIconRule,
  fetchLinkIconRules,
  reorderLinkIconRules,
  updateLinkIconRule,
} from "@/api/tasks";
import { invalidateLinkIconRules } from "@/hooks/useLinkIconRules";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_LINK_ICON_RULES,
  matchLinkIconRule,
  resolveLinkAppearance,
  validateLinkIconPattern,
  type LinkIconRuleShape,
} from "@/domain/tasks";
import { getErrorMessage } from "@/lib/errors";
import type { LinkIconRule, LinkIconRuleDraft } from "@/types/tasks";
import { LINK_ICON_PRESETS, TASK_ICON_PRESETS, TaskIconBadge } from "./TaskIconBadge";
import { TaskIconPicker } from "./TaskIconPicker";

/** Sem `label_template`, o chip cai no host da URL. Dizer isso na linha evita que a coluna de
 * rótulo fique vazia e pareça regra quebrada. */
export const LINK_RULE_LABEL_FALLBACK = "host do link";
export const LINK_RULE_LOAD_ERROR = "Não foi possível carregar as regras.";

/** Ordem dos presets no seletor da regra: as marcas primeiro, porque é o que se procura aqui; o
 * catálogo de tarefa vem atrás, disponível sem ser o destaque. */
const RULE_ICON_PRESETS = [...LINK_ICON_PRESETS, ...TASK_ICON_PRESETS];

/** O formulário do diálogo. `enabled` não está aqui de propósito: ligar/desligar é da lista (um
 * clique, sem abrir nada), e ter o mesmo interruptor nos dois lugares só criaria a dúvida de qual
 * vale. */
interface RuleForm {
  name: string;
  pattern: string;
  label_template: string;
  icon_key: string | null;
  icon_url: string | null;
}

const EMPTY_FORM: RuleForm = {
  name: "",
  pattern: "",
  label_template: "",
  icon_key: null,
  icon_url: null,
};

/** Uma mensagem por campo. Afirmativas e dizendo o que fazer — "Dê um nome à regra" em vez de
 * "Campo inválido". A da `pattern` é a exceção: quando a regex não compila, a mensagem é a do
 * próprio `RegExp` (`Invalid regular expression: ...`), que aponta onde está o erro de sintaxe. */
type RuleErrors = Partial<Record<"name" | "pattern" | "icon", string>>;

export const LINK_RULE_NAME_REQUIRED = "Dê um nome à regra.";
/** Regra sem ícone não muda nada visível no chip — salvar seria salvar um engano em silêncio. */
export const LINK_RULE_ICON_REQUIRED = "Escolha o ícone que a regra vai aplicar.";
/** Antes de haver URL de teste. Um chip fantasma pareceria resultado — e resultado errado. */
export const LINK_RULE_PREVIEW_EMPTY = "Cole um link para ver como ele vai aparecer.";
export const LINK_RULE_PREVIEW_MATCH = "A regra casou:";
/** Não casar não é erro: é o resultado do teste. Dizer o que aconteceria mesmo assim é o que
 * transforma o campo em ferramenta de depuração em vez de um sim/não. */
export const LINK_RULE_PREVIEW_NO_MATCH = "A regra não casou. Sem ela, o link aparece assim:";

function validateForm(form: RuleForm): RuleErrors {
  const errors: RuleErrors = {};
  if (!form.name.trim()) errors.name = LINK_RULE_NAME_REQUIRED;
  const patternProblem = validateLinkIconPattern(form.pattern.trim());
  if (patternProblem) errors.pattern = patternProblem;
  if (!form.icon_key && !form.icon_url) errors.icon = LINK_RULE_ICON_REQUIRED;
  return errors;
}

/**
 * `/tasks/link-icons` — a tela em que as regras de aparência de link externo são configuradas
 * (feature 087): regex → ícone → texto derivado do link.
 *
 * É o pedido "coloque uma seção para que eu configure os ícones pre-configurados... esse regex"
 * virando tela. Antes disto, "link do GitHub aparece com o ícone do GitHub" era um `if` dentro do
 * chip, e reconhecer GitLab ou Jira exigia deploy.
 *
 * Mora fora da sidebar, como `/tasks/tags`: chega-se por dentro do módulo (o botão "Configurar
 * ícones" da seção de links do formulário de tarefa, e o cabeçalho de `/tasks/tags`). É
 * configuração, não um lugar por onde se passa todo dia.
 *
 * A **ordem da lista é a ordem de avaliação**, e a primeira regra que casa vence. Por isso as setas
 * ↑/↓ não são enfeite: são o único lugar em que a precedência entre duas regras que casam a mesma
 * URL é decidida.
 */
export default function LinkIconRules() {
  const [rules, setRules] = useState<LinkIconRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  /** `null` = diálogo fechado; `"new"` = criando; uma regra = editando aquela. */
  const [editing, setEditing] = useState<LinkIconRule | "new" | null>(null);
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<RuleErrors>({});
  /** Só do diálogo: não é campo da regra, é a bancada de teste. Escrever regex às cegas e só
   * descobrir o resultado voltando à lista de tarefas é o caminho garantido para desistir. */
  const [testUrl, setTestUrl] = useState("");
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRules(await fetchLinkIconRules());
      setLoadFailed(false);
    } catch (error) {
      setLoadFailed(true);
      toast({
        title: "Erro",
        description: getErrorMessage(error, LINK_RULE_LOAD_ERROR),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Toda escrita passa por aqui: a lista de tarefas lê as regras de um cache no módulo, e sem o
   * `invalidate` o chip continuaria desenhando a regra antiga até um reload da página. */
  async function commit(action: () => Promise<void>, failure: string) {
    setBusy(true);
    try {
      await action();
      invalidateLinkIconRules();
      await load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, failure),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  function toggleEnabled(rule: LinkIconRule) {
    void commit(
      () => updateLinkIconRule(rule.id, { enabled: !rule.enabled }),
      "Não foi possível mudar o estado da regra."
    );
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    [next[index], next[target]] = [next[target], next[index]];
    // Otimista: a lista já mostra a ordem nova enquanto as posições são gravadas. Reordenar é a
    // ação mais repetida desta tela (é assim que se ajusta quem vence), e esperar um round-trip por
    // clique tornaria o ajuste fino insuportável.
    setRules(next);
    void commit(
      () => reorderLinkIconRules(next.map((rule) => rule.id)),
      "Não foi possível reordenar as regras."
    );
  }

  function remove(rule: LinkIconRule) {
    void commit(() => deleteLinkIconRule(rule.id), "Não foi possível excluir a regra.");
  }

  /** Muda um campo e apaga o aviso dele: acusar erro enquanto a pessoa corrige é ruído. O aviso
   * volta no blur (no caso da regex) ou no salvar. */
  function patch(next: Partial<RuleForm>, clear?: keyof RuleErrors) {
    setForm((prev) => ({ ...prev, ...next }));
    if (clear) setErrors((prev) => ({ ...prev, [clear]: undefined }));
  }

  /** Insere as regras semente como se o usuário as tivesse digitado — na ordem da constante, que é
   * a própria demonstração do mecanismo (a específica do GitHub antes da genérica). Sequencial: são
   * oito linhas, e um `Promise.all` que falhasse no meio deixaria a `position` embaralhada. */
  function seedDefaults() {
    void commit(async () => {
      for (const [index, seed] of DEFAULT_LINK_ICON_RULES.entries()) {
        await createLinkIconRule({
          name: seed.name,
          pattern: seed.pattern,
          label_template: seed.label_template,
          icon_key: seed.icon_key,
          icon_url: null,
          position: index,
          enabled: true,
        });
      }
    }, "Não foi possível criar as regras padrão.");
  }

  function openNew() {
    setForm(EMPTY_FORM);
    setErrors({});
    setTestUrl("");
    setEditing("new");
  }

  function openEdit(rule: LinkIconRule) {
    setForm({
      name: rule.name,
      pattern: rule.pattern,
      label_template: rule.label_template ?? "",
      icon_key: rule.icon_key,
      icon_url: rule.icon_url,
    });
    setErrors({});
    setTestUrl("");
    setEditing(rule);
  }

  /** A regra **como está sendo editada**, na forma que o casamento espera. É o que faz a prévia
   * responder à tecla, e não ao último save. */
  const draftShape: LinkIconRuleShape = {
    pattern: form.pattern.trim(),
    label_template: form.label_template.trim() || null,
    icon_key: form.icon_key,
    icon_url: form.icon_url,
    position: 0,
    enabled: true,
  };
  const trimmedTestUrl = testUrl.trim();
  /** `resolveLinkAppearance` — a **mesma** função que o chip da lista de tarefas usa. Uma segunda
   * implementação aqui seria uma prévia que mente exatamente quando mais importa. */
  const preview = trimmedTestUrl ? resolveLinkAppearance(trimmedTestUrl, [draftShape]) : null;
  const previewMatched = trimmedTestUrl
    ? matchLinkIconRule(trimmedTestUrl, [draftShape]) !== null
    : false;

  async function save() {
    if (!editing) return;
    // A regex vem do usuário e vira código executável. Barrar aqui é o que garante que a lista de
    // tarefas nunca receba uma regra que não compila — e a mensagem do `RegExp` diz onde corrigir,
    // que um "erro ao salvar" genérico vindo do banco não diria.
    const found = validateForm(form);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setErrors({});
    const draft: LinkIconRuleDraft = {
      name: form.name.trim(),
      pattern: form.pattern.trim(),
      label_template: form.label_template.trim() || null,
      icon_key: form.icon_key,
      icon_url: form.icon_url,
      // Regra nova entra no fim da fila: subir uma regra acima das existentes é uma decisão de
      // precedência, e ela é tomada pelas setas, não por um efeito colateral do "salvar".
      position: editing === "new" ? rules.length : editing.position,
      enabled: editing === "new" ? true : editing.enabled,
    };
    const target = editing;
    await commit(async () => {
      if (target === "new") await createLinkIconRule(draft);
      else await updateLinkIconRule(target.id, draft);
      setEditing(null);
    }, "Não foi possível salvar a regra.");
  }

  return (
    <PageShell
      title="Ícones de link"
      description="Regras que decidem o ícone e o texto de cada link externo nas tarefas. A primeira regra que casa vence — use as setas para escolher quem vem antes."
      eyebrow="Produtividade"
      actions={
        <Button onClick={openNew} className="gap-1.5">
          <Plus aria-hidden="true" className="h-4 w-4" />
          Nova regra
        </Button>
      }
    >
      {loading ? (
        <TableLoadingSkeleton rows={4} columns={4} />
      ) : loadFailed ? (
        <EmptyState
          icon={Link2}
          title={LINK_RULE_LOAD_ERROR}
          description="Suas regras continuam salvas — os links só aparecem com o ícone genérico até a lista voltar."
          action={
            <Button variant="outline" onClick={() => void load()}>
              Tentar de novo
            </Button>
          }
        />
      ) : rules.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="Nenhuma regra ainda"
          description="Sem regras, todo link externo aparece com o ícone genérico e o endereço do site. Comece pelas prontas — todas editáveis depois."
          action={
            <Button variant="outline" disabled={busy} onClick={seedDefaults}>
              Criar regras padrão
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {rules.map((rule, index) => (
            <li
              key={rule.id}
              className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center"
                  aria-hidden="true"
                >
                  <TaskIconBadge
                    iconKey={rule.icon_key}
                    iconUrl={rule.icon_url}
                    className="h-4 w-4"
                  />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {rule.name}
                    {!rule.enabled && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        desativada
                      </span>
                    )}
                  </p>
                  {/* A regex em monoespaçada: é código, e `\.` numa fonte proporcional vira
                      adivinhação. */}
                  <p className="truncate font-mono text-xs text-muted-foreground">{rule.pattern}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Rótulo: {rule.label_template || LINK_RULE_LABEL_FALLBACK}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                <Button
                  variant="ghost"
                  size="icon"
                  role="switch"
                  aria-checked={rule.enabled}
                  aria-label={`${rule.enabled ? "Desativar" : "Ativar"} ${rule.name}`}
                  disabled={busy}
                  onClick={() => toggleEnabled(rule)}
                  className={rule.enabled ? "text-primary" : "text-muted-foreground"}
                >
                  {rule.enabled ? (
                    <ToggleRight className="h-4 w-4" />
                  ) : (
                    <ToggleLeft className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Mover ${rule.name} para cima`}
                  disabled={busy || index === 0}
                  onClick={() => move(index, -1)}
                  className={ICON_EDIT_BUTTON_CLASS}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Mover ${rule.name} para baixo`}
                  disabled={busy || index === rules.length - 1}
                  onClick={() => move(index, 1)}
                  className={ICON_EDIT_BUTTON_CLASS}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Editar ${rule.name}`}
                  onClick={() => openEdit(rule)}
                  className={ICON_EDIT_BUTTON_CLASS}
                >
                  <Pen className="h-3.5 w-3.5" />
                </Button>
                <ConfirmDeleteDialog
                  title="Excluir esta regra?"
                  description="Os links das tarefas continuam existindo — voltam a aparecer com o ícone genérico e o endereço do site."
                  onConfirm={() => remove(rule)}
                >
                  <Button variant="ghost" size="icon" aria-label={`Excluir ${rule.name}`} className="text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </ConfirmDeleteDialog>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Nova regra" : "Editar regra"}</DialogTitle>
          </DialogHeader>
          {/* Coluna única, rótulo acima do campo: são cinco campos heterogêneos, e alinhar em duas
              colunas quebraria o scan vertical sem ganhar nada. */}
          <div className={FORM_FIELDS_CLASS}>
            <div>
              <FormLabel required htmlFor="rule-name">
                Nome
              </FormLabel>
              <Input
                id="rule-name"
                value={form.name}
                onChange={(e) => patch({ name: e.target.value }, "name")}
                aria-invalid={errors.name ? true : undefined}
                placeholder="GitHub issue"
                className="mt-1.5"
              />
              {errors.name && (
                <p role="alert" className="mt-1 text-xs text-destructive">
                  {errors.name}
                </p>
              )}
            </div>

            <div>
              <FormLabel required htmlFor="rule-pattern">
                Expressão regular
              </FormLabel>
              <Input
                id="rule-pattern"
                value={form.pattern}
                onChange={(e) => patch({ pattern: e.target.value }, "pattern")}
                // Valida no blur, não a cada tecla: toda regex passa por estados inválidos
                // enquanto é digitada, e acusar no meio disso seria acusar o caminho normal.
                onBlur={(e) =>
                  setErrors((prev) => ({
                    ...prev,
                    pattern: validateLinkIconPattern(e.target.value.trim()) ?? undefined,
                  }))
                }
                aria-invalid={errors.pattern ? true : undefined}
                placeholder="^https?://github\.com/([^/]+)/([^/]+)/issues/(\d+)"
                // É código: monoespaçada, sem corretor e sem autocapitalize — `\.` numa fonte
                // proporcional, com a primeira letra virando maiúscula, é regex quebrada.
                className="mt-1.5 font-mono text-xs"
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
              />
              {errors.pattern ? (
                <p role="alert" className="mt-1 text-xs text-destructive">
                  {errors.pattern}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Testada contra o endereço inteiro, sem diferenciar maiúsculas.
                </p>
              )}
            </div>

            <div>
              <FormLabel optional htmlFor="rule-template">
                Texto do rótulo
              </FormLabel>
              <Input
                id="rule-template"
                value={form.label_template}
                onChange={(e) => patch({ label_template: e.target.value })}
                placeholder="$1/$2#$3"
                className="mt-1.5 font-mono text-xs"
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {"$1"} a {"$9"} são os trechos entre parênteses da expressão; {"$$"} escreve um {"$"}
                . Em branco, o chip mostra o endereço do site.
              </p>
            </div>

            <div>
              <FormLabel required>Ícone</FormLabel>
              <div className="mt-1.5 flex items-center gap-2">
                {/* O mesmo seletor da tarefa (feature 086): presets, a biblioteca do usuário,
                    enviar imagem e colar SVG. Só o catálogo de presets muda. */}
                <TaskIconPicker
                  value={{ icon_key: form.icon_key, icon_url: form.icon_url }}
                  onChange={(next) =>
                    patch({ icon_key: next.icon_key, icon_url: next.icon_url }, "icon")
                  }
                  presets={RULE_ICON_PRESETS}
                  triggerLabel="Escolher ícone da regra"
                />
                <span className="text-xs text-muted-foreground">
                  {form.icon_key || form.icon_url
                    ? "Este ícone aparece no chip do link."
                    : "Escolha um ícone — é ele que aparece no chip do link."}
                </span>
              </div>
              {errors.icon && (
                <p role="alert" className="mt-1 text-xs text-destructive">
                  {errors.icon}
                </p>
              )}
            </div>

            <div>
              <FormLabel optional htmlFor="rule-test-url">
                URL de teste
              </FormLabel>
              <Input
                id="rule-test-url"
                type="url"
                inputMode="url"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                placeholder="https://github.com/owner/repo/issues/123"
                className="mt-1.5"
                spellCheck={false}
                autoComplete="off"
              />
              <div
                data-testid="rule-preview"
                aria-live="polite"
                className="mt-2 flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground"
              >
                {preview ? (
                  <>
                    <span>{previewMatched ? LINK_RULE_PREVIEW_MATCH : LINK_RULE_PREVIEW_NO_MATCH}</span>
                    <span className="flex min-w-0 items-center gap-1 text-foreground">
                      <span aria-hidden="true" className="flex items-center">
                        <TaskIconBadge
                          iconKey={preview.iconKey}
                          iconUrl={preview.iconUrl}
                          className="h-3 w-3"
                        />
                      </span>
                      <span className="truncate">{preview.label}</span>
                    </span>
                  </>
                ) : (
                  <span className="italic">{LINK_RULE_PREVIEW_EMPTY}</span>
                )}
              </div>
            </div>

            <Button onClick={() => void save()} disabled={busy} className="w-full">
              {editing === "new" ? "Criar regra" : "Salvar alterações"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
