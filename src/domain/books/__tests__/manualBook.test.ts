import { describe, expect, it } from "vitest";
import {
  MANUAL_BOOK_PREFIX,
  isManualBook,
  newManualBookId,
} from "@/domain/books";

describe("livro manual", () => {
  it("gera id com o prefixo da convenção", () => {
    const id = newManualBookId();
    expect(id.startsWith(MANUAL_BOOK_PREFIX)).toBe(true);
    expect(id.length).toBeGreaterThan(MANUAL_BOOK_PREFIX.length);
  });

  it("gera ids distintos", () => {
    expect(newManualBookId()).not.toBe(newManualBookId());
  });

  it("reconhece o próprio id como manual", () => {
    expect(isManualBook(newManualBookId())).toBe(true);
  });

  it("não confunde google_id real com manual", () => {
    expect(isManualBook("zyTCAlFPjgYC")).toBe(false);
    expect(isManualBook("")).toBe(false);
  });
});
