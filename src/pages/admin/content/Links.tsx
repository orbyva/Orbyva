import { useCallback, useEffect, useMemo, useState } from "react";
import { Bookmark, Check, ExternalLink, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { EmptyState } from "@/components/EmptyState";
import { FormLabel } from "@/components/FormLabel";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { TagCombobox } from "@/pages/admin/tasks/TagCombobox";
import {
  createContentLink,
  deleteContentLink,
  fetchContentLinks,
  markContentLinkConsumed,
  updateContentLink,
} from "@/api/contentLinks";
import { createTag, fetchTags } from "@/api/tasks";
import {
  extractContentLinkDomain,
  isValidContentLinkUrl,
  normalizeContentLinkUrl,
  suggestContentLinkType,
} from "@/domain/contentLinks";
import { contrastTextColor } from "@/lib/color";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { ContentLink, ContentLinkStatus, ContentLinkType } from "@/types/contentLinks";
import type { Tag } from "@/types/tasks";
import { useToast } from "@/hooks/use-toast";

const TYPE_LABELS: Record<ContentLinkType, string> = {
  article: "Artigo",
  video: "Vídeo",
  website: "Site",
};

function emptyForm() {
  return { title: "", url: "", type: "website" as ContentLinkType, tag_ids: [] as string[] };
}

/** Ícone do domínio via serviço público de favicons — sem dependência de scraping/CORS próprio. */
function DomainFavicon({ domain }: { domain: string }) {
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
      alt=""
      className="h-4 w-4 shrink-0 rounded-sm"
    />
  );
}

