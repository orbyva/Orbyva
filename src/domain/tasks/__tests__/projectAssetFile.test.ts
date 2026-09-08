import { describe, it, expect } from "vitest";
import {
  PROJECT_FILE_MAX_BYTES,
  validateProjectFile,
  projectFileExtension,
  formatFileSize,
} from "../projectAssetFile";

describe("validateProjectFile", () => {
  it("aceita arquivo válido dentro do limite", () => {
    const file = {
      name: "documento.pdf",
      size: 1024 * 1024, // 1 MB
      type: "application/pdf",
    };
    const result = validateProjectFile(file);
    expect(result.ok).toBe(true);
  });

  it("recusa arquivo acima do teto de 10 MB com razão file_too_large", () => {
    const file = {
      name: "pesado.zip",
      size: PROJECT_FILE_MAX_BYTES + 1,
      type: "application/zip",
    };
    const result = validateProjectFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("file_too_large");
    }
  });

  it("recusa image/svg+xml por segurança (XSS armazenado evitado)", () => {
    const file = {
      name: "icone.svg",
      size: 2048,
      type: "image/svg+xml",
    };
    const result = validateProjectFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unsupported_type");
    }
  });

  it("recusa text/html por segurança (XSS armazenado evitado)", () => {
    const file = {
      name: "pagina.html",
      size: 1024,
      type: "text/html",
    };
    const result = validateProjectFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unsupported_type");
    }
  });

  it("tipo aceito com extensão estranha passa (validação olha para MIME type)", () => {
    const file = {
      name: "documento.customext",
      size: 5000,
      type: "application/pdf",
    };
    const result = validateProjectFile(file);
    expect(result.ok).toBe(true);
  });
});

describe("projectFileExtension", () => {
  it("extrai a extensão corretamente a partir de string ou objeto", () => {
    expect(projectFileExtension("relatorio.PDF")).toBe("pdf");
    expect(projectFileExtension({ name: "planilha.xlsx" })).toBe("xlsx");
    expect(projectFileExtension("arquivo_sem_extensao")).toBe("");
    expect(projectFileExtension("arquivo.")).toBe("");
  });
});

describe("formatFileSize", () => {
  it("formata tamanhos em B, KB e MB adequadamente", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(1024 * 1024)).toBe("1 MB");
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatFileSize(10 * 1024 * 1024)).toBe("10 MB");
  });
});
