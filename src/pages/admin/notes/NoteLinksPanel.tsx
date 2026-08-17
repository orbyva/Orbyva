import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Command } from "cmdk";
import {
  Album,
  BookOpen,
  Car,
  CheckSquare,
  Film,
  Folder,
  Link2,
  MapPin,
  Plus,
  Repeat,
  Search,
  Target,
  Plane,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import { FormLabel } from "@/components/FormLabel";
import { ProjectPicker } from "@/pages/admin/tasks/ProjectPicker";
import {
  addNoteLink,
  fetchLinksForNote,
  removeNoteLink,
} from "@/api/notes/noteLinks";
import { searchGlobal, SEARCH_KIND_LABEL } from "@/api/search";
import type { GlobalSearchHit } from "@/api/search";
import {
  NOTE_LINK_TYPE_LABEL,
  noteLinkHref,
  noteLinkTypeFromSearchKind,
} from "@/domain/notes/noteLinkTargets";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { NoteLink, NoteLinkEntityType } from "@/types/notes";
import type { Project } from "@/types/tasks";

/** Ícone por tipo — o mesmo vocabulário visual que cada módulo usa na sidebar. */
const TYPE_ICON: Record<NoteLinkEntityType, LucideIcon> = {
  project: Folder,
  task: CheckSquare,
  book: BookOpen,
  movie: Film,
  album: Album,
  trip: Plane,
  place: MapPin,
  goal: Target,
  habit: Repeat,
  vehicle: Car,
};

const SEARCH_DEBOUNCE_MS = 280;

/**
 * Seção "Vínculos" do editor de nota (feature 056): a nota apontando para qualquer entidade do app
 * — a parte "CONVERSAM COM TUDO" do prompt-mãe.
 *
 * Duas formas de vincular, de propósito: `ProjectPicker` (projeto é o vínculo mais comum e já tem
 * componente pronto, reusado aqui) e a busca global, que acha meta, livro, viagem, hábito etc. sem
 * uma tela de seleção por módulo. O rótulo do que foi achado é **congelado** no vínculo (`label`),
 * então a lista continua legível mesmo depois de a entidade sumir — e o vínculo órfão é caso
 * previsto, não bug (ver Decisões da 056).
 */
export function NoteLinksPanel({
  noteId,
  projects,
}: {
  noteId: string;
  projects: Project[];
}) {
  const [links, setLinks] = useState<NoteLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLinks(await fetchLinksForNote(noteId));
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar os vínculos",
        description: getErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  }, [noteId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(
    entityType: NoteLinkEntityType,
    entityId: string,
    label: string
  ) {
    // Checagem local só para a mensagem ficar amigável: quem garante a unicidade é o
    // `unique (note_id, entity_type, entity_id)` do banco.
    if (
      links.some(
        (link) => link.entity_type === entityType && link.entity_id === entityId
      )
    ) {
      toast({ title: "Esta nota já está vinculada a isso", duration: 2000 });
      setOpen(false);
      return;
    }
    try {
      const created = await addNoteLink({
        note_id: noteId,
        entity_type: entityType,
        entity_id: entityId,
        label,
      });
      setLinks((prev) => [...prev, created]);
      setOpen(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Não foi possível vincular",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleRemove(link: NoteLink) {
    // Some da tela na hora; volta se o banco recusar — desfazer um vínculo não precisa de spinner.
    setLinks((prev) => prev.filter((item) => item.id !== link.id));
    try {
      await removeNoteLink(link.id);
    } catch (error) {
      setLinks((prev) => [...prev, link]);
      toast({
        variant: "destructive",
        title: "Não foi possível remover o vínculo",
        description: getErrorMessage(error),
      });
    }
  }

  return (
    <section className="space-y-2" aria-labelledby="note-links-heading">
      <div className="flex items-center justify-between gap-2">
        <h2
          id="note-links-heading"
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <Link2 className="h-4 w-4" aria-hidden="true" />
          Vínculos
        </h2>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Vincular
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando vínculos…</p>
      ) : links.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="Nenhum vínculo ainda"
          description="Ligue esta nota a um projeto, meta, livro, viagem — o que ela comenta."
          className="py-8"
        />
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {links.map((link) => {
            const Icon = TYPE_ICON[link.entity_type];
            const name = link.label ?? "Referência removida";
            return (
              <li key={link.id}>
                <span className="flex items-center gap-1.5 rounded-full border bg-card py-1 pl-2.5 pr-1 text-xs">
                  <Icon
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Link
                    to={noteLinkHref(link.entity_type, link.entity_id)}
                    className="max-w-[16rem] truncate hover:underline"
                  >
                    <span className="text-muted-foreground">
                      {NOTE_LINK_TYPE_LABEL[link.entity_type]}:{" "}
                    </span>
                    {name}
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleRemove(link)}
                    aria-label={`Remover vínculo ${name}`}
                    className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <AddLinkDialog
        open={open}
        onOpenChange={setOpen}
        projects={projects}
        onPick={handleAdd}
      />
    </section>
  );
}

/**
 * Diálogo de vincular: lista de projetos (o caso mais comum, com o `ProjectPicker` já existente) e
 * a busca global para o resto. A busca é a mesma `searchGlobal` do Ctrl+K — nenhum índice novo,
 * nenhuma consulta paralela por módulo.
 */
function AddLinkDialog({
  open,
  onOpenChange,
  projects,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  onPick: (
    entityType: NoteLinkEntityType,
    entityId: string,
    label: string
  ) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GlobalSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  const runSearch = useCallback(
    (next: string) => {
      setQuery(next);
      if (timer.current) clearTimeout(timer.current);
      if (next.trim().length < 2) {
        setHits([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      timer.current = setTimeout(async () => {
        try {
          const found = await searchGlobal(next);
          // Fora da lista fechada de `entity_type` (lançamento, nota) não é vinculável aqui.
          setHits(found.filter((hit) => noteLinkTypeFromSearchKind(hit.kind)));
        } catch (error) {
          toast({
            variant: "destructive",
            title: "Erro na busca",
            description: getErrorMessage(error),
          });
        } finally {
          setSearching(false);
        }
      }, SEARCH_DEBOUNCE_MS);
    },
    [toast]
  );

  useEffect(() => {
    if (open) return;
    // Fechou: limpa, para o próximo "Vincular" não abrir com o resultado velho.
    setQuery("");
    setHits([]);
    if (timer.current) clearTimeout(timer.current);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular a nota</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <FormLabel>Projeto</FormLabel>
            <ProjectPicker
              projects={projects}
              value={null}
              onChange={(projectId) => {
                if (!projectId) return;
                const project = projects.find((p) => p.id === projectId);
                onPick("project", projectId, project?.name ?? "Projeto");
              }}
            />
          </div>

          <div className="space-y-1.5">
            <FormLabel>Buscar em todo o app</FormLabel>
            <Command shouldFilter={false} className="rounded-md border">
              <div className="flex items-center border-b px-3">
                <Search
                  className="mr-2 h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <Command.Input
                  // `aria-label` e não `htmlFor`/`id`: o `Command.Input` do cmdk não repassa `id`
                  // para o `<input>`, então o rótulo ficaria sem par.
                  aria-label="Buscar em todo o app"
                  value={query}
                  onValueChange={runSearch}
                  placeholder="Meta, livro, viagem, hábito…"
                  className="flex h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <Command.List className="max-h-56 overflow-y-auto p-1">
                {searching ? (
                  <p className="px-2 py-3 text-xs text-muted-foreground">
                    Buscando…
                  </p>
                ) : hits.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-muted-foreground">
                    {query.trim().length < 2
                      ? "Digite ao menos 2 letras."
                      : "Nada encontrado."}
                  </p>
                ) : (
                  hits.map((hit) => {
                    const entityType = noteLinkTypeFromSearchKind(hit.kind);
                    if (!entityType) return null;
                    const Icon = TYPE_ICON[entityType];
                    return (
                      <Command.Item
                        key={`${hit.kind}-${hit.id}`}
                        value={`${hit.kind}-${hit.id}`}
                        onSelect={() => onPick(entityType, hit.id, hit.title)}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm",
                          "data-[selected=true]:bg-muted"
                        )}
                      >
                        <Icon
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="truncate">{hit.title}</span>
                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                          {SEARCH_KIND_LABEL[hit.kind]}
                        </span>
                      </Command.Item>
                    );
                  })
                )}
              </Command.List>
            </Command>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
