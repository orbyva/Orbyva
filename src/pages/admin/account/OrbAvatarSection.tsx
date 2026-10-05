import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Loader2, Sparkles, Trash2, X } from "lucide-react";

import {
  deleteOrbAvatar,
  fetchOrbAvatars,
  generateOrbAvatar,
  OrbAvatarGenerateError,
  setActiveOrbAvatar,
  type OrbAvatarReference,
} from "@/api/orbAvatars";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MAX_REFERENCES, REFERENCE_MIMES } from "@/domain/orb/avatarImage";
import { useOrbAvatar } from "@/hooks/useOrbAvatar";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { fileToReference } from "@/lib/orbAvatarReference";
import { cn } from "@/lib/utils";
import type { OrbAvatar } from "@/types/orb";

const MAX_PROMPT_CHARS = 500;

type PickedReference = { key: string; name: string; reference: OrbAvatarReference };

/**
 * Versões da Orb geradas por IA (feature 153): até 3 referências + prompt → `orb-avatar` (152),
 * galeria com a ativa marcada. A versão ativa substitui a esfera no app (154).
 */
export function OrbAvatarSection() {
  const { toast } = useToast();
  const { refresh: refreshActiveAvatar } = useOrbAvatar();
  const promptId = useId();
  const filesId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatars, setAvatars] = useState<OrbAvatar[] | null>(null);
  const [prompt, setPrompt] = useState("");
  const [references, setReferences] = useState<PickedReference[]>([]);
  const [generating, setGenerating] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOrbAvatars()
      .then((rows) => {
        if (!cancelled) setAvatars(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setAvatars([]);
        toast({
          title: "Não foi possível carregar as versões",
          description: getErrorMessage(err),
          variant: "destructive",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const trimmed = prompt.trim();
  const tooLong = prompt.length > MAX_PROMPT_CHARS;
  const canGenerate = Boolean(trimmed) && !tooLong && !generating && remaining !== 0;

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const free = MAX_REFERENCES - references.length;
    const picked = Array.from(files);
    if (picked.length > free) {
      toast({
        title: "Limite de referências",
        description: `Use no máximo ${MAX_REFERENCES} imagens de referência.`,
      });
    }
    const accepted: PickedReference[] = [];
    for (const file of picked.slice(0, Math.max(0, free))) {
      try {
        accepted.push({
          key: `${file.name}-${file.lastModified}-${Math.random()}`,
          name: file.name,
          reference: await fileToReference(file),
        });
      } catch (err) {
        toast({
          title: `Não deu para usar ${file.name}`,
          description: getErrorMessage(err),
          variant: "destructive",
        });
      }
    }
    if (accepted.length) setReferences((cur) => [...cur, ...accepted].slice(0, MAX_REFERENCES));
  }

  async function onGenerate() {
    if (!canGenerate) return;
    setGenerating(true);
    try {
      const result = await generateOrbAvatar({
        prompt: trimmed,
        references: references.map((item) => item.reference),
      });
      setAvatars((cur) => [result.avatar, ...(cur ?? [])]);
      setRemaining(result.remaining);
      setReferences([]);
      toast({ title: "Versão gerada", description: "Ela entrou no topo da galeria." });
    } catch (err) {
      if (err instanceof OrbAvatarGenerateError && err.remaining !== undefined) {
        setRemaining(err.remaining);
      }
      toast({
        title: "Não foi possível gerar",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function onActivate(item: OrbAvatar) {
    setBusyId(item.id);
    try {
      await setActiveOrbAvatar(item.id);
      setAvatars((cur) => (cur ?? []).map((row) => ({ ...row, is_active: row.id === item.id })));
      refreshActiveAvatar();
    } catch (err) {
      toast({
        title: "Não foi possível ativar",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(item: OrbAvatar) {
    setBusyId(item.id);
    try {
      await deleteOrbAvatar(item);
      setAvatars((cur) => (cur ?? []).filter((row) => row.id !== item.id));
      if (item.is_active) refreshActiveAvatar();
    } catch (err) {
      toast({
        title: "Não foi possível excluir",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Sparkles className="h-4 w-4" />
        Versões da Orb
      </h2>
      <p className="mt-1 max-w-xl text-sm text-muted-foreground">
        Crie versões da Orb com IA a partir de um pedido e, se quiser, até {MAX_REFERENCES} imagens
        de referência. A versão ativa substitui a esfera no app.
      </p>

      <div className="mt-4 space-y-3">
        <div className="space-y-1">
          <label htmlFor={promptId} className="text-sm font-medium">
            Como você quer a Orb
          </label>
          <textarea
            id={promptId}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            aria-invalid={tooLong ? true : undefined}
            placeholder="Ex.: esfera de vidro azul com reflexo dourado"
            className="flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <p
            className={cn(
              "text-right text-xs",
              tooLong ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {prompt.length}/{MAX_PROMPT_CHARS}
            {tooLong ? " — resuma um pouco para gerar" : ""}
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor={filesId} className="sr-only">
            Imagens de referência
          </label>
          <input
            id={filesId}
            ref={fileInputRef}
            type="file"
            accept={REFERENCE_MIMES.join(",")}
            multiple
            className="sr-only"
            onChange={(e) => {
              const input = e.currentTarget;
              void addFiles(input.files).finally(() => {
                input.value = "";
              });
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            {references.map((item) => (
              <div key={item.key} className="relative h-16 w-16 overflow-hidden rounded-lg border">
                <img
                  src={`data:${item.reference.mime};base64,${item.reference.data}`}
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  aria-label={`Remover referência ${item.name}`}
                  onClick={() =>
                    setReferences((cur) => cur.filter((ref) => ref.key !== item.key))
                  }
                  className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5 shadow"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {references.length < MAX_REFERENCES ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="mr-2 h-4 w-4" />
                Escolher imagens
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void onGenerate()} disabled={!canGenerate}>
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Gerando… pode levar alguns segundos
              </>
            ) : (
              "Gerar versão"
            )}
          </Button>
          {remaining !== null ? (
            <span className="text-xs text-muted-foreground">restam {remaining} hoje</span>
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        {avatars === null ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square w-full rounded-xl" />
            ))}
          </div>
        ) : avatars.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Nenhuma versão ainda"
            description="Gere a primeira acima. Enquanto não houver uma ativa, o app usa a esfera de sempre."
            className="py-8"
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {avatars.map((item) => (
              <li
                key={item.id}
                className={cn(
                  "flex flex-col gap-2 rounded-xl border p-2",
                  item.is_active && "ring-2 ring-primary"
                )}
              >
                <div className="relative">
                  <img
                    src={item.url}
                    alt={`Versão da Orb: ${item.prompt}`}
                    loading="lazy"
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                  {item.is_active ? (
                    <Badge className="absolute left-1.5 top-1.5">ativa</Badge>
                  ) : null}
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground" title={item.prompt}>
                  {item.prompt}
                </p>
                <div className="mt-auto flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    disabled={item.is_active || busyId === item.id}
                    onClick={() => void onActivate(item)}
                  >
                    {item.is_active ? "Em uso" : "Usar esta"}
                  </Button>
                  <ConfirmDeleteDialog
                    title="Excluir esta versão?"
                    description="A imagem é apagada. Se for a ativa, o app volta para a esfera de sempre."
                    loading={busyId === item.id}
                    onConfirm={() => onDelete(item)}
                  >
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Excluir versão: ${item.prompt}`}
                      disabled={busyId === item.id}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </ConfirmDeleteDialog>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
