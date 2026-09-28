import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, matchRoutes } from "react-router-dom";
import { appRoutes } from "@/routes";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import LinkIconRules, {
  LINK_RULE_ICON_REQUIRED,
  LINK_RULE_LOAD_ERROR,
  LINK_RULE_NAME_REQUIRED,
  LINK_RULE_PREVIEW_EMPTY,
  LINK_RULE_PREVIEW_MATCH,
  LINK_RULE_PREVIEW_NO_MATCH,
} from "@/pages/admin/tasks/LinkIconRules";
import Tags from "@/pages/admin/tasks/Tags";
import {
  createLinkIconRule,
  deleteLinkIconRule,
  fetchLinkIconRules,
  fetchProjects,
  fetchTags,
  fetchTasks,
  reorderLinkIconRules,
  updateLinkIconRule,
} from "@/api/tasks";
import {
  DEFAULT_LINK_ICON_RULES,
  resolveLinkAppearance,
  validateLinkIconPattern,
} from "@/domain/tasks";
import type { LinkIconRule } from "@/types/tasks";

/**
 * Feature 087 — a tela `/tasks/link-icons`, sem navegador.
 *
 * O que precisa ficar provado aqui não é "renderiza": é o **mecanismo**. A ordem da lista é a ordem
 * de avaliação (a primeira regra que casa vence), as setas são o único lugar em que essa
 * precedência muda, e a regex vem do usuário — então nada que não compile pode chegar à API.
 */

vi.mock("@/api/tasks", () => ({
  fetchLinkIconRules: vi.fn(),
  createLinkIconRule: vi.fn(),
  updateLinkIconRule: vi.fn(),
  deleteLinkIconRule: vi.fn(),
  reorderLinkIconRules: vi.fn(),
  // `/tasks/tags` é a outra tela de configuração do módulo e é de lá que sai o link para esta.
  fetchTags: vi.fn(),
  fetchTasks: vi.fn(),
  fetchProjects: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
}));

// Feature 131: a biblioteca de assets importa `@/api/tasks/iconAssets` direto (nunca o barril, que
// arrastaria a API de tarefas inteira para o chunk de quem a monta) — é este mock que a intercepta.
vi.mock("@/api/tasks/iconAssets", () => ({
  uploadIconAsset: vi.fn(),
  fetchIconAssets: vi.fn().mockResolvedValue([]),
  deleteIconAsset: vi.fn().mockResolvedValue(undefined),
  renameIconAsset: vi.fn().mockResolvedValue(undefined),
}));


vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { email: "eu@example.com", user_metadata: { full_name: "Eu" } },
    loading: false,
  }),
}));

const toastMock = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

function rule(over: Partial<LinkIconRule> = {}): LinkIconRule {
  return {
    id: "rule-1",
    user_id: "user-1",
    name: "GitHub issue",
    pattern: "^https?://github\\.com/([^/]+)/([^/]+)/issues/(\\d+)",
    label_template: "$1/$2#$3",
    icon_key: "github",
    icon_url: null,
    position: 0,
    enabled: true,
    ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <LinkIconRules />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  vi.mocked(fetchLinkIconRules).mockResolvedValue([]);
  vi.mocked(updateLinkIconRule).mockResolvedValue(undefined);
  vi.mocked(deleteLinkIconRule).mockResolvedValue(undefined);
  vi.mocked(reorderLinkIconRules).mockResolvedValue(undefined);
});

