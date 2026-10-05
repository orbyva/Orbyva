import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import { OrbSphere } from "@/components/orb/OrbSphere";
import { OrbAvatarContext } from "@/hooks/useOrbAvatar";

const URL_ATIVA = "https://x.supabase.co/storage/v1/object/public/orb-avatars/u1/a1.png";

function comAvatar(url: string | null, ui: React.ReactNode) {
  return (
    <OrbAvatarContext.Provider value={{ url, refresh: () => undefined }}>{ui}</OrbAvatarContext.Provider>
  );
}

describe("OrbSphere", () => {
  it("sem provider desenha a esfera CSS e nenhuma imagem", () => {
    const { container } = render(<OrbSphere />);
    expect(container.querySelector(".orb-sphere")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("provider sem versão ativa também é a esfera CSS", () => {
    const { container } = render(comAvatar(null, <OrbSphere />));
    expect(container.querySelector(".orb-sphere")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("com URL ativa mostra o PNG no lugar da esfera", () => {
    const { container } = render(comAvatar(URL_ATIVA, <OrbSphere />));
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(URL_ATIVA);
    expect(img?.getAttribute("alt")).toBe("");
    expect(container.querySelector(".orb-sphere")).toBeNull();
    expect(container.querySelector(".orb-avatar--thinking")).toBeNull();
  });

  it("pensando com URL ativa: o PNG pulsa pela classe --thinking", () => {
    const { container } = render(comAvatar(URL_ATIVA, <OrbSphere state="thinking" />));
    expect(container.querySelector(".orb-avatar.orb-avatar--thinking img")).not.toBeNull();
  });

  it("PNG que falha ao carregar volta para a esfera CSS", () => {
    const { container } = render(comAvatar(URL_ATIVA, <OrbSphere />));
    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".orb-sphere")).not.toBeNull();
  });

  it("size chega à casca e à imagem", () => {
    const { container } = render(comAvatar(URL_ATIVA, <OrbSphere size={22} />));
    const casca = container.firstElementChild as HTMLElement;
    expect(casca.getAttribute("aria-hidden")).toBe("true");
    expect(casca.style.width).toBe("22px");
    const avatar = container.querySelector(".orb-avatar") as HTMLElement;
    expect(avatar.style.width).toBe("22px");
    expect(avatar.style.height).toBe("22px");
  });

  it("nova URL depois de uma falha tenta carregar de novo", () => {
    const { container, rerender } = render(comAvatar(URL_ATIVA, <OrbSphere />));
    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    const outra = URL_ATIVA.replace("a1", "a2");
    rerender(comAvatar(outra, <OrbSphere />));
    expect(container.querySelector("img")?.getAttribute("src")).toBe(outra);
  });
});