export default function Links() {
  const [links, setLinks] = useState<ContentLink[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ContentLinkStatus>("to_consume");
  const [typeFilter, setTypeFilter] = useState<"all" | ContentLinkType>("all");
  const [form, setForm] = useState(emptyForm());
  const [typeManuallySet, setTypeManuallySet] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const [linkList, tagList] = await Promise.all([fetchContentLinks(), fetchTags()]);
      setLinks(linkList);
      setTags(tagList);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível carregar os links."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const tagsById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const filteredLinks = useMemo(
    () =>
      links.filter(
        (l) => l.status === statusFilter && (typeFilter === "all" || l.type === typeFilter)
      ),
    [links, statusFilter, typeFilter]
  );

  function handleUrlChange(url: string) {
    setForm((prev) => {
      const next = { ...prev, url };
      if (!typeManuallySet) {
        const suggested = suggestContentLinkType(url);
        if (suggested) next.type = suggested;
      }
      return next;
    });
  }

  async function handleCreateTag(name: string, color: string): Promise<Tag> {
    const tag = await createTag({ name, color });
    setTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
    return tag;
  }

  async function handleAdd() {
    if (!form.title.trim() || !isValidContentLinkUrl(form.url)) return;
    try {
      await createContentLink({
        title: form.title.trim(),
        url: normalizeContentLinkUrl(form.url),
        type: form.type,
        status: "to_consume",
        notes: null,
        is_favorite: false,
        tag_ids: form.tag_ids,
      });
      setForm(emptyForm());
      setTypeManuallySet(false);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível adicionar o link."),
        variant: "destructive",
      });
    }
  }

  async function toggleConsumed(link: ContentLink) {
    const previous = links;
    const consumed = link.status !== "consumed";
    setLinks((prev) =>
      prev.map((l) =>
        l.id === link.id ? { ...l, status: consumed ? "consumed" : "to_consume" } : l
      )
    );
    try {
      await markContentLinkConsumed(link.id, consumed);
    } catch (error) {
      setLinks(previous);
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível atualizar o link."),
        variant: "destructive",
      });
    }
  }

  async function toggleFavorite(link: ContentLink) {
    const previous = links;
    setLinks((prev) =>
      prev.map((l) => (l.id === link.id ? { ...l, is_favorite: !l.is_favorite } : l))
    );
    try {
      await updateContentLink({ id: link.id, is_favorite: !link.is_favorite });
    } catch (error) {
      setLinks(previous);
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível atualizar o link."),
        variant: "destructive",
      });
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteContentLink(id);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível excluir o link."),
        variant: "destructive",
      });
    }
  }

  return (
    <PageShell title="Links" description="Artigos, vídeos e sites pra consumir depois.">
      <div className="space-y-2 rounded-xl border bg-card p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <FormLabel required>URL</FormLabel>
            <Input
              value={form.url}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div>
            <FormLabel required>Título</FormLabel>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <FormLabel optional>Tipo</FormLabel>
            <Select
              value={form.type}
              onValueChange={(v) => {
                setForm({ ...form, type: v as ContentLinkType });
                setTypeManuallySet(true);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="article">Artigo</SelectItem>
                <SelectItem value="video">Vídeo</SelectItem>
                <SelectItem value="website">Site</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <FormLabel optional>Tags</FormLabel>
            <TagCombobox
              allTags={tags}
              selectedIds={form.tag_ids}
              onChange={(tag_ids) => setForm({ ...form, tag_ids })}
              onCreateTag={handleCreateTag}
            />
          </div>
        </div>
        <Button
          onClick={handleAdd}
          disabled={!form.title.trim() || !isValidContentLinkUrl(form.url)}
          className="w-full sm:w-auto"
        >
          Adicionar link
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as ContentLinkStatus)}
        >
          <TabsList>
            <TabsTrigger value="to_consume">Para consumir</TabsTrigger>
            <TabsTrigger value="consumed">Consumido</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v as "all" | ContentLinkType)}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="article">Artigos</SelectItem>
            <SelectItem value="video">Vídeos</SelectItem>
            <SelectItem value="website">Sites</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <TableLoadingSkeleton rows={4} />
      ) : filteredLinks.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="Nenhum link aqui"
          description="Cole uma URL acima pra guardar pra consumir depois."
        />
      ) : (
        <div className="space-y-2">
          {filteredLinks.map((link) => {
            const domain = extractContentLinkDomain(link.url);
            const consumed = link.status === "consumed";
            return (
              <div
                key={link.id}
                className="flex items-center gap-3 rounded-lg border bg-card p-3"
              >
                <button
                  type="button"
                  onClick={() => toggleConsumed(link)}
                  aria-label={consumed ? "Marcar para consumir" : "Marcar como consumido"}
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    consumed
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/40 hover:border-primary"
                  )}
                >
                  {consumed && <Check className="h-3 w-3" />}
                </button>
                {domain && <DomainFavicon domain={domain} />}
                <div className="min-w-0 flex-1">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      "truncate text-sm font-medium hover:underline",
                      consumed && "text-muted-foreground line-through"
                    )}
                  >
                    {link.title}
                  </a>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">
                      {TYPE_LABELS[link.type]}
                    </Badge>
                    {domain && <span>{domain}</span>}
                    {link.tag_ids
                      .map((id) => tagsById.get(id))
                      .filter((t): t is Tag => !!t)
                      .map((tag) => (
                        <Badge
                          key={tag.id}
                          className="border-none text-[10px]"
                          style={{ backgroundColor: tag.color, color: contrastTextColor(tag.color) }}
                        >
                          {tag.name}
                        </Badge>
                      ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-8 w-8",
                      link.is_favorite ? "text-amber-500" : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => toggleFavorite(link)}
                    aria-label={link.is_favorite ? "Remover favorito" : "Favoritar"}
                  >
                    <Star className={cn("h-3.5 w-3.5", link.is_favorite && "fill-current")} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    asChild
                  >
                    <a href={link.url} target="_blank" rel="noreferrer" aria-label="Abrir link">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                  <ConfirmDeleteDialog title="Excluir este link?" onConfirm={() => handleDelete(link.id)}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </ConfirmDeleteDialog>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