describe("LinkIconRules — a lista é a ordem de avaliação", () => {
  it("mostra as regras na ordem de `position`, com pattern e rótulo de cada uma", async () => {
    vi.mocked(fetchLinkIconRules).mockResolvedValue([
      rule({ id: "a", name: "GitHub issue", position: 0 }),
      rule({
        id: "b",
        name: "GitHub",
        pattern: "github\\.com",
        label_template: null,
        position: 1,
      }),
    ]);

    renderPage();

    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    // A específica antes da genérica: é o que faz "GitHub issue" vencer.
    expect(within(items[0]).getByText("GitHub issue")).toBeInTheDocument();
    expect(within(items[1]).getByText("GitHub")).toBeInTheDocument();
    expect(within(items[0]).getByText(/\$1\/\$2#\$3/)).toBeInTheDocument();
    // Sem template, o chip cai no host — a linha diz isso em vez de ficar vazia.
    expect(within(items[1]).getByText(/host do link/)).toBeInTheDocument();
    expect(within(items[1]).getByText("github\\.com")).toBeInTheDocument();
  });

  it("as setas reordenam e gravam as posições em sequência", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchLinkIconRules)
      .mockResolvedValueOnce([
        rule({ id: "a", name: "GitHub issue", position: 0 }),
        rule({ id: "b", name: "GitHub", position: 1 }),
      ])
      // A recarga depois de gravar traz a ordem nova, que é o que a lista de tarefas vai avaliar.
      .mockResolvedValue([
        rule({ id: "b", name: "GitHub", position: 0 }),
        rule({ id: "a", name: "GitHub issue", position: 1 }),
      ]);

    renderPage();
    await screen.findByText("GitHub issue");

    await user.click(screen.getByLabelText("Mover GitHub para cima"));

    await waitFor(() => expect(reorderLinkIconRules).toHaveBeenCalledWith(["b", "a"]));
    await waitFor(() => {
      const items = screen.getAllByRole("listitem");
      expect(within(items[0]).getByText("GitHub")).toBeInTheDocument();
      expect(within(items[1]).getByText("GitHub issue")).toBeInTheDocument();
    });
  });

  it("a seta de subir da primeira e a de descer da última ficam desabilitadas", async () => {
    vi.mocked(fetchLinkIconRules).mockResolvedValue([
      rule({ id: "a", name: "Um", position: 0 }),
      rule({ id: "b", name: "Dois", position: 1 }),
    ]);

    renderPage();
    await screen.findByText("Um");

    expect(screen.getByLabelText("Mover Um para cima")).toBeDisabled();
    expect(screen.getByLabelText("Mover Dois para baixo")).toBeDisabled();
    expect(screen.getByLabelText("Mover Um para baixo")).toBeEnabled();
  });

  it("o interruptor desliga a regra sem apagá-la", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchLinkIconRules).mockResolvedValue([rule({ id: "a", name: "GitHub" })]);

    renderPage();
    await screen.findByText("GitHub");

    const toggle = screen.getByRole("switch", { name: "Desativar GitHub" });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    await user.click(toggle);

    await waitFor(() =>
      expect(updateLinkIconRule).toHaveBeenCalledWith("a", { enabled: false })
    );
    expect(deleteLinkIconRule).not.toHaveBeenCalled();
  });

  it("regra desativada continua na lista, marcada como tal", async () => {
    vi.mocked(fetchLinkIconRules).mockResolvedValue([
      rule({ id: "a", name: "Figma", enabled: false }),
    ]);

    renderPage();

    expect(await screen.findByText("Figma")).toBeInTheDocument();
    expect(screen.getByText("desativada")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Ativar Figma" })).toHaveAttribute(
      "aria-checked",
      "false"
    );
  });
});

describe("rota /tasks/link-icons", () => {
  it("resolve para uma rota registrada dentro do grupo `tasks`, não para o 404", () => {
    const matches = matchRoutes(appRoutes, "/tasks/link-icons");
    expect(matches).not.toBeNull();
    const paths = matches!.map((m) => m.route.path);
    expect(paths).toContain("tasks");
    expect(paths).toContain("link-icons");
    expect(paths).not.toContain("*");
  });

  it("o elemento casado monta a tela de regras", async () => {
    const matches = matchRoutes(appRoutes, "/tasks/link-icons")!;
    const element = matches[matches.length - 1].route.element;

    render(
      <MemoryRouter initialEntries={["/tasks/link-icons"]}>
        <Suspense fallback={<p>carregando</p>}>
          <Routes>
            <Route path="/tasks/link-icons" element={element} />
          </Routes>
        </Suspense>
      </MemoryRouter>
    );

    expect(
      await screen.findByRole("heading", { name: "Ícones de link", level: 1 })
    ).toBeInTheDocument();
  });

  it("não entra na sidebar — é configuração, como /tasks/tags", () => {
    render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </MemoryRouter>
    );

    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/tasks/link-icons");
    // Vizinhança: a outra tela de configuração do módulo também não está lá, e o módulo está.
    expect(hrefs).not.toContain("/tasks/tags");
    expect(hrefs).toContain("/tasks");
  });
});

