/**
 * Rascunhos de asset de uma linha do roteiro (feature 257) — o que o formulário de **criação**
 * acumula enquanto a atividade ainda não existe.
 *
 * A feature 102 deu assets às linhas do roteiro, mas só depois de salvas: upload precisa de
 * `activity_id`. Um rascunho é a ponte — o `File` escolhido ou a URL digitada, mais o rótulo —, e
 * nada vai ao bucket enquanto o evento não for criado. É o que permite cancelar o formulário sem
 * deixar arquivo órfão no storage.
 *
 * Puro no mesmo sentido de `activityAssets.ts`: nenhuma função faz I/O. Quem grava é
 * `createActivityAssetDrafts` (`src/api/travel/activityAssets.ts`).
 */
import {
  ASSET_URL_REJECTION_MESSAGES,
  hostFromUrl,
  normalizeAssetLabel,
  normalizeAssetUrl,
  type AssetUrlRejection,
} from "./activityAssets";

export { ASSET_URL_REJECTION_MESSAGES };
export type { AssetUrlRejection };

/**
 * Teto por arquivo, o mesmo do bucket `trip-assets`
 * (`20260930120000_trip_activity_asset.sql`).
 *
 * Mora aqui, e não no diálogo, porque agora há **dois** caminhos de anexo (o diálogo do card e o
 * rascunho do formulário) e duas constantes iguais em arquivos diferentes é como uma das duas fica
 * para trás.
 */
export const MAX_ACTIVITY_ASSET_BYTES = 10 * 1024 * 1024;

/** Rascunho de arquivo: o `File` do seletor, que só vira objeto no bucket depois do insert. */
export type ActivityAssetFileDraft = {
  /** Identidade local da linha na lista — não é id de banco, só chave de render e de remoção. */
  key: string;
  kind: "file";
  file: File;
  label: string | null;
};

/** Rascunho de link: a URL **já normalizada** por `normalizeAssetUrl`. */
export type ActivityAssetLinkDraft = {
  key: string;
  kind: "link";
  url: string;
  label: string | null;
};

export type ActivityAssetDraft = ActivityAssetFileDraft | ActivityAssetLinkDraft;

let counter = 0;

/** Chave local estável. Não usa `crypto.randomUUID` por nada além de simplicidade: a chave morre
 * quando o formulário fecha e nunca chega ao banco. */
function nextKey(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function fileDraft(file: File, label?: string | null): ActivityAssetFileDraft {
  return {
    key: nextKey("file"),
    kind: "file",
    file,
    // Sem rótulo explícito, o nome do arquivo é o melhor rótulo que existe — é o mesmo default que
    // `uploadActivityFileAsset` aplica do lado de lá.
    label: normalizeAssetLabel(label) ?? normalizeAssetLabel(file.name),
  };
}

export type LinkDraftResult =
  | { ok: true; draft: ActivityAssetLinkDraft }
  | { ok: false; reason: AssetUrlRejection };

/**
 * Monta o rascunho de link, **validando a URL na hora de adicionar** e não na gravação.
 *
 * Descobrir no "Salvar" que o link estava torto seria descobrir junto com o evento já criado — e a
 * recusa tem de aparecer no campo que a causou.
 */
export function linkDraft(rawUrl: string, label?: string | null): LinkDraftResult {
  const normalized = normalizeAssetUrl(rawUrl);
  if (!normalized.ok) return { ok: false, reason: normalized.reason };
  return {
    ok: true,
    draft: {
      key: nextKey("link"),
      kind: "link",
      url: normalized.url,
      label: normalizeAssetLabel(label),
    },
  };
}

/**
 * O que a lista de rascunhos mostra: o rótulo quando existe; senão o host (link) ou o nome do
 * arquivo. Nunca devolve `""` — espelha `assetDisplayLabel`, que faz o mesmo para o asset já salvo.
 */
export function draftDisplayLabel(draft: ActivityAssetDraft): string {
  const label = draft.label?.trim();
  if (label) return label;
  if (draft.kind === "link") return hostFromUrl(draft.url) || draft.url || "Link";
  return draft.file.name || "Arquivo";
}

/** Tamanho do rascunho, para a linha da lista. Link não tem. */
export function draftSizeBytes(draft: ActivityAssetDraft): number | null {
  return draft.kind === "file" ? draft.file.size : null;
}

/**
 * Separa os arquivos que cabem no teto dos que não cabem, em vez de recusar o lote inteiro no
 * primeiro grande: quem escolheu cinco arquivos e errou em um quer os outros quatro.
 */
export function splitOversizedFiles(files: readonly File[]): {
  accepted: File[];
  oversized: File[];
} {
  const accepted: File[] = [];
  const oversized: File[] = [];
  for (const file of files) {
    (file.size > MAX_ACTIVITY_ASSET_BYTES ? oversized : accepted).push(file);
  }
  return { accepted, oversized };
}

/** A frase da recusa por tamanho, com os nomes dos arquivos — "o limite" sem dizer qual arquivo
 * obrigaria o usuário a adivinhar qual dos cinco passou. */
export function oversizedMessage(files: readonly File[]): string {
  const names = files.map((f) => `“${f.name}”`).join(", ");
  return `${names} ${files.length > 1 ? "passam" : "passa"} de 10 MB, o limite por arquivo.`;
}

/** Tira um rascunho da lista pela chave local. */
export function removeDraft(
  drafts: readonly ActivityAssetDraft[],
  key: string
): ActivityAssetDraft[] {
  return drafts.filter((d) => d.key !== key);
}
