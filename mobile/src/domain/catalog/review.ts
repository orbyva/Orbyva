/** Opinião do usuário sobre filme, livro ou álbum, como mostrada nas telas de catálogo. */
export interface CatalogReview {
  /** Só existe depois de terminar (assistido/lido/ouvido); antes disso é `null`. */
  recommend: boolean | null;
  notes: string | null;
}

type Reviewable = { notes?: string | null; would_recommend?: boolean | null };

/** Para o detalhe: a observação aparece sempre; o "indicaria" só depois de terminar. */
export function catalogReview(item: Reviewable, finished: boolean): CatalogReview {
  return {
    recommend: finished ? item.would_recommend !== false : null,
    notes: item.notes?.trim() || null,
  };
}

/** Para o card da lista, como no web: opinião só de quem já terminou. */
export function catalogCardReview(item: Reviewable, finished: boolean): CatalogReview {
  return finished ? catalogReview(item, true) : { recommend: null, notes: null };
}