describe("LinkIconRules — criar e editar", () => {
  it("criar uma regra manda o pattern e o template digitados, no fim da fila", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchLinkIconRules).mockResolvedValue([rule({ id: "a", position: 0 })]);
    vi.mocked(createLinkIconRule).mockResolvedValue(rule({ id: "b" }));

    renderPage();
    await screen.findByText("GitHub issue");

    await user.click(screen.getByRole("button", { name: "Nova regra" }));
    await user.type(screen.getByLabelText(/^Nome/), "Figma");
    // `paste` e não `type`: `[` e `{` são sintaxe de teclado do user-event, e uma regex é feita
    // deles — além de colar ser como a regex chega ali na vida real.
    await user.click(screen.getByLabelText(/^Expressão regular/));
    await user.paste("figma\\.com/file/([^/?]+)");
    await user.click(screen.getByLabelText(/^Texto do rótulo/));
    await user.paste("Figma: $1");
    await user.click(screen.getByRole("button", { name: "Escolher ícone da regra" }));
    await user.click(await screen.findByRole("button", { name: "Figma" }));
    await user.click(screen.getByRole("button", { name: "Criar regra" }));

    await waitFor(() =>
      expect(createLinkIconRule).toHaveBeenCalledWith({
        name: "Figma",
        pattern: "figma\\.com/file/([^/?]+)",
        label_template: "Figma: $1",
        icon_key: "figma",
        icon_url: null,
        // Atrás da regra que já existia: quem decide precedência são as setas, não o salvar.
        position: 1,
        enabled: true,
      })
    );
  });

  it("editar carrega os valores da regra e salva por id, preservando position e enabled", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchLinkIconRules).mockResolvedValue([
      rule({ id: "a", name: "GitHub issue", position: 3, enabled: false }),
    ]);

    renderPage();
    await screen.findByText("GitHub issue");

    await user.click(screen.getByLabelText("Editar GitHub issue"));
    expect(screen.getByLabelText(/^Nome/)).toHaveValue("GitHub issue");
    expect(screen.getByLabelText(/^Expressão regular/)).toHaveValue(rule().pattern);
    expect(screen.getByLabelText(/^Texto do rótulo/)).toHaveValue("$1/$2#$3");

    await user.clear(screen.getByLabelText(/^Texto do rótulo/));
    await user.type(screen.getByLabelText(/^Texto do rótulo/), "#$3");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() =>
      expect(updateLinkIconRule).toHaveBeenCalledWith(
        "a",
        expect.objectContaining({ label_template: "#$3", position: 3, enabled: false })
      )
    );
    expect(createLinkIconRule).not.toHaveBeenCalled();
  });
});

describe("LinkIconRules — a regex é entrada perigosa e o salvar é a fronteira", () => {
  async function openNewRule() {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("button", { name: "Nova regra" });
    await user.click(screen.getByRole("button", { name: "Nova regra" }));
    return user;
  }

  it("regex que não compila não chama a API e mostra a mensagem do RegExp no campo", async () => {
    const user = await openNewRule();

    await user.type(screen.getByLabelText(/^Nome/), "Quebrada");
    await user.click(screen.getByLabelText(/^Expressão regular/));
    await user.paste("([unclosed");
    await user.click(screen.getByRole("button", { name: "Escolher ícone da regra" }));
    await user.click(await screen.findByRole("button", { name: "GitHub" }));
    await user.click(screen.getByRole("button", { name: "Criar regra" }));

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toMatch(/regular expression/i);
    expect(createLinkIconRule).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Expressão regular/)).toHaveAttribute("aria-invalid", "true");
  });

  it("o aviso da regex aparece já no blur, sem esperar o salvar", async () => {
    const user = await openNewRule();

    await user.click(screen.getByLabelText(/^Expressão regular/));
    await user.paste("(");
    await user.tab();

    expect((await screen.findByRole("alert")).textContent).toMatch(/regular expression/i);
  });

  it("pattern acima de 200 caracteres é recusada antes de sair da tela", async () => {
    const user = await openNewRule();

    await user.type(screen.getByLabelText(/^Nome/), "Gigante");
    await user.click(screen.getByLabelText(/^Expressão regular/));
    await user.paste("a".repeat(201));
    await user.click(screen.getByRole("button", { name: "Criar regra" }));

    expect(await screen.findByText(/no máximo 200 caracteres/)).toBeInTheDocument();
    expect(createLinkIconRule).not.toHaveBeenCalled();
  });

  it("nome e ícone são obrigatórios — regra sem ícone não mudaria nada visível", async () => {
    const user = await openNewRule();

    await user.click(screen.getByLabelText(/^Expressão regular/));
    await user.paste("github\\.com");
    await user.click(screen.getByRole("button", { name: "Criar regra" }));

    const avisos = (await screen.findAllByRole("alert")).map((el) => el.textContent);
    expect(avisos).toContain(LINK_RULE_NAME_REQUIRED);
    expect(avisos).toContain(LINK_RULE_ICON_REQUIRED);
    expect(createLinkIconRule).not.toHaveBeenCalled();
  });
});

