import { describe, expect, it } from "vitest";
import {
  ASSET_ACCEPT_ATTR,
  ASSET_ACCEPT_MIMES,
  ASSET_FORMAT_REJECTION,
  ASSET_MAX_BYTES,
  assetUploadRejection,
  formatAssetSize,
} from "@/domain/tasks/assetUpload";

/**
 * Feature 131 — a recusa que hoje só acontece **depois** da subida, em inglês e sem dizer o
 * tamanho. O que estes testes fixam é a borda (1 MB exato passa) e o conteúdo da frase: é ela que
 * o usuário lê no toast, e é por causa dela que a checagem saiu do bucket para a tela.
 */
const MB = 1024 * 1024;

describe("assetUploadRejection", () => {
  it("1 MB exato passa — o teto do bucket é inclusivo", () => {
    expect(ASSET_MAX_BYTES).toBe(MB);
    expect(assetUploadRejection({ size: MB, type: "image/png" })).toBeNull();
  });

  it("1 MB + 1 byte é recusado, com o tamanho do arquivo na frase", () => {
    const rejection = assetUploadRejection({ size: MB + 1, type: "image/png" });

    expect(rejection).not.toBeNull();
    // Um byte acima do teto arredonda para "1,0 MB": a frase continua dizendo o tamanho medido, e
    // é o "— o limite é 1 MB" que explica por que ele não passa.
    expect(rejection).toBe("Este arquivo tem 1,0 MB — o limite é 1 MB.");
  });

  it("arquivo claramente grande diz o tamanho em MB, com vírgula decimal", () => {
    expect(assetUploadRejection({ size: Math.round(3.2 * MB), type: "image/png" })).toBe(
      "Este arquivo tem 3,2 MB — o limite é 1 MB."
    );
  });

  it("mime fora da lista é recusado pelo formato, não pelo tamanho", () => {
    expect(assetUploadRejection({ size: 1024, type: "text/plain" })).toBe(
      ASSET_FORMAT_REJECTION
    );
    expect(assetUploadRejection({ size: 1024, type: "" })).toBe(ASSET_FORMAT_REJECTION);
    // Um `.txt` de 5 MB erra nas duas coisas: a razão que o usuário consegue consertar é o formato.
    expect(assetUploadRejection({ size: 5 * MB, type: "text/plain" })).toBe(
      ASSET_FORMAT_REJECTION
    );
  });

  it("image/svg+xml é aceito — colar SVG e escolher um .svg no seletor são o mesmo caminho", () => {
    expect(assetUploadRejection({ size: 4 * 1024, type: "image/svg+xml" })).toBeNull();
  });

  it("os quatro formatos anunciados na frase de recusa são os quatro aceitos", () => {
    expect([...ASSET_ACCEPT_MIMES]).toEqual([
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/svg+xml",
    ]);
    for (const mime of ASSET_ACCEPT_MIMES) {
      expect(assetUploadRejection({ size: 10 * 1024, type: mime })).toBeNull();
    }
    expect(ASSET_ACCEPT_ATTR).toBe("image/png,image/jpeg,image/webp,image/svg+xml");
  });
});

describe("formatAssetSize", () => {
  it("abaixo de 1 MB sai em KB inteiro", () => {
    expect(formatAssetSize(10 * 1024)).toBe("10 KB");
    expect(formatAssetSize(640 * 1024)).toBe("640 KB");
  });

  it("de 1 MB para cima sai em MB com uma casa e vírgula", () => {
    expect(formatAssetSize(MB)).toBe("1,0 MB");
    expect(formatAssetSize(Math.round(2.5 * MB))).toBe("2,5 MB");
  });
});
