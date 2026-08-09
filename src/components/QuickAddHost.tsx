import { useEffect, useState } from "react";
import { useQuickAdd } from "@/hooks/useQuickAdd";
import { useDimensions } from "@/hooks/useDimensions";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { createTransactionApi } from "@/api/finance";
import type { TransactionCreateRequest } from "@/types/finance";
import { TransactionFormDialog } from "@/pages/admin/finance/components/TransactionFormDialog";
import { PlaceFormDialog } from "@/components/PlaceFormDialog";
import { TripFormDialog } from "@/components/TripFormDialog";
import { MovieSearchModal } from "@/pages/admin/movies/components/MovieSearchModal";
import { BookSearchModal } from "@/pages/admin/books/components/BookSearchModal";
import { AlbumSearchModal } from "@/pages/admin/music/components/AlbumSearchModal";
import { VehicleFormDialog } from "@/pages/admin/car/components/VehicleFormDialog";

const emptyTx = (): TransactionCreateRequest => ({
  class_id: 0,
  value: 0,
  description: "",
  transaction_at: new Date().toISOString(),
});

/**
 * Monta formulários de criação no overlay do layout (Quick Add),
 * sem navegar para a página do módulo.
 */
export function QuickAddHost() {
  const { activeAction, closeAction } = useQuickAdd();
  const { toast } = useToast();
  const txOpen = activeAction === "transaction";
  const { dimensions } = useDimensions({ enabled: txOpen });
  const [tx, setTx] = useState<TransactionCreateRequest>(emptyTx);

  useEffect(() => {
    if (txOpen) setTx(emptyTx());
  }, [txOpen]);

  async function saveTransaction() {
    try {
      await createTransactionApi(tx);
      toast({ title: "Transação registrada", duration: 2000 });
      closeAction();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar."),
        variant: "destructive",
      });
    }
  }

  return (
    <>
      <TransactionFormDialog
        open={txOpen}
        setOpen={(open) => {
          if (!open) closeAction();
        }}
        newTransaction={tx}
        setNewTransaction={setTx}
        createTransaction={() => void saveTransaction()}
        dimensions={dimensions}
        isEditing={false}
        onClose={closeAction}
        preferredNatureName="Despesa"
        hideTrigger
      />

      <PlaceFormDialog
        open={activeAction === "place"}
        onOpenChange={(open) => {
          if (!open) closeAction();
        }}
        onSaved={closeAction}
      />

      <TripFormDialog
        open={activeAction === "trip"}
        onOpenChange={(open) => {
          if (!open) closeAction();
        }}
        onSaved={closeAction}
      />

      <VehicleFormDialog
        open={activeAction === "vehicle"}
        onOpenChange={(open) => {
          if (!open) closeAction();
        }}
        onSaved={closeAction}
      />

      <MovieSearchModal
        open={activeAction === "movie"}
        onOpenChange={(open) => {
          if (!open) closeAction();
        }}
        onMovieAdded={closeAction}
        hideTrigger
      />

      <BookSearchModal
        open={activeAction === "book"}
        onOpenChange={(open) => {
          if (!open) closeAction();
        }}
        onBookAdded={closeAction}
        hideTrigger
      />

      <AlbumSearchModal
        open={activeAction === "music"}
        onOpenChange={(open) => {
          if (!open) closeAction();
        }}
        onAlbumAdded={closeAction}
        hideTrigger
      />
    </>
  );
}