describe("LinkIconRules — prévia da URL de teste", () => {
  async function openNewRule() {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("button", { name: "Nova regra" });
    await user.click(screen.getByRole("button", { name: "Nova regra" }));
    return user;
  }

  it("sem URL, não inventa um chip fantasma", async () => {
    await openNewRule();
    expect(screen.getByTestId("rule-preview")).toHaveTextContent(LINK_RULE_PREVIEW_EMPTY);
  });

  it("mostra o rótulo que a regra sendo editada produz — sem salvar nada", async () => {
    const user = await openNewRule();

    await user.click(screen.getByLabelText(/^Expressão regular/));
    await user.paste("^https?://github\\.com/([^/]+)/([^/]+)/issues/(\\d+)");
    await user.click(screen.getByLabelText(/^Texto do rótulo/));
    await user.paste("$1/$2#$3");
    await user.click(screen.getByLabelText(/^URL de teste/));
    await user.paste("https://github.com/pedroynk/Orbyva/issues/123");

    const preview = screen.getByTestId("rule-preview");
    expect(preview).toHaveTextContent(LINK_RULE_PREVIEW_MATCH);
    expect(preview).toHaveTextContent("pedroynk/Orbyva#123");
    expect(createLinkIconRule).not.toHaveBeenCalled();
  });

  it("URL que não casa diz isso e mostra o que apareceria sem a regra", async () => {
    const user = await openNewRule();

    await user.click(screen.getByLabelText(/^Expressão regular/));
    await user.paste("github\\.com");
    await user.click(screen.getByLabelText(/^URL de teste/));
    await user.paste("https://www.figma.com/file/abc");

    const preview = screen.getByTestId("rule-preview");
    expect(preview).toHaveTextContent(LINK_RULE_PREVIEW_NO_MATCH);
    // O fallback de host, o mesmo que o chip da lista mostraria.
    expect(preview).toHaveTextContent("figma.com");
  });

  it("template vazio prevê o host, e não um chip sem texto", async () => {
    const user = await openNewRule();

    await user.click(screen.getByLabelText(/^Expressão regular/));
    await user.paste("github\\.com");
    await user.click(screen.getByLabelText(/^URL de teste/));
    await user.paste("https://github.com/pedroynk/Orbyva/issues/123");

    const preview = screen.getByTestId("rule-preview");
    expect(preview).toHaveTextContent(LINK_RULE_PREVIEW_MATCH);
    expect(preview).toHaveTextContent("github.com");
  });

  it("regex inválida enquanto é digitada não derruba o diálogo", async () => {
    const user = await openNewRule();

    await user.click(screen.getByLabelText(/^URL de teste/));
    await user.paste("https://www.figma.com/file/abc");
    await user.click(screen.getByLabelText(/^Expressão regular/));
    await user.paste("^https?://figma\\.com/([");

    // Regra que não compila é pulada: a prévia cai no fallback em vez de estourar.
    expect(screen.getByTestId("rule-preview")).toHaveTextContent(LINK_RULE_PREVIEW_NO_MATCH);
    expect(screen.getByTestId("rule-preview")).toHaveTextContent("figma.com");
  });
});

