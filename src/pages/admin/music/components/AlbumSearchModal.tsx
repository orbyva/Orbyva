import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  coverArtUrl,
  searchMusicBrainz,
  type AlbumSearchHit,
} from "@/lib/musicbrainz";
import { createAlbum } from "@/api/albums";
import type { Album, AlbumCreateRequest } from "@/types/music";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DatePicker } from "@/components/DatePicker";
import { ScoreRating } from "@/components/ScoreRating";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import {
  ALBUM_TYPE_LABELS,
  formatAlbumRating,
  formatArtists,
  getAlbumRatingLabel,
  parseAlbumSearchQuery,
} from "@/domain/music";
import { getErrorMessage } from "@/lib/errors";
import { AlbumManualModal } from "./AlbumManualModal";

interface AlbumSearchModalProps {
  onAlbumAdded: () => void;
}

export function AlbumSearchModal({ onAlbumAdded }: AlbumSearchModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"search" | "details">("search");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AlbumSearchHit[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Album | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [wouldRecommend, setWouldRecommend] = useState(true);
  const [listenedDate, setListenedDate] = useState<Date>();
  const [formError, setFormError] = useState("");
  const [status, setStatus] = useState<"to_listen" | "listened">("to_listen");

  const [manualOpen, setManualOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState({ title: "", artists: "" });
  const searchAbortRef = useRef<AbortController | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
    };
  }, []);

  function openManual() {
    setManualDraft(parseAlbumSearchQuery(query));
    setIsOpen(false);
    setManualOpen(true);
  }

  function handleManualAdded() {
    setManualOpen(false);
    setIsOpen(false);
    resetState();
    onAlbumAdded();
  }

  async function handleSearch() {
    if (!query.trim()) {
      setFormError("Digite o álbum ou artista.");
      return;
    }
    setFormError("");
    setLoading(true);
    setHasSearched(false);

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    try {
      const results = await searchMusicBrainz(
        query.trim(),
        controller.signal
      );
      if (controller.signal.aborted) return;
      setSearchResults(results);
      setHasSearched(true);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      setSearchResults([]);
      setHasSearched(true);
      setFormError(getErrorMessage(error, "Falha na busca."));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function handleSelect(hit: AlbumSearchHit) {
    setSelected({
      musicbrainz_id: hit.musicbrainz_id,
      title: hit.title,
      artists: hit.artists,
      release_year: hit.release_year,
      album_type: hit.album_type,
      cover_url: coverArtUrl(hit.musicbrainz_id, 500),
      source: "musicbrainz",
      status: "to_listen",
      rating: null,
      notes: null,
      would_recommend: true,
      listened_dates: [],
    });
    setStep("details");
  }

  async function handleSave() {
    if (!selected) return;
    if (status === "listened" && !listenedDate) {
      setFormError("Informe a data em que ouviu.");
      return;
    }
    setFormError("");

    const payload: AlbumCreateRequest = {
      ...selected,
      status,
      rating: status === "listened" ? rating : null,
      notes: status === "listened" ? notes.trim() || null : null,
      would_recommend: status === "listened" ? wouldRecommend : true,
      listened_dates:
        status === "listened" && listenedDate
          ? [listenedDate.toISOString().split("T")[0]]
          : [],
    };

    try {
      await createAlbum(payload);
      toast({ title: "Sucesso", description: "Álbum adicionado!", duration: 2000 });
      resetState();
      setIsOpen(false);
      onAlbumAdded();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao adicionar."),
        variant: "destructive",
        duration: 2000,
      });
    }
  }

  function resetState() {
    searchAbortRef.current?.abort();
    setStep("search");
    setQuery("");
    setSearchResults([]);
    setHasSearched(false);
    setSelected(null);
    setRating(null);
    setNotes("");
    setWouldRecommend(true);
    setListenedDate(undefined);
    setStatus("to_listen");
    setFormError("");
    setLoading(false);
  }

  const showEmptyManualCta =
    hasSearched && searchResults.length === 0 && !loading;

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) resetState();
        }}
      >
        <DialogTrigger asChild>
          <Button className="w-full gap-2 sm:w-auto">
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        </DialogTrigger>

        <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
          <DialogTitle>
            {step === "search" ? "Buscar álbum" : "Adicionar à lista"}
          </DialogTitle>

          {step === "search" ? (
            <div className={FORM_FIELDS_CLASS}>
              <FormLabel required>Busca</FormLabel>
              <Input
                type="text"
                placeholder="Álbum ou artista…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHasSearched(false);
                  setSearchResults([]);
                  setFormError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
              />
              {formError && (
                <p className="text-sm text-destructive">{formError}</p>
              )}
              <Button
                onClick={() => void handleSearch()}
                disabled={loading}
                className="w-full"
              >
                {loading ? "Consultando MusicBrainz…" : "Buscar"}
              </Button>

              {searchResults.length > 0 && (
                <div className="max-h-[55vh] space-y-2 overflow-y-auto sm:max-h-[300px]">
                  {searchResults.map((hit) => (
                    <div
                      key={hit.musicbrainz_id}
                      className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted/50"
                      onClick={() => handleSelect(hit)}
                    >
                      <img
                        src={hit.cover_url || "/placeholder.svg"}
                        alt={hit.title}
                        className="h-14 w-14 flex-none rounded object-cover bg-muted"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            "/placeholder.svg";
                        }}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {hit.title}
                          {hit.release_year ? ` (${hit.release_year})` : ""}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {formatArtists(hit.artists)} ·{" "}
                          {ALBUM_TYPE_LABELS[hit.album_type]}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {showEmptyManualCta ? (
                <div className="space-y-3 rounded-lg border border-dashed bg-muted/30 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      Nada encontrado no MusicBrainz
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Lançamentos recentes ou regionais às vezes faltam. Cadastre
                      manualmente com capa — usamos o que você digitou como
                      ponto de partida.
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="w-full gap-2"
                    onClick={openManual}
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar manualmente
                  </Button>
                </div>
              ) : (
                <div className="border-t pt-3">
                  <p className="mb-2 text-sm text-muted-foreground">
                    Não achou o que queria?
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    onClick={openManual}
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar álbum manualmente
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3 sm:gap-4">
                <img
                  src={selected?.cover_url || "/placeholder.svg"}
                  alt={selected?.title}
                  className="h-20 w-20 flex-none rounded object-cover"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/placeholder.svg";
                  }}
                />
                <div className="min-w-0">
                  <h3 className="truncate text-base font-medium sm:text-lg">
                    {selected?.title}
                    {selected?.release_year
                      ? ` (${selected.release_year})`
                      : ""}
                  </h3>
                  <p className="truncate text-sm text-muted-foreground">
                    {formatArtists(selected?.artists ?? [])}
                    {selected
                      ? ` · ${ALBUM_TYPE_LABELS[selected.album_type]}`
                      : ""}
                  </p>
                </div>
              </div>

              <div className={FORM_FIELDS_CLASS}>
                <FormLabel required>Status</FormLabel>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant={status === "to_listen" ? "default" : "outline"}
                    onClick={() => setStatus("to_listen")}
                    className="w-full sm:w-auto"
                  >
                    Para ouvir
                  </Button>
                  <Button
                    type="button"
                    variant={status === "listened" ? "default" : "outline"}
                    onClick={() => setStatus("listened")}
                    className="w-full sm:w-auto"
                  >
                    Ouvido
                  </Button>
                </div>

                {status === "listened" && (
                  <>
                    <div>
                      <FormLabel optional>Nota</FormLabel>
                      <div className="space-y-2">
                        <ScoreRating value={rating} onChange={setRating} />
                        {rating != null && rating > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {formatAlbumRating(rating)}/10 —{" "}
                            {getAlbumRatingLabel(rating)}
                          </p>
                        )}
                      </div>
                    </div>
                    <FormLabel required>Data</FormLabel>
                    <DatePicker
                      date={listenedDate}
                      onSelect={setListenedDate}
                    />
                    <div>
                      <FormLabel optional>O que achou?</FormLabel>
                      <textarea
                        className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        placeholder="Sua opinião..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={wouldRecommend}
                        onChange={(e) => setWouldRecommend(e.target.checked)}
                        className="rounded"
                      />
                      Recomendaria
                    </label>
                  </>
                )}

                {formError && (
                  <p className="text-sm text-destructive">{formError}</p>
                )}

                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    className="w-full sm:flex-1"
                    onClick={() => setStep("search")}
                  >
                    Voltar
                  </Button>
                  <Button
                    onClick={() => void handleSave()}
                    disabled={loading}
                    className="w-full sm:flex-1"
                  >
                    {loading ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlbumManualModal
        hideTrigger
        open={manualOpen}
        onOpenChange={setManualOpen}
        initialTitle={manualDraft.title}
        initialArtists={manualDraft.artists}
        onAlbumAdded={handleManualAdded}
      />
    </>
  );
}
