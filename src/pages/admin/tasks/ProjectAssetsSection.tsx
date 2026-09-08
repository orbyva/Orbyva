import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/FormLabel";
import { resolveLinkAppearance } from "@/domain/tasks";
import { useLinkIconRules } from "@/hooks/useLinkIconRules";
import { TaskIconBadge } from "./TaskIconBadge";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { EmptyState } from "@/components/EmptyState";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { toast } from "@/hooks/use-toast";
import type { ProjectAsset, ProjectAssetDraft } from "@/types/tasks";
import {
  fetchProjectAssets,
  createProjectAsset,
  deleteProjectAsset,
  reorderProjectAssets,
} from "@/api/tasks/projectAssets";

interface ProjectAssetsSectionProps {
  projectId: string;
}

export function ProjectAssetsSection({ projectId }: ProjectAssetsSectionProps) {
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<ProjectAssetDraft>({
    project_id: projectId,
    kind: "link",
    title: "",
    url: "",
    comment: null,
    position: 0,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteCount, setDeleteCount] = useState<number>(0);

  const rules = useLinkIconRules();

  const loadAssets = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProjectAssets(projectId);
      setAssets(data);
    } catch (e) {
      setError("Falha ao carregar a base do projeto");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssets();
  }, [projectId]);

  const handleUrlBlur = () => {
    const url = formData.url?.trim() ?? "";
    if (url && !/^https?:\/\//i.test(url)) {
      setFormError("Comece com https://");
    } else {
      setFormError(null);
    }
    checkDuplicate();
  };

  const checkDuplicate = () => {
    const url = formData.url?.trim().toLowerCase() ?? "";
    if (!url) {
      setDuplicateWarning(null);
      return;
    }
    const exists = assets.some((a) => a.url?.toLowerCase() === url && a.id !== formData.position.toString());
    setDuplicateWarning(exists ? "Este link já está na base." : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formError || duplicateWarning || !formData.url?.trim()) return;

    try {
      const newAsset = await createProjectAsset({
        ...formData,
        position: assets.length,
      });
      setAssets((prev) => [...prev, newAsset]);
      setShowForm(false);
      setFormData({
        project_id: projectId,
        kind: "link",
        title: "",
        url: "",
        comment: null,
        position: 0,
      });
      setFormError(null);
      setDuplicateWarning(null);
      toast({ title: "Link adicionado à base" });
    } catch (e) {
      toast({ title: "Erro ao adicionar", variant: "destructive" });
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProjectAsset(id);
      setAssets((prev) => prev.filter((a) => a.id !== id));
      setDeletingId(null);
      toast({ title: "Removido da base" });
    } catch (e) {
      toast({ title: "Erro ao remover", variant: "destructive" });
      console.error(e);
    }
  };

  const handleMove = async (fromIndex: number, toIndex: number) => {
    const newAssets = [...assets];
    const [moved] = newAssets.splice(fromIndex, 1);
    newAssets.splice(toIndex, 0, moved);
    const orderedIds = newAssets.map((a) => a.id);
    try {
      await reorderProjectAssets(projectId, orderedIds);
      setAssets(newAssets);
    } catch (e) {
      toast({ title: "Erro ao reordenar", variant: "destructive" });
      console.error(e);
      loadAssets();
    }
  };

  const handleMoveUp = (index: number) => {
    if (index > 0) handleMove(index, index - 1);
  };

  const handleMoveDown = (index: number) => {
    if (index < assets.length - 1) handleMove(index, index + 1);
  };

  const confirmDelete = (asset: ProjectAsset) => {
    const count = asset.url ? assets.filter((a) => a.url === asset.url).length : 1;
    setDeleteCount(count);
    setDeletingId(asset.id);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <TableLoadingSkeleton rows={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={loadAssets}>
            Tentar de novo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Base do projeto</h3>
        <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-1" />
          {showForm ? "Cancelar" : "Adicionar link"}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 p-3 border rounded-lg bg-muted/30">
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <FormLabel htmlFor="asset-url">URL *</FormLabel>
                <Input
                  id="asset-url"
                  type="url"
                  placeholder="https://..."
                  value={formData.url || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, url: e.target.value }))
                  }
                  onBlur={handleUrlBlur}
                  aria-invalid={!!formError}
                  aria-describedby={formError ? "url-error" : undefined}
                />
                {formError && (
                  <p id="url-error" className="text-sm text-destructive" role="alert">
                    {formError}
                  </p>
                )}
                {duplicateWarning && (
                  <p className="text-sm text-amber-600" role="alert">
                    {duplicateWarning}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <FormLabel htmlFor="asset-title">Título (opcional)</FormLabel>
                <Input
                  id="asset-title"
                  placeholder="Preenchido automaticamente se vazio"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, title: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <FormLabel htmlFor="asset-comment">Comentário (opcional)</FormLabel>
              <Input
                id="asset-comment"
                placeholder="Por que este link importa"
                value={formData.comment ?? ""}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, comment: e.target.value || null }))
                }
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={!!formError || !!duplicateWarning}>
              Adicionar
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {assets.length === 0 && !showForm ? (
        <EmptyState
          title="Nenhum link na base deste projeto"
          description="Adicione links que possam ser anexados a múltiplas tarefas."
          action={
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar primeiro link
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {assets.map((asset, index) => {
            const appearance = asset.url
              ? resolveLinkAppearance(asset.url, rules)
              : { iconKey: null, iconUrl: null, label: asset.title };
            return (
              <div
                key={asset.id}
                className="flex items-center gap-3 p-3 border rounded-lg bg-card"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <TaskIconBadge
                    iconKey={appearance.iconKey}
                    iconUrl={appearance.iconUrl}
                    className="h-4 w-4"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{asset.title}</p>
                    {asset.url && (
                      <p className="text-xs text-muted-foreground truncate">
                        {asset.url}
                      </p>
                    )}
                    {asset.comment && (
                      <p className="text-xs text-muted-foreground italic truncate">
                        {asset.comment}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    em {asset.url ? assets.filter((a) => a.url === asset.url).length : 1} tarefa(s)
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    aria-label="Mover para cima"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleMoveDown(index)}
                    disabled={index === assets.length - 1}
                    aria-label="Mover para baixo"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => confirmDelete(asset)}
                    className="text-destructive hover:text-destructive"
                    aria-label={`Remover ${asset.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {deletingId && (
        <ConfirmDeleteDialog
          title="Remover da base?"
          description={
            deleteCount > 1
              ? `Este link está anexado a ${deleteCount} tarefas. Ele será removido de todas elas.`
              : "Este link será removido da base e desanexado da tarefa em que está."
          }
          onConfirm={() => {
            handleDelete(deletingId);
            setDeletingId(null);
          }}
        >
          <Button variant="ghost" size="icon" className="text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </ConfirmDeleteDialog>
      )}
    </div>
  );
}