import { describe, expect, it } from "vitest";

import { userAvatarUrl } from "../userAvatar";

describe("userAvatarUrl", () => {
  it("usa avatar_url quando existe", () => {
    expect(
      userAvatarUrl({ user_metadata: { avatar_url: "https://a/x.png", picture: "https://b/y.png" } })
    ).toBe("https://a/x.png");
  });

  it("cai para picture quando avatar_url falta ou está vazio", () => {
    expect(userAvatarUrl({ user_metadata: { avatar_url: " ", picture: "https://b/y.png" } })).toBe(
      "https://b/y.png"
    );
  });

  it("devolve vazio sem usuário, sem metadata ou com valor que não é texto", () => {
    expect(userAvatarUrl(null)).toBe("");
    expect(userAvatarUrl({})).toBe("");
    expect(userAvatarUrl({ user_metadata: { avatar_url: 42 } })).toBe("");
  });
});
