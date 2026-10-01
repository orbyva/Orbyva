/**
 * Regras puras dos assets de uma linha do roteiro (feature 102) — o que rotular, o que abre inline,
 * que URL é aceitável e onde a próxima linha entra na ordem.
 *
 * Puro no sentido que importa aqui: nenhuma função faz I/O (nem rede, nem Supabase, nem
 * `document`), o que deixa todas elas testáveis com Vitest sem mock nenhum. Quem conversa com o
 * banco e com o bucket é `src/api/travel/activityAssets.ts`.
 */
import type { TripActivityAsset } from "@/types/travel";

/**
 * Mimes que podem abrir **inline** numa URL assinada. Todo o resto é assinado com `download`, e é
 * essa regra que substitui a allowlist de mime do bucket.
 *
 * O motivo é concreto: a URL assinada de um `.html` ou `.svg` renderizaria no domínio do Storage se
 * aberta inline, com o conteúdo que o usuário (ou quem lhe mandou o arquivo) escolheu. Um documento
 * que não é pdf nem imagem também não ganha nada sendo renderizado — baixar é o que se quer fazer
 * com um `.docx`. Então a lista é curta de propósito e cresce só com motivo.
 */
export function isInlineViewableMime(mime: string | null | undefined): boolean {
  const normalized = mime?.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "application/pdf") return true;
  // `image/svg+xml` fica **fora**: é markup, roda script quando aberto como navegação de topo, e é
  // o caso exato que a feature 055 desligou no resto do app.
  if (normalized === "image/svg+xml") return false;
  return normalized.startsWith("image/");
}

/**
 * O nome do arquivo dentro do `storage_path` — a última parte do caminho.
 *
 * Como o caminho é `{tripId}/{activityId}/{uuid}.{ext}`, isso quase sempre é um uuid, que não diria
 * nada na lista. Serve para o `download` da URL assinada (onde o que importa é ter extensão) e como
 * último recurso de rótulo, depois de `label`.
 */
export function fileNameFromPath(path: string | null | undefined): string {
  const trimmed = path?.trim();
  if (!trimmed) return "";
  const parts = trimmed.split("/");
  return parts[parts.length - 1] ?? "";
}

/**
 * O host de uma URL, sem `www.` — o rótulo de um link que o usuário colou sem nomear.
 *
 * Devolve `""` quando a URL não parseia: quem chama cai para o próximo recurso em vez de mostrar
 * uma string de erro.
 */
export function hostFromUrl(url: string | null | undefined): string {
  const trimmed = url?.trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed).host.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

/**
 * O que a lista mostra para um asset: o rótulo do usuário quando existe; senão o host (link) ou o
 * nome do arquivo (arquivo); e, se nada disso sobrar, um texto fechado por tipo.
 *
 * Nunca devolve `""` — a linha da lista sempre tem o que escrever.
 */
export function assetDisplayLabel(asset: TripActivityAsset): string {
  const label = asset.label?.trim();
  if (label) return label;

  if (asset.kind === "link") {
    const host = hostFromUrl(asset.url);
    if (host) return host;
    const raw = asset.url?.trim();
    return raw || "Link";
  }

  const name = fileNameFromPath(asset.storage_path);
  return name || "Arquivo";
}

/** A extensão (sem ponto, minúscula) de um nome de arquivo. `""` quando não há. */
export function fileExtension(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? "";
  const match = /\.([a-z0-9]+)$/i.exec(trimmed);
  return match ? match[1].toLowerCase() : "";
}

/** Próxima `position` da atividade: uma a mais que a maior em uso, ou 0 na lista vazia. Fica no fim
 * da lista, que é onde o usuário acabou de mandar o asset entrar. */
export function nextAssetPosition(
  assets: readonly TripActivityAsset[]
): number {
  if (assets.length === 0) return 0;
  return Math.max(...assets.map((a) => a.position)) + 1;
}

/** Ordem de exibição: `position`, com `created_at` (e depois `id`) desempatando — sem isso, dois
 * assets gravados na mesma posição trocariam de lugar entre renders. */
export function sortAssets(
  assets: readonly TripActivityAsset[]
): TripActivityAsset[] {
  return [...assets].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    const byDate = (a.created_at ?? "").localeCompare(b.created_at ?? "");
    if (byDate !== 0) return byDate;
    return a.id.localeCompare(b.id);
  });
}

export type AssetUrlRejection = "empty" | "scheme" | "malformed";

export const ASSET_URL_REJECTION_MESSAGES: Record<AssetUrlRejection, string> = {
  empty: "Cole o link antes de adicionar.",
  scheme: "O link precisa começar com http:// ou https://.",
  malformed: "Esse link não parece válido.",
};

export type AssetUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: AssetUrlRejection };

/**
 * Normaliza a URL de um link de asset: tira espaços, aceita `example.com` (vira `https://`) e
 * recusa qualquer esquema que não seja http(s).
 *
 * A recusa de esquema não é purismo: `javascript:` num `href` que a lista renderiza é execução de
 * script no nosso domínio, e `data:`/`blob:` são conteúdo arbitrário servido como se fosse nosso. O
 * campo é "cole o link da reserva", então http(s) cobre o pedido inteiro.
 *
 * O `https://` implícito existe porque colar `tap.pt` é o que as pessoas fazem, e recusar isso com
 * "precisa começar com http://" seria exigir que o usuário soubesse a regra em vez de aplicá-la.
 */
export function normalizeAssetUrl(raw: string): AssetUrlResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty" };

  // Um esquema explícito que não seja http(s) é recusa, não candidato a prefixo: prefixar
  // `javascript:alert(1)` o transformaria numa URL http válida e aparentemente inofensiva.
  const explicitScheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
  if (explicitScheme) {
    const scheme = explicitScheme[1].toLowerCase();
    if (scheme !== "http" && scheme !== "https") {
      return { ok: false, reason: "scheme" };
    }
  }

  const candidate = explicitScheme ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "scheme" };
  }
  // `https://` sozinho parseia, mas não é link de nada.
  if (!parsed.hostname || !parsed.hostname.includes(".")) {
    return { ok: false, reason: "malformed" };
  }

  return { ok: true, url: parsed.toString() };
}

/** `label` vazio vira `null`: a coluna é opcional e `''` só ocuparia espaço fingindo que há rótulo.
 * Mesma regra que `normalizeComment` aplica em `taskExternalLinks`. */
export function normalizeAssetLabel(
  label: string | null | undefined
): string | null {
  const trimmed = label?.trim();
  return trimmed ? trimmed : null;
}

/** Tamanho legível para a linha da lista. Vazio quando não há tamanho (todo link, e arquivo antigo
 * sem a coluna preenchida) — a UI omite o pedaço em vez de escrever "0 B". */
export function formatAssetSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}
