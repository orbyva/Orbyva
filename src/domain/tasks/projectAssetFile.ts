/**
 * Regras puras de arquivo para a base do projeto (feature 107).
 *
 * Limite de tamanho e lista de MIME types aceitos espelham rigorosamente
 * a declaração do bucket `project-files` em `20260831130000_project_asset_file.sql`.
 * Ficam de fora, de propósito, `image/svg+xml` e `text/html` por segurança (evitar XSS armazenado).
 */

export const PROJECT_FILE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export const PROJECT_FILE_ACCEPTED_MIMES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/zip",
  "application/x-zip-compressed",
] as const;

export type ProjectFileAcceptedMime = (typeof PROJECT_FILE_ACCEPTED_MIMES)[number];

export type ProjectFileValidationReason = "file_too_large" | "unsupported_type";

export type ProjectFileValidationResult =
  | { ok: true }
  | { ok: false; reason: ProjectFileValidationReason; message: string };

/**
 * Valida tamanho e tipo MIME de um arquivo antes de tentar o upload.
 */
export function validateProjectFile(file: {
  size: number;
  type: string;
  name?: string;
}): ProjectFileValidationResult {
  if (file.size > PROJECT_FILE_MAX_BYTES) {
    return {
      ok: false,
      reason: "file_too_large",
      message: "O arquivo excede o limite de 10 MB.",
    };
  }

  const mime = file.type.toLowerCase().trim();
  if (
    !mime ||
    !(PROJECT_FILE_ACCEPTED_MIMES as readonly string[]).includes(mime)
  ) {
    return {
      ok: false,
      reason: "unsupported_type",
      message: "Tipo de arquivo não permitido.",
    };
  }

  return { ok: true };
}

/**
 * Extrai a extensão do arquivo em letras minúsculas (sem o ponto).
 */
export function projectFileExtension(
  file: { name?: string } | string
): string {
  const name = typeof file === "string" ? file : file?.name ?? "";
  const lastDot = name.lastIndexOf(".");
  if (lastDot === -1 || lastDot === name.length - 1) return "";
  return name.slice(lastDot + 1).toLowerCase();
}

/**
 * Formata o tamanho de arquivo em bytes para formato legível (B, KB, MB).
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || isNaN(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = (bytes / 1024).toFixed(1).replace(/\.0$/, "");
    return `${kb} KB`;
  }
  const mb = (bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "");
  return `${mb} MB`;
}
