// components/MovieCard.tsx
import { Trash2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState } from "react";
import { Movie } from "@/types/movies";

interface MovieCardProps {
  movie: Movie;
  onClick: () => void;
  onDelete: (imdbId: string) => Promise<void>;
}

export function MovieCard({ movie, onClick, onDelete }: MovieCardProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await onDelete(movie.imdb_id);
      setIsDeleteDialogOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const score =
    movie.status === "watched" ? movie.rating ?? "N/A" : movie.score_imdb;

  return (
    <div
      className="group relative cursor-pointer rounded-xl focus-within:ring-2 focus-within:ring-ring"
      onClick={onClick}
    >
      {/* Área do pôster com proporção fixa */}
      <div className="relative overflow-hidden rounded-xl bg-muted">
        {/* Botão de Delete - visível no mobile, hover no desktop */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogTrigger asChild>
            <Button
              variant="destructive"
              size="icon"
              className="
                absolute right-2 top-2 z-20
                h-10 w-10 md:h-9 md:w-9
                opacity-100 md:opacity-0
                md:group-hover:opacity-100
                transition-opacity
              "
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDeleteDialogOpen(true);
              }}
              aria-label={`Excluir ${movie.title}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </DialogTrigger>

          <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md">
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja excluir <span className="font-medium">{movie.title}</span>?
            </p>

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDeleteDialogOpen(false);
                }}
                className="w-full sm:w-auto"
              >
                Cancelar
              </Button>

              <Button
                variant="destructive"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDelete();
                }}
                disabled={isDeleting}
                className="w-full sm:w-auto"
              >
                {isDeleting ? "Excluindo..." : "Excluir"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Badge de Avaliação */}
        <div
          className="
            absolute left-2 top-2 z-10
            flex items-center gap-1 rounded-md
            bg-black/80 px-2 py-1 text-white
            text-xs sm:text-sm
          "
        >
          <Star className="h-4 w-4 fill-warning text-warning" />
          <span className="font-medium">{score}</span>
        </div>

        {/* Imagem com aspect ratio fixo (pôster) */}
        <img
          src={movie.poster || "/placeholder.svg"}
          alt={movie.title}
          className="
            aspect-[2/3] w-full
            object-cover
            transition-transform duration-300
            md:group-hover:scale-[1.02]
          "
          loading="lazy"
        />
      </div>

      {/* Texto */}
      <div className="mt-2 space-y-0.5">
        <h3 className="text-sm font-semibold leading-snug sm:text-base line-clamp-2">
          {movie.title}
        </h3>
        <p className="text-xs text-muted-foreground sm:text-sm">{movie.year}</p>
      </div>
    </div>
  );
}
