import { useEffect, useState, useCallback } from "react";
import { Search, Plus, Paperclip, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/FormLabel";
import { resolveLinkAppearance } from "@/domain/tasks";
import { useLinkIconRules } from "@/hooks/useLinkIconRules";
import { TaskIconBadge } from "./TaskIconBadge";
import { toast } from "@/hooks/use-toast";
import type { ProjectAsset } from "@/types/tasks";
import {
  fetchProjectAssets,
  createProjectAsset,
} from "@/api/tasks/projectAssets";

interface TaskProjectAssetsFieldProps {
  projectId: string | null;
  value: string[];
  onChange: (ids: string[]) => void;
}

export function TaskProjectAssetsField({
  projectId,
  value,
  onChange,
}: TaskProjectAssetsFieldProps) {
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createData, setCreateData] = useState({
    title: "",
    url: "",
    comment: "",
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const rules = useLinkIconRules();

  const loadAssets = useCallback(async () => {
    if (!projectId) {
      setAssets([]);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchProjectAssets(projectId);
      setAssets(data);
    } catch (e) {
      console.error(e);
      toast({ title: "Falha ao carregar base do projeto", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  const filteredAssets = assets.filter(
    (a) =>
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      (a.url && a.url.toLowerCase().includes(search.toLowerCase()))
  );

  const attachedAssets = assets.filter((a) => value.includes(a.id));

  const handleToggle = (assetId: string) => {
    if (value.includes(assetId)) {
      onChange(value.filter((id) => id !== assetId));
    } else {
      onChange([...value, assetId]);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    if (!createData.url.trim()) {
      setCreateError("URL é obrigatória");
      return;
    }
    if (!/^https?:\/\//i.test(createData.url.trim())) {
      setCreateError("Comece com https://");
      return;
    }

    setCreateLoading(true);
    setCreateError(null);
    try {
      const newAsset = await createProjectAsset({
        project_id: projectId,
        kind: "link",
        title: createData.title.trim() || createData.url.trim(),
        url: createData.url.trim(),
        comment: createData.comment.trim() || null,
        position: assets.length,
      });
      setAssets((prev) => [...prev, newAsset]);
      onChange([...value, newAsset.id]);
      setShowCreate(false);
      setCreateData({ title: "", url: "", comment: "" });
      toast({ title: "Link criado e anexado" });
    } catch (e) {
      console.error(e);
      setCreateError("Erro ao criar link");
    } finally {
      setCreateLoading(false);
    }
  };

  if (!projectId) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Paperclip className="h-4 w-4" />
          <span>Escolha um projeto para usar a base</span>
        </div>
        {value.length > 0 && (
          <p className="text-sm text-amber-600">
            {value.length} anexo(s) de outro projeto serão descartados ao salvar.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Base do projeto</h4>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCreate(!showCreate)}
          disabled={loading || createLoading}
        >
          <Plus className="h-4 w-4 mr-1" />
          {showCreate ? "Cancelar" : "Adicionar link à base"}
        </Button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="space-y-3 p-3 border rounded-lg bg-muted/30">
          <div className="space-y-2">
            <div className="space-y-1">
              <FormLabel htmlFor="create-asset-url">URL *</FormLabel>
              <Input
                id="create-asset-url"
                type="url"
                placeholder="https://..."
                value={createData.url}
                onChange={(e) =>
                  setCreateData((prev) => ({ ...prev, url: e.target.value }))
                }
                onBlur={(e) => {
                  const url = e.target.value.trim();
                  if (url && !/^https?:\/\//i.test(url)) {
                    setCreateError("Comece com https://");
                  } else {
                    setCreateError(null);
                  }
                }}
                disabled={createLoading}
              />
              {createError && (
                <p className="text-sm text-destructive" role="alert">
                  {createError}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <FormLabel htmlFor="create-asset-title">Título (opcional)</FormLabel>
              <Input
                id="create-asset-title"
                placeholder="Preenchido automaticamente se vazio"
                value={createData.title}
                onChange={(e) =>
                  setCreateData((prev) => ({ ...prev, title: e.target.value }))
                }
                disabled={createLoading}
              />
            </div>
            <div className="space-y-1">
              <FormLabel htmlFor="create-asset-comment">Comentário (opcional)</FormLabel>
              <Input
                id="create-asset-comment"
                placeholder="Por que este link importa"
                value={createData.comment}
                onChange={(e) =>
                  setCreateData((prev) => ({ ...prev, comment: e.target.value }))
                }
                disabled={createLoading}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={createLoading}>
              {createLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Criando...
                </>
              ) : (
                "Criar e anexar"
              )}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {attachedAssets.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Anexados a esta tarefa ({attachedAssets.length})
            </p>
            <div className="space-y-1">
              {attachedAssets.map((asset) => {
                const appearance = asset.url
                  ? resolveLinkAppearance(asset.url, rules)
                  : { iconKey: null, iconUrl: null, label: asset.title };
                return (
                  <div
                    key={asset.id}
                    className="flex items-center gap-2 p-2 border rounded bg-background"
                  >
                    <TaskIconBadge
                      iconKey={appearance.iconKey}
                      iconUrl={appearance.iconUrl}
                      className="h-4 w-4"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{asset.title}</p>
                      {asset.url && (
                        <p className="text-xs text-muted-foreground truncate">
                          {asset.url}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggle(asset.id)}
                      className="text-destructive"
                      aria-label={`Desanexar ${asset.title}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Disponíveis na base
            {search && ` (filtrados: ${filteredAssets.length})`}
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por título ou URL..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredAssets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {assets.length === 0
                ? "Base vazia — adicione links acima"
                : "Nenhum resultado"}
            </p>
          ) : (
            <div className="space-y-1 max-h-60 overflow-auto">
              {filteredAssets
                .filter((a) => !value.includes(a.id))
                .map((asset) => {
                  const appearance = asset.url
                    ? resolveLinkAppearance(asset.url, rules)
                    : { iconKey: null, iconUrl: null, label: asset.title };
                  return (
                    <div
                      key={asset.id}
                      className="flex items-center gap-2 p-2 border rounded hover:bg-muted/50 transition-colors"
                    >
                      <TaskIconBadge
                        iconKey={appearance.iconKey}
                        iconUrl={appearance.iconUrl}
                        className="h-4 w-4"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{asset.title}</p>
                        {asset.url && (
                          <p className="text-xs text-muted-foreground truncate">
                            {asset.url}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggle(asset.id)}
                        disabled={value.includes(asset.id)}
                      >
                        {value.includes(asset.id) ? (
                          <>
                            <Paperclip className="h-3 w-3 mr-1" />
                            Anexado
                          </>
                        ) : (
                          <>
                            <Plus className="h-3 w-3 mr-1" />
                            Anexar
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}