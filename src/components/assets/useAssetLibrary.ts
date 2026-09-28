import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import {
  deleteIconAsset,
  fetchIconAssets,
  renameIconAsset,
} from "@/api/tasks/iconAssets";
import type { IconAsset } from "@/types/tasks";

/**
 * O estado da biblioteca de assets do usuário (feature 086, extraída do `TaskIconPicker` na 131):
 * a lista, o carregamento preguiçoso e as operações que mexem na lista.
 *
 * **Importa `@/api/tasks/iconAssets` direto, nunca o barril `@/api/tasks`.** O barril reexporta a
 * API de tarefas, de recorrência e de links externos; importá-lo de um componente que a tela de
 * Notas vai montar (132) arrastaria esse grafo inteiro para o chunk de `/notes` — a mesma armadilha
 * registrada nas Notas da feature 105.
 *
 * O carregamento é preguiçoso de propósito: o picker aparece em toda linha da Lista, do Kanban e do
 * Gantt, e buscar a lista na montagem seria uma consulta por card. `enabled` é o gatilho (o popover
 * abriu, o painel apareceu) e `loadedRef` garante **uma** busca por abertura bem-sucedida — um erro
 * libera a próxima tentativa.
 */
export interface AssetLibraryController {
  assets: IconAsset[];
  loading: boolean;
  /** A busca falhou. Uma linha de aviso na UI, sem derrubar o resto da tela que a monta. */
  error: boolean;
  /** Id do asset com uma operação em voo (renomear/excluir) — desabilita o botão daquela linha. */
  busyId: string | null;
  /** Põe na frente da lista um asset criado fora daqui (o upload devolve a linha pronta). */
  adopt: (asset: IconAsset) => void;
  /** `true` quando gravou; `false` quando falhou (o toast de erro já foi mostrado). */
  rename: (asset: IconAsset, name: string) => Promise<boolean>;
  remove: (asset: IconAsset) => Promise<boolean>;
}

export function useAssetLibrary({ enabled }: { enabled: boolean }): AssetLibraryController {
  const [assets, setAssets] = useState<IconAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!enabled || loadedRef.current) return;
    loadedRef.current = true;
    let cancelled = false;
    let settled = false;
    setLoading(true);
    setError(false);
    fetchIconAssets()
      .then((rows) => {
        if (!cancelled) setAssets(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        loadedRef.current = false;
      })
      .finally(() => {
        settled = true;
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (!settled) {
        // A abertura foi interrompida antes de a busca terminar. Libera uma nova tentativa e
        // encerra o skeleton; caso contrário, reabrir a biblioteca ficaria preso em `loading`.
        loadedRef.current = false;
        setLoading(false);
      }
    };
  }, [enabled]);

  const adopt = useCallback((asset: IconAsset) => {
    setAssets((prev) => [asset, ...prev]);
  }, []);

  /** Troca o rótulo na lista já carregada em vez de refazer a busca: o nome é só rótulo, e
   * recarregar tudo piscaria a lista inteira por causa de uma palavra. */
  const rename = useCallback(
    async (asset: IconAsset, name: string) => {
      setBusyId(asset.id);
      try {
        await renameIconAsset(asset.id, name);
        setAssets((prev) => prev.map((row) => (row.id === asset.id ? { ...row, name } : row)));
        return true;
      } catch (error) {
        toast({
          title: "Erro",
          description: getErrorMessage(error, "Não foi possível renomear o ícone."),
          variant: "destructive",
        });
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [toast]
  );

  /** Tira da lista e **só** da lista: o arquivo continua no bucket (decisão da 086), então quem já
   * aponta para aquela URL continua mostrando o ícone. */
  const remove = useCallback(
    async (asset: IconAsset) => {
      setBusyId(asset.id);
      try {
        await deleteIconAsset(asset.id);
        setAssets((prev) => prev.filter((row) => row.id !== asset.id));
        return true;
      } catch (error) {
        toast({
          title: "Erro",
          description: getErrorMessage(error, "Não foi possível excluir o ícone."),
          variant: "destructive",
        });
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [toast]
  );

  return { assets, loading, error, busyId, adopt, rename, remove };
}
