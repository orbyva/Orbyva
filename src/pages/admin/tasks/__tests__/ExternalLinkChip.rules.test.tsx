import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ExternalLinkChip } from "@/pages/admin/tasks/TaskViews";
import { TaskExternalLinksField } from "@/pages/admin/tasks/TaskExternalLinksField";
import { fetchLinkIconRules } from "@/api/tasks/linkIconRules";
import { invalidateLinkIconRules } from "@/hooks/useLinkIconRules";
import type { LinkIconRule, TaskExternalLink } from "@/types/tasks";

/**
 * Feature 087 — o outro lado da tela de regras: o chip do card.
 *
 * É aqui que o pedido-mãe se cumpre ou não ("links do github vão aparecer com o ícone do github, e
 * com o texto que deriva do link"). O que precisa ficar provado é o mecanismo inteiro ponta a
 * ponta: a regra do usuário decide ícone e texto, duas regras que casam a mesma URL são resolvidas
 * por `position`, e nada disso pode derrubar a lista de tarefas quando o dado está ruim.
 */

// O hook importa do módulo, não do índice de `@/api/tasks` — mockar o índice deixaria a busca
// real rodando e todo teste passaria pelo fallback sem regra nenhuma, provando nada.
vi.mock("@/api/tasks/linkIconRules", () => ({
  fetchLinkIconRules: vi.fn(),
}));

function link(over: Partial<TaskExternalLink> = {}): TaskExternalLink {
  return {
    id: "link-1",
    task_id: "task-1",
    url: "https://github.com/pedroynk/Orbyva/issues/123",
    comment: null,
    position: 0,
    ...over,
  };
}