describe("LinkIconRules — estado vazio e regras padrão", () => {
  it("lista vazia explica a consequência e oferece as regras prontas", async () => {
    renderPage();
    expect(await screen.findByText("Nenhuma regra ainda")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar regras padrão" })).toBeInTheDocument();
  });

  it("o botão insere as sementes como regras normais, na ordem da constante", async () => {
    const user = userEvent.setup();
    vi.mocked(createLinkIconRule).mockImplementation(async (draft) =>
      rule({ id: draft.name, ...draft })
    );

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Criar regras padrão" }));

    await waitFor(() =>
      expect(createLinkIconRule).toHaveBeenCalledTimes(DEFAULT_LINK_ICON_RULES.length)
    );
    const enviadas = vi.mocked(createLinkIconRule).mock.calls.map(([draft]) => draft);
    expect(enviadas.map((d) => d.name)).toEqual(DEFAULT_LINK_ICON_RULES.map((s) => s.name));
    expect(enviadas.map((d) => d.position)).toEqual(
      DEFAULT_LINK_ICON_RULES.map((_, index) => index)
    );
    // Regras normais: nascem ligadas e sem ícone da biblioteca (a semente não pode depender de o
    // usuário já ter enviado ícone nenhum).
    expect(enviadas.every((d) => d.enabled && d.icon_url === null && d.icon_key)).toBe(true);
  });

  it("as sementes casam o que prometem, e a específica do GitHub vence a genérica", () => {
    const rules = DEFAULT_LINK_ICON_RULES.map((seed, position) => ({
      ...seed,
      icon_url: null,
      position,
      enabled: true,
    }));

    expect(resolveLinkAppearance("https://github.com/pedroynk/Orbyva/issues/123", rules)).toEqual({
      iconKey: "github",
      iconUrl: null,
      label: "pedroynk/Orbyva#123",
    });
    expect(resolveLinkAppearance("https://github.com/pedroynk/Orbyva", rules).label).toBe(
      "pedroynk/Orbyva"
    );
    expect(
      resolveLinkAppearance("https://empresa.atlassian.net/browse/ABC-42", rules).label
    ).toBe("ABC-42");
    expect(resolveLinkAppearance("https://youtu.be/dQw4w9WgXcQ", rules)).toMatchObject({
      iconKey: "youtube",
      label: "YouTube",
    });
    expect(
      resolveLinkAppearance("https://docs.google.com/document/d/abc/edit", rules).iconKey
    ).toBe("file-text");
    // Nada casa: o comportamento de antes desta feature, intacto.
    expect(resolveLinkAppearance("https://exemplo.com/algo", rules)).toEqual({
      iconKey: "external",
      iconUrl: null,
      label: "exemplo.com",
    });
  });

  it("toda semente compila e cabe no teto de caracteres", () => {
    for (const seed of DEFAULT_LINK_ICON_RULES) {
      expect(validateLinkIconPattern(seed.pattern)).toBeNull();
    }
  });
});

describe("LinkIconRules — carregamento, falha e exclusão", () => {
  it("mostra o esqueleto enquanto as regras não chegam", async () => {
    let resolve!: (rows: LinkIconRule[]) => void;
    vi.mocked(fetchLinkIconRules).mockReturnValue(
      new Promise<LinkIconRule[]>((r) => {
        resolve = r;
      })
    );

    const { container } = renderPage();

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.queryByText("Nenhuma regra ainda")).not.toBeInTheDocument();

    resolve([]);
    expect(await screen.findByText("Nenhuma regra ainda")).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
  });

  it("falha ao carregar avisa por toast e deixa tentar de novo", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchLinkIconRules).mockRejectedValueOnce(new Error("500"));

    renderPage();

    expect(await screen.findByText(LINK_RULE_LOAD_ERROR)).toBeInTheDocument();
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Erro", variant: "destructive" })
      )
    );

    vi.mocked(fetchLinkIconRules).mockResolvedValue([rule({ id: "a", name: "GitHub" })]);
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));

    expect(await screen.findByText("GitHub")).toBeInTheDocument();
    expect(screen.queryByText(LINK_RULE_LOAD_ERROR)).not.toBeInTheDocument();
  });

  it("excluir pede confirmação antes de chamar a API", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchLinkIconRules).mockResolvedValue([rule({ id: "a", name: "GitHub" })]);

    renderPage();
    await screen.findByText("GitHub");

    await user.click(screen.getByLabelText("Excluir GitHub"));
    expect(await screen.findByText("Excluir esta regra?")).toBeInTheDocument();
    expect(deleteLinkIconRule).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(deleteLinkIconRule).toHaveBeenCalledWith("a"));
  });

  it("cancelar a confirmação não exclui nada", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchLinkIconRules).mockResolvedValue([rule({ id: "a", name: "GitHub" })]);

    renderPage();
    await screen.findByText("GitHub");

    await user.click(screen.getByLabelText("Excluir GitHub"));
    await user.click(await screen.findByRole("button", { name: "Cancelar" }));

    expect(deleteLinkIconRule).not.toHaveBeenCalled();
  });
});

describe("entradas para a tela de regras", () => {
  it("o cabeçalho de /tasks/tags aponta para /tasks/link-icons", async () => {
    vi.mocked(fetchTags).mockResolvedValue([]);
    vi.mocked(fetchTasks).mockResolvedValue([]);
    vi.mocked(fetchProjects).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <Tags />
      </MemoryRouter>
    );

    // As duas telas de configuração do módulo estão fora da sidebar: sem este ponteiro, a de
    // regras só seria alcançável de dentro do formulário de tarefa.
    expect(await screen.findByRole("link", { name: "Ícones de link" })).toHaveAttribute(
      "href",
      "/tasks/link-icons"
    );
  });
});
