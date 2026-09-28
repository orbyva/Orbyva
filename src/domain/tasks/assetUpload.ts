/**
 * Regra pura da recusa de upload da biblioteca de assets (feature 131).
 *
 * Existe porque hoje um arquivo de 3 MB sobe até o bucket só para voltar com a mensagem crua do
 * Supabase em inglês: o teto de 1 MB é do bucket `task-icons` (`20260814010000_task_icon.sql`) e
 * quem o aplica continua sendo o storage. O que muda aqui é **dizer o motivo antes**, em português
 * e com o tamanho do arquivo na frase — a barreira de segurança segue em `uploadIconAsset`
 * (`src/api/tasks/iconAssets.ts`), esta é só a cortesia de não gastar a subida.
 *
 * Sem I/O e sem React de propósito: é `{ size, type }`, não `File`, para o teste poder descrever um
 * arquivo de 3 MB sem alocar 3 MB.
 */

const BYTES_IN_KB = 1024;
const BYTES_IN_MB = 1024 * BYTES_IN_KB;

/** Teto do bucket `task-icons`. Continua 1 MB nesta rodada (resposta do usuário: "recomendado"). */
export const ASSET_MAX_BYTES = BYTES_IN_MB;

/**
 * Os mesmos tipos do `accept` do seletor de arquivo e do `EXTENSION_BY_MIME` de
 * `src/api/tasks/iconAssets.ts` — a lista está aqui para os dois lados lerem o mesmo conjunto em
 * vez de repetirem a string à mão.
 */
export const ASSET_ACCEPT_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
] as const;

/** O valor do atributo `accept` do `<input type="file">`, montado da lista acima. */
export const ASSET_ACCEPT_ATTR = ASSET_ACCEPT_MIMES.join(",");

export const ASSET_FORMAT_REJECTION = "Formato não aceito: envie PNG, JPEG, WebP ou SVG.";

/**
 * A frase da recusa, ou `null` quando o arquivo pode subir.
 *
 * O formato é checado antes do tamanho: um `.txt` de 5 MB é recusado por ser `.txt`, que é a razão
 * que o usuário consegue consertar trocando de arquivo — dizer "grande demais" o faria tentar
 * comprimir um arquivo que nunca seria aceito.
 */
export function assetUploadRejection(file: { size: number; type: string }): string | null {
  if (!(ASSET_ACCEPT_MIMES as readonly string[]).includes(file.type)) {
    return ASSET_FORMAT_REJECTION;
  }
  if (file.size > ASSET_MAX_BYTES) {
    return `Este arquivo tem ${formatAssetSize(file.size)} — o limite é 1 MB.`;
  }
  return null;
}

/**
 * Tamanho legível em português: `3,2 MB`, `640 KB`.
 *
 * Abaixo de 1 MB sai em KB inteiro, porque "0,6 MB" não ajuda ninguém a decidir o que fazer.
 */
export function formatAssetSize(bytes: number): string {
  if (bytes >= BYTES_IN_MB) {
    const mb = Math.round((bytes / BYTES_IN_MB) * 10) / 10;
    return `${mb.toFixed(1).replace(".", ",")} MB`;
  }
  return `${Math.round(bytes / BYTES_IN_KB)} KB`;
}