function rule(over: Partial<LinkIconRule> = {}): LinkIconRule {
  return {
    id: "rule-1",
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

beforeEach(() => {
  vi.clearAllMocks();
  invalidateLinkIconRules();
  vi.mocked(fetchLinkIconRules).mockResolvedValue([]);
});

describe("ExternalLinkChip com regras do usuário", () => {
  it("com a regra do GitHub, a issue sai com o texto derivado do link", async () => {
    vi.mocked(fetchLinkIconRules).mockResolvedValue([rule()]);

    render(<ExternalLinkChip links={[link()]} />);

    expect(await screen.findByText("pedroynk/Orbyva#123")).toBeInTheDocument();
    // Ícone do preset da regra, decorativo: o texto ao lado já diz para onde o chip leva.
    const chip = screen.getByRole("link");
    expect(chip).toHaveAttribute("href", "https://github.com/pedroynk/Orbyva/issues/123");
    expect(chip.querySelector("svg")).toBeTruthy();
  });

  it("o ícone da regra pode vir da biblioteca do usuário, como <img>", async () => {
    vi.mocked(fetchLinkIconRules).mockResolvedValue([
      rule({ icon_key: null, icon_url: "https://cdn.test/gh.svg" }),
    ]);

    const { container } = render(<ExternalLinkChip links={[link()]} />);

    // Espera pelo <img>, e não pelo rótulo: o rótulo desta regra é igual ao do fallback, então
    // esperar por ele passaria mesmo se a regra nunca tivesse sido aplicada. (`alt=""` tira o
    // elemento da árvore de acessibilidade de propósito — o ícone é decorativo —, então a busca é
    // pelo nó, não por role.)
    // Nunca inline: o consumo de ícone do usuário é sempre por <img> (decisão da 086).
    await waitFor(() =>
      expect(container.querySelector("img")).toHaveAttribute("src", "https://cdn.test/gh.svg")
    );
    expect(screen.getByText("pedroynk/Orbyva#123")).toBeInTheDocument();
  });

  it("sem regra nenhuma, o chip é o de antes desta feature", async () => {
    render(
      <ExternalLinkChip
        links={[link({ url: "https://docs.google.com/document/d/abc" })]}
      />
    );

    // Fallback de `describeExternalLink`: host sem `www.`.
    expect(await screen.findByText("docs.google.com")).toBeInTheDocument();
  });

  it("com duas regras que casam, vence a de `position` menor", async () => {
    vi.mocked(fetchLinkIconRules).mockResolvedValue([
      rule({ id: "especifica", label_template: "issue $3 de $1/$2", position: 0 }),
      rule({
        id: "generica",
        name: "GitHub",
        pattern: "github\\.com",
        label_template: "GitHub",
        position: 1,
      }),
    ]);

    render(<ExternalLinkChip links={[link()]} />);

    // Rótulo diferente do fallback de propósito: é o que prova que a regra foi aplicada, e não
    // que o chip caiu no comportamento de antes da feature.
    expect(await screen.findByText("issue 123 de pedroynk/Orbyva")).toBeInTheDocument();
    expect(screen.queryByText("GitHub")).not.toBeInTheDocument();
  });

  it("invertendo a ordem, a genérica passa a vencer", async () => {
    vi.mocked(fetchLinkIconRules).mockResolvedValue([
      rule({ id: "especifica", position: 1 }),
      rule({
        id: "generica",
        name: "GitHub",
        pattern: "github\\.com",
        label_template: "GitHub",
        position: 0,
      }),
    ]);

    render(<ExternalLinkChip links={[link()]} />);

    expect(await screen.findByText("GitHub")).toBeInTheDocument();
  });

  it("regra desabilitada no banco não decora nada", async () => {
    vi.mocked(fetchLinkIconRules).mockResolvedValue([rule({ enabled: false })]);

    render(<ExternalLinkChip links={[link()]} />);

    // Cai no fallback da 085, que ainda reconhece issue do GitHub por código.
    expect(await screen.findByText("pedroynk/Orbyva#123")).toBeInTheDocument();

    // E, com um rótulo que o fallback nunca produziria, fica claro que a regra foi pulada e não
    // apenas coincidiu com ele.
    vi.mocked(fetchLinkIconRules).mockResolvedValue([
      rule({ pattern: "docs\\.google\\.com", label_template: "Doc", enabled: false }),
    ]);
    invalidateLinkIconRules();
    render(<ExternalLinkChip links={[link({ url: "https://docs.google.com/d/1" })]} />);
    expect(await screen.findByText("docs.google.com")).toBeInTheDocument();
    expect(screen.queryByText("Doc")).not.toBeInTheDocument();
  });

  it("regra com regex inválida no banco não quebra a renderização da lista", async () => {
    vi.mocked(fetchLinkIconRules).mockResolvedValue([
      rule({ id: "quebrada", pattern: "([unclosed", position: 0 }),
      rule({ id: "boa", label_template: "issue $3", position: 1 }),
    ]);

    expect(() => render(<ExternalLinkChip links={[link()]} />)).not.toThrow();
    // A regra ruim é pulada e a seguinte assume — com um rótulo que só ela produz.
    expect(await screen.findByText("issue 123")).toBeInTheDocument();
  });

  it("falha ao carregar as regras degrada para o fallback, sem derrubar o chip", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(fetchLinkIconRules).mockRejectedValue(new Error("500"));

    render(<ExternalLinkChip links={[link({ url: "https://exemplo.com/x" })]} />);

    expect(await screen.findByText("exemplo.com")).toBeInTheDocument();
    await waitFor(() => expect(logged).toHaveBeenCalled());
    logged.mockRestore();
  });

  it("acima de 3 links, o excedente vira '+N' com os rótulos das regras no title", async () => {
    vi.mocked(fetchLinkIconRules).mockResolvedValue([
      rule({ pattern: "github\\.com", label_template: "GH" }),
    ]);

    render(
      <ExternalLinkChip
        links={[
          link({ id: "1", url: "https://github.com/a/b/issues/1" }),
          link({ id: "2", url: "https://github.com/a/b/issues/2" }),
          link({ id: "3", url: "https://github.com/a/b/issues/3" }),
          link({ id: "4", url: "https://github.com/a/b/issues/4" }),
        ]}
      />
    );

    await waitFor(() => expect(screen.getAllByText("GH")).toHaveLength(3));
    expect(screen.getByText("+1")).toHaveAttribute("title", "GH");
  });
});

describe("prévia do formulário (085) com as regras da 087", () => {
  it("mostra o mesmo rótulo que o card vai mostrar", async () => {
    vi.mocked(fetchLinkIconRules).mockResolvedValue([
      rule({ pattern: "^https?://github\\.com/([^/]+)", label_template: "repo de $1" }),
    ]);

    render(
      <TaskExternalLinksField
        value={[
          { url: "https://github.com/pedroynk/Orbyva/issues/123", comment: null, position: 0 },
        ]}
        onChange={() => {}}
      />
    );

    // A prévia se anuncia como "Assim aparece no card" — sem as regras ela diria
    // "pedroynk/Orbyva#123" (o fallback), que não é o que o card mostraria.
    await waitFor(() =>
      expect(screen.getByTestId("link-preview-0")).toHaveTextContent("repo de pedroynk")
    );
  });

  it("sem regra que case, continua no fallback de host", async () => {
    render(
      <TaskExternalLinksField
        value={[{ url: "https://docs.google.com/document/d/abc", comment: null, position: 0 }]}
        onChange={() => {}}
      />
    );

    expect(screen.getByTestId("link-preview-0")).toHaveTextContent("docs.google.com");
  });
});
