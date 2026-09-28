import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SVG_ICON_PREVIEW_EMPTY,
  SVG_ICON_REMOVED_WARNING,
  SvgIconPasteField,
  svgDataUri,
} from "@/components/assets/SvgIconPasteField";

/**
 * O campo de colar SVG (feature 086) visto pelo que o usuário faz nele: colar, ver a prévia do que
 * **vai ser salvo**, e salvar. A matriz de payloads maliciosos mora em `svgIconSecurity.test.tsx`;
 * aqui o que se prova é o comportamento do formulário — inclusive que o `onSave` recebe o markup
 * limpo, não o colado.
 */

const CLEAN = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>';
const DIRTY = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="4"/></svg>';

/** O campo é controlado no markup (o popover precisa poder preenchê-lo pelo `onPaste`), então o
 * harness segura esse estado como o `TaskIconPicker` segura. */
function Harness({
  onSave = vi.fn(),
  onCancel = vi.fn(),
  initial = "",
}: {
  onSave?: (input: { svg: string; name: string }) => void;
  onCancel?: () => void;
  initial?: string;
}) {
  const [markup, setMarkup] = useState(initial);
  return (
    <SvgIconPasteField
      markup={markup}
      onMarkupChange={setMarkup}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
}

async function paste(user: ReturnType<typeof userEvent.setup>, markup: string) {
  await user.click(screen.getByLabelText(/Markup do SVG/));
  await user.paste(markup);
}

describe("SvgIconPasteField", () => {
  it("começa sem prévia e diz o que fazer para ter uma", () => {
    render(<Harness />);

    expect(screen.getByText(SVG_ICON_PREVIEW_EMPTY)).toBeInTheDocument();
    expect(screen.queryByAltText("Prévia do ícone")).not.toBeInTheDocument();
  });

  it("colar um SVG válido mostra a prévia por <img> com o data URI do markup limpo", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await paste(user, CLEAN);

    const preview = await screen.findByAltText("Prévia do ícone");
    // Por `<img>` com data URI, nunca inline: é a segunda barreira da feature.
    expect(preview.tagName).toBe("IMG");
    const src = preview.getAttribute("src") ?? "";
    expect(src.startsWith("data:image/svg+xml,")).toBe(true);
    expect(src).toBe(svgDataUri(decodeURIComponent(src.slice("data:image/svg+xml,".length))));
    // O markup reserializado é equivalente, não idêntico (`<circle/>` vira `<circle></circle>` no
    // parser) — o que importa é o namespace e o desenho terem sobrevivido.
    const decoded = decodeURIComponent(src);
    expect(decoded).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(decoded).toContain("<circle");
    expect(screen.queryByText(SVG_ICON_PREVIEW_EMPTY)).not.toBeInTheDocument();
  });

  // O parser de HTML normaliza a serialização, mas **não** pode achatar `viewBox` para `viewbox`:
  // sem ele o SVG vira arquivo sem sistema de coordenadas e o `<img>` desenha em branco.
  it("atributos que dependem de caixa alta (viewBox) sobrevivem à limpeza", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await paste(
      user,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>'
    );

    const src = (await screen.findByAltText("Prévia do ícone")).getAttribute("src") ?? "";
    expect(decodeURIComponent(src)).toContain('viewBox="0 0 24 24"');
  });

  it("a prévia de um SVG sujo é a do limpo, com o aviso de remoção", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await paste(user, DIRTY);

    const src = (await screen.findByAltText("Prévia do ícone")).getAttribute("src") ?? "";
    expect(decodeURIComponent(src)).not.toContain("<script");
    expect(decodeURIComponent(src)).toContain("<circle");
    expect(screen.getByText(SVG_ICON_REMOVED_WARNING)).toBeInTheDocument();
  });

  it("SVG limpo não acende o aviso de remoção", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await paste(user, CLEAN);

    expect(await screen.findByAltText("Prévia do ícone")).toBeInTheDocument();
    expect(screen.queryByText(SVG_ICON_REMOVED_WARNING)).not.toBeInTheDocument();
  });

  it("onSave recebe o SVG limpo (nunca o colado) e o nome digitado", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);

    await paste(user, DIRTY);
    await user.type(screen.getByLabelText(/Nome na lista/), "  Bolinha  ");
    await user.click(screen.getByRole("button", { name: "Salvar ícone" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const { svg, name } = onSave.mock.calls[0][0];
    expect(name).toBe("Bolinha");
    expect(svg).not.toContain("<script");
    expect(svg).toContain("<circle");
  });

  it("sem nome, salva mesmo assim (o rótulo é opcional)", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);

    await paste(user, CLEAN);
    await user.click(screen.getByRole("button", { name: "Salvar ícone" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "" }));
  });

  // Regra de validação: acusar a cada tecla faria o campo reclamar durante a digitação de um markup
  // que ainda está incompleto. O aviso nasce no blur.
  it("markup inválido não acusa enquanto se digita, acusa no blur e some ao voltar a digitar", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await paste(user, "<b>não é svg</b>");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.tab();
    expect(await screen.findByRole("alert")).toHaveTextContent(/não parece um SVG/);
    expect(screen.getByLabelText(/Markup do SVG/)).toHaveAttribute("aria-invalid", "true");

    await paste(user, "x");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("tentar salvar markup inválido mostra a mensagem em vez de chamar onSave", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);

    await paste(user, "<svg><script>alert(1)</script></svg>");
    await user.click(screen.getByRole("button", { name: "Salvar ícone" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/removido por segurança/);
  });

  it("Cancelar não salva nada", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<Harness onSave={onSave} onCancel={onCancel} />);

    await paste(user, CLEAN);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
