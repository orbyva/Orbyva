import { describe, expect, it } from "vitest";
import {
  DEFAULT_POST_LOGIN_PATH,
  authCallbackUrl,
  safeNextPath,
} from "@/lib/nextPath";

/**
 * `?next=` existe por causa do convite de evento (feature 076): quem clica no link sem sessão
 * precisa voltar para o convite depois de entrar. É exatamente o formato de parâmetro que costuma
 * virar **open redirect** — daí a bateria de tentativas abaixo.
 */
describe("safeNextPath", () => {
  it("aceita caminho absoluto do próprio app", () => {
    expect(safeNextPath("/events/invite/abc123")).toBe("/events/invite/abc123");
    expect(safeNextPath("/tasks/agenda?view=week")).toBe("/tasks/agenda?view=week");
  });

  it("sem valor, cai no destino padrão", () => {
    expect(safeNextPath(null)).toBe(DEFAULT_POST_LOGIN_PATH);
    expect(safeNextPath(undefined)).toBe(DEFAULT_POST_LOGIN_PATH);
    expect(safeNextPath("")).toBe(DEFAULT_POST_LOGIN_PATH);
  });

  it("recusa URL absoluta para outro host", () => {
    expect(safeNextPath("https://evil.com")).toBe(DEFAULT_POST_LOGIN_PATH);
    expect(safeNextPath("http://evil.com/x")).toBe(DEFAULT_POST_LOGIN_PATH);
  });

  it("recusa protocol-relative (//evil.com) — o clássico que passa por 'começa com /'", () => {
    expect(safeNextPath("//evil.com")).toBe(DEFAULT_POST_LOGIN_PATH);
    expect(safeNextPath("//evil.com/phish")).toBe(DEFAULT_POST_LOGIN_PATH);
  });

  it("recusa a variante com barra invertida, que alguns navegadores normalizam para //", () => {
    expect(safeNextPath("/\\evil.com")).toBe(DEFAULT_POST_LOGIN_PATH);
  });

  it("recusa esquemas não-http embutidos", () => {
    expect(safeNextPath("javascript:alert(1)")).toBe(DEFAULT_POST_LOGIN_PATH);
    expect(safeNextPath("/redir?u=https://evil.com")).toBe(DEFAULT_POST_LOGIN_PATH);
  });

  it("recusa caminho relativo (não começa com /)", () => {
    expect(safeNextPath("events/invite/abc")).toBe(DEFAULT_POST_LOGIN_PATH);
  });

  it("recusa caractere de controle", () => {
    expect(safeNextPath("/home\nLocation: https://evil.com")).toBe(
      DEFAULT_POST_LOGIN_PATH
    );
  });
});

describe("authCallbackUrl", () => {
  it("manda OAuth/magic link para /login?next= no AuthRoot, não para a landing", () => {
    expect(authCallbackUrl("https://orbyva.app", "/home")).toBe(
      "https://orbyva.app/login?next=%2Fhome"
    );
    expect(authCallbackUrl("https://orbyva.app", "/events/invite/tok")).toBe(
      "https://orbyva.app/login?next=%2Fevents%2Finvite%2Ftok"
    );
  });

  it("saneia next perigoso antes de montar a URL", () => {
    expect(authCallbackUrl("https://orbyva.app", "https://evil.com")).toBe(
      "https://orbyva.app/login?next=%2Fhome"
    );
  });

  it("não empilha next quando o destino já é /login", () => {
    expect(authCallbackUrl("https://orbyva.app", "/login")).toBe(
      "https://orbyva.app/login"
    );
  });
});
