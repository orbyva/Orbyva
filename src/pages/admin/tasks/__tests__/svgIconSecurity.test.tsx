import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskIconPicker } from "@/pages/admin/tasks/TaskIconPicker";
import { TaskIconBadge } from "@/pages/admin/tasks/TaskIconBadge";
import { fetchIconAssets, uploadIconAsset } from "@/api/tasks/iconAssets";

vi.mock("@/api/tasks", () => ({
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
}));

// Feature 131: quem sobe o ícone é `@/components/assets/AssetUploadControls`, que importa
// `@/api/tasks/iconAssets` direto — é este mock que intercepta o upload agora.
vi.mock("@/api/tasks/iconAssets", () => ({
  uploadIconAsset: vi.fn(),
  fetchIconAssets: vi.fn().mockResolvedValue([]),
  deleteIconAsset: vi.fn().mockResolvedValue(undefined),
  renameIconAsset: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

/**
 * Teste de segurança da feature 086, separado de propósito: SVG colado é **conteúdo ativo** vindo de
 * um site qualquer, e este arquivo é o que impede uma refatoração futura de reabrir o buraco sem
 * ninguém perceber.
 *
 * As duas barreiras que ele afirma:
 *
 * 1. **O que sai da tela rumo ao upload já está limpo.** O bucket `task-icons` é público, e a URL de
 *    um arquivo lá pode ser aberta como **navegação de topo** — contexto em que o modo restrito do
 *    `<img>` não vale e o único que protege é o arquivo já não ter conteúdo ativo dentro.
 * 2. **O consumo é sempre `<img>`, nunca inline.** Um SVG carregado por `<img>` não roda script nem
 *    enxerga o documento; `dangerouslySetInnerHTML` com esse markup seria executá-lo dentro do app,
 *    com a sessão do usuário — exatamente o que a 055 desligou no app inteiro.
 */

const PAYLOADS: { name: string; markup: string }[] = [
  {
    name: "<script> dentro do SVG",
    markup:
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="4"/></svg>',
  },
  {
    name: "onload na raiz",
    markup: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="4"/></svg>',
  },
  {
    name: "onclick num filho",
    markup:
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4" onclick="alert(1)"/></svg>',
  },
  {
    name: "<foreignObject> com <img onerror>",
    markup:
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><img src="x" onerror="alert(1)"/></foreignObject><circle r="4"/></svg>',
  },
  {
    name: "href javascript:",
    markup:
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><circle r="4"/></a></svg>',
  },
  {
    name: "javascript: disfarçado por entidade HTML",
    markup:
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="java&#9;script:alert(1)"><circle r="4"/></a></svg>',
  },
  {
    name: "xlink:href javascript: num <use>",
    markup:
      '<svg xmlns="http://www.w3.org/2000/svg"><use xlink:href="javascript:alert(1)"/><circle r="4"/></svg>',
  },
  {
    name: "<iframe> embutido",
    markup:
      '<svg xmlns="http://www.w3.org/2000/svg"><iframe src="https://evil.example"></iframe><circle r="4"/></svg>',
  },
];

/** Nada disto pode sobreviver ao caminho até o upload, em nenhuma variação de caixa. */
function expectHarmless(text: string) {
  const lower = text.toLowerCase();
  expect(lower).not.toContain("<script");
  expect(lower).not.toContain("<iframe");
  expect(lower).not.toContain("foreignobject");
  expect(lower).not.toContain("onload");
  expect(lower).not.toContain("onerror");
  expect(lower).not.toContain("onclick");
  expect(lower).not.toContain("alert(1)");
  // O disfarce por espaço/tab/entidade é desfeito antes de comparar — é assim que a limpeza
  // decide, e é assim que o teste tem de conferir.
  const compact = Array.from(lower)
    .filter((char) => char.charCodeAt(0) > 0x20)
    .join("");
  expect(compact).not.toContain("javascript:");
}

async function pasteAndSave(markup: string) {
  const user = userEvent.setup();
  render(<TaskIconPicker value={{ icon_key: null, icon_url: null }} onChange={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Definir ícone" }));
  await user.click(await screen.findByRole("button", { name: "Colar SVG" }));
  await user.click(screen.getByLabelText(/Markup do SVG/));
  await user.paste(markup);
  const preview = screen.queryByAltText("Prévia do ícone");
  await user.click(screen.getByRole("button", { name: "Salvar ícone" }));
  return { preview };
}

describe("segurança do SVG colado (feature 086)", () => {
  beforeEach(() => {
    vi.mocked(uploadIconAsset).mockReset();
    vi.mocked(uploadIconAsset).mockResolvedValue({
      id: "icon-1",
      name: "Ícone",
      url: "https://cdn.example.com/library/x.svg",
    });
    vi.mocked(fetchIconAssets).mockReset();
    vi.mocked(fetchIconAssets).mockResolvedValue([]);
  });

  it.each(PAYLOADS)("o que chega ao upload não carrega $name", async ({ markup }) => {
    await pasteAndSave(markup);

    await vi.waitFor(() => expect(uploadIconAsset).toHaveBeenCalledTimes(1));
    const source = vi.mocked(uploadIconAsset).mock.calls[0][0];
    expect("svg" in source).toBe(true);
    expectHarmless("svg" in source ? source.svg : "");
  });

  it.each(PAYLOADS)("a prévia mostrada também já está limpa: $name", async ({ markup }) => {
    const { preview } = await pasteAndSave(markup);

    // A prévia é sempre um `<img>` com data URI — nunca markup solto na página.
    expect(preview?.tagName).toBe("IMG");
    const src = preview?.getAttribute("src") ?? "";
    expect(src.startsWith("data:image/svg+xml,")).toBe(true);
    expectHarmless(decodeURIComponent(src));
  });

  it("nenhum nó perigoso do payload chega ao documento da página", async () => {
    for (const { markup } of PAYLOADS) {
      vi.mocked(uploadIconAsset).mockClear();
      await pasteAndSave(markup);
      // Só o `document`, que é global, precisa sobreviver ao laço — cada payload é montado sozinho.
      cleanup();
    }

    // O markup passou pelo `DOMParser` num documento **inerte**; nada dele foi inserido aqui.
    expect(document.querySelectorAll("script")).toHaveLength(0);
    expect(document.querySelectorAll("iframe")).toHaveLength(0);
    expect(document.querySelectorAll("foreignObject")).toHaveLength(0);
    expect(document.querySelectorAll("[onerror]")).toHaveLength(0);
    expect(document.querySelectorAll("[onload]")).toHaveLength(0);
  });

  // Afirmação estática, e é o ponto: o risco não é o código de hoje renderizar inline — é alguém
  // "melhorar" a prévia amanhã trocando o `<img>` por markup embutido.
  it("nenhum arquivo do caminho do ícone usa dangerouslySetInnerHTML", () => {
    const files = [
      "src/components/assets/SvgIconPasteField.tsx",
      "src/pages/admin/tasks/TaskIconPicker.tsx",
      "src/pages/admin/tasks/TaskIconBadge.tsx",
      "src/api/tasks/iconAssets.ts",
      "src/domain/tasks/svgIcon.ts",
    ];
    for (const file of files) {
      // A forma **de uso** (`dangerouslySetInnerHTML={…}`), não a palavra: os comentários destes
      // arquivos citam o nome justamente para explicar por que ele não aparece no código.
      expect(readFileSync(file, "utf8")).not.toContain("dangerouslySetInnerHTML={");
    }
  });

  it("o ícone salvo é exibido por <img>, nunca inline", () => {
    const { container } = render(
      <TaskIconBadge iconKey={null} iconUrl="https://cdn.example.com/library/x.svg" />
    );

    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://cdn.example.com/library/x.svg");
    expect(container.querySelector("svg")).toBeNull();
  });
});
