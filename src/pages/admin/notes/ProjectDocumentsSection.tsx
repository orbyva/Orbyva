import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { NotebookPen, PenTool } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { createNote } from "@/api/notes/notes";
import { fetchProjectDocuments } from "@/api/notes/projectDocuments";
import { noteExcerpt } from "@/domain/notes/noteDraft";
import { canvasElementCount } from "@/domain/notes/canvasScene";
import { useToast } from "@/hooks/use-toast";
import { formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type { NoteKind, ProjectDocument } from "@/types/notes";

/**
 * "Documentos do projeto" dentro da página do projeto — as notas **e** os canvas daquele projeto.
 *
 * Nasceu na feature 055 listando só `note.project_id`; desde a 105 lista a **união** de três
 * origens (o `project_id`, o vínculo com uma tarefa do projeto e o vínculo com o próprio projeto),
 * porque a nota criada a partir de uma tarefa é justamente a que o usuário espera ver aqui e ela
 * nem sempre tem o `project_id` preenchido. Quem monta a união é
 * `fetchProjectDocuments`/`mergeProjectDocuments`.
 *
 * Desde a feature 069 vive **dentro** de uma aba da página do projeto (antes ficava empilhada
 * embaixo do quadro, sempre visível — o que comia o espaço vertical das tarefas). Por isso monta
 * só quando a aba é aberta.
 *
 * É deliberadamente somente-leitura: escrever é no editor, para onde cada item leva.
 */
interface ProjectDocumentsSectionProps {
  projectId: string;
  /**
   * Mostra o `<h2>` "Documentos do projeto". Sem ele, o título vira `aria-label` da `<section>`.
   * A 069 desligava o cabeçalho porque o gatilho da aba já era o título; com a aba hospedando mais
   * de uma seção (feature 105/106) ele volta a fazer falta.
   */
  showHeading?: boolean;
}

const SECTION_TITLE = "Documentos do projeto";
const LOAD_ERROR_TITLE = "Não foi possível carregar os documentos";

export function ProjectDocumentsSection({
  projectId,
  showHeading = true,
}: ProjectDocumentsSectionProps) {
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);
  /**
   * Terceiro estado, ao lado de "carregando" e "vazio" (feature 105). Antes, falha de rede caía no
   * `EmptyState` — o usuário lia "não há documentos" quando o que houve foi a lista não chegar, e
   * o toast já tinha sumido da tela.
   */
  const [loadFailed, setLoadFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setDocuments(await fetchProjectDocuments(projectId));
      setLoadFailed(false);
    } catch (error) {
      setLoadFailed(true);
      toast({
        variant: "destructive",
        title: LOAD_ERROR_TITLE,
        description: getErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Cria já vinculado ao projeto e abre o editor. `kind` é o que decide qual editor a rota
   * `/notes/:id` monta — nota e canvas moram na mesma tabela e na mesma lista (feature 058), e o
   * payload é o mesmo que `Notes.tsx` manda.
   */
  async function handleCreate(kind: NoteKind = "markdown") {
    setCreating(true);
    try {
      const note = await createNote({
        title: "",
        content: "",
        project_id: projectId,
        kind,
        // Canvas nasce com a cena vazia, não com `null`: o editor abre numa tela em branco de
        // verdade, e o `check` do banco já garante o par kind/canvas_data.
        canvas_data: kind === "canvas" ? { elements: [] } : null,
      });
      navigate(`/notes/${note.id}`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description:
          kind === "canvas"
            ? getErrorMessage(error, "Não foi possível criar o canvas.")
            : getErrorMessage(error, "Não foi possível criar a nota."),
      });
      // O botão volta a ficar clicável: falhar a criação não pode deixar a seção sem saída.
      setCreating(false);
    }
  }

  return (
    <section
      className="space-y-3"
      aria-labelledby={showHeading ? "project-documents-heading" : undefined}
      aria-label={showHeading ? undefined : SECTION_TITLE}
    >
      <div className="flex items-center justify-between gap-2">
        {showHeading && (
          <h2
            id="project-documents-heading"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <NotebookPen className="h-4 w-4" aria-hidden="true" />
            {SECTION_TITLE}
          </h2>
        )}
        {/*
          Dois botões lado a lado, como na página de Notas: são só duas opções, e esconder o canvas
          atrás de um clique a mais o tornaria invisível para quem não sabe que ele existe. Os dois
          desligam enquanto uma criação está no ar — dois cliques criariam dois documentos.
        */}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCreate("canvas")}
            disabled={creating}
          >
            <PenTool className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Novo canvas
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCreate("markdown")}
            disabled={creating}
          >
            Nova nota
          </Button>
        </div>
      </div>

      {loading ? (
        <TableLoadingSkeleton rows={2} />
      ) : loadFailed ? (
        <EmptyState
          icon={NotebookPen}
          title={LOAD_ERROR_TITLE}
          description="Seus documentos continuam salvos — foi a busca que não voltou."
          action={
            <Button variant="outline" onClick={() => void load()}>
              Tentar de novo
            </Button>
          }
        />
      ) : documents.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="Nenhum documento neste projeto"
          description="Aqui ficam as notas e os canvas deste projeto — inclusive os criados a partir de uma tarefa dele. Comece por uma pauta de reunião, uma decisão tomada ou um rascunho."
          action={
            // `() =>` obrigatório: passar `handleCreate` direto entregaria o MouseEvent como `kind`.
            <Button onClick={() => handleCreate("markdown")} disabled={creating}>
              Nova nota
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {documents.map((note) => {
            const isCanvas = note.kind === "canvas";
            const excerpt = isCanvas ? "" : noteExcerpt(note.content, 100);
            // Canvas não tem texto para resumir: o que informa é o tamanho do desenho — mesmo
            // idioma da lista de `Notes.tsx`.
            const elementCount = isCanvas ? canvasElementCount(note.canvas_data) : 0;
            return (
              <li key={note.id}>
                <Link
                  to={`/notes/${note.id}`}
                  className="block rounded-lg border bg-card p-3 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-center gap-2">
                    {isCanvas ? (
                      <PenTool
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-label="Canvas"
                      />
                    ) : (
                      <NotebookPen
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-label="Nota"
                      />
                    )}
                    <h3 className="truncate text-sm font-medium">{note.title}</h3>
                    {note.taskLabel && (
                      // Texto, não link: não existe rota para uma tarefa específica. O rótulo é o
                      // congelado no `note_link` (feature 056), então continua legível mesmo depois
                      // de a tarefa ser apagada.
                      <Badge
                        variant="secondary"
                        className="max-w-[45%] shrink-0 truncate text-[10px]"
                        title={`da tarefa ${note.taskLabel}`}
                      >
                        da tarefa {note.taskLabel}
                      </Badge>
                    )}
                  </div>
                  {isCanvas ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {elementCount === 0
                        ? "Canvas vazio"
                        : `Canvas · ${elementCount} ${
                            elementCount === 1 ? "elemento" : "elementos"
                          }`}
                    </p>
                  ) : (
                    excerpt && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {excerpt}
                      </p>
                    )
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Editada em {formatDateBR(note.updated_at)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
