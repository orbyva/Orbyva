import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ICON_DELETE_WARNING,
  ICON_LIBRARY_EMPTY,
  ICON_LIBRARY_ERROR,
  TaskIconPicker,
} from "@/pages/admin/tasks/TaskIconPicker";
import { TASK_ICON_PRESETS } from "@/pages/admin/tasks/TaskIconBadge";
import { SHOPPING_TASK_ICON_KEY } from "@/domain/shopping/taskLink";
import { MEDICATION_TASK_ICON_KEY } from "@/domain/health/medication";
import { SVG_ICON_REMOVED_WARNING } from "@/pages/admin/tasks/SvgIconPasteField";
import {
  deleteIconAsset,
  fetchIconAssets,
  renameIconAsset,
  uploadIconAsset,
} from "@/api/tasks";
import type { IconAsset } from "@/types/tasks";

vi.mock("@/api/tasks", () => ({
  // Feature 085: os donos do formulário/lista carregam e gravam os links externos.
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  uploadIconAsset: vi.fn(),
  fetchIconAssets: vi.fn().mockResolvedValue([]),
  deleteIconAsset: vi.fn().mockResolvedValue(undefined),
  renameIconAsset: vi.fn().mockResolvedValue(undefined),
}));

/** A linha que `uploadIconAsset` devolve depois de subir o arquivo para a biblioteca. */
function asset(url: string): IconAsset {
  return { id: `icon-${url}`, name: "Ícone", url };
}

/** Uma linha já existente da biblioteca, como `fetchIconAssets` a devolve. */
function libraryAsset(id: string, name: string, url: string): IconAsset {
  return { id, name, url };
}

const toastMock = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

/**
 * Cobre o trigger + popover de seleção de ícone da tarefa (feature 035) — as duas formas de
 * atribuir um ícone pedidas no prompt original ("permita adicionar um ícone, não somente
 * selecionar de uma lista"): grid de presets clicáveis e upload de imagem própria. Substitui o
 * item "Teste manual" que fechava a lista de tarefas por asserções reais de componente (Testing
 * Library + jsdom).
 */
describe("TaskIconPicker", () => {
  beforeEach(() => {
    vi.mocked(uploadIconAsset).mockReset();
    vi.mocked(fetchIconAssets).mockReset();
    vi.mocked(fetchIconAssets).mockResolvedValue([]);
    toastMock.mockReset();
  });

  it("sem ícone selecionado, o trigger mostra '+i' (versão compacta pra caber na linha de metadados)", () => {
    render(
      <TaskIconPicker value={{ icon_key: null, icon_url: null }} onChange={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Definir ícone" })).toHaveTextContent("+i");
  });

  it("com um preset selecionado, o trigger vira 'Trocar ícone' e mostra o ícone do preset", () => {
    const { container } = render(
      <TaskIconPicker value={{ icon_key: "star", icon_url: null }} onChange={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Trocar ícone" })).toBeInTheDocument();
    expect(container.querySelector('svg[aria-label="Estrela"]')).toBeInTheDocument();
  });

  it("abrir o popover mostra os 9 presets como botões clicáveis", async () => {
    const user = userEvent.setup();
    render(
      <TaskIconPicker value={{ icon_key: null, icon_url: null }} onChange={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));

    for (const preset of TASK_ICON_PRESETS) {
      expect(await screen.findByRole("button", { name: preset.label })).toBeInTheDocument();
    }
    expect(TASK_ICON_PRESETS).toHaveLength(9);
  });

  // Feature 071: a dose de medicação nasce com este preset (`MEDICATION_TASK_ICON_KEY`), e é ele
  // que a bolinha pontual da agenda desenha. Precisa existir no grid como qualquer outro — inclusive
  // para o usuário poder trocá-lo à mão, que é o que o `coalesce` do backfill preserva.
  it("o preset 'Medicação' (pill) aparece no grid e pode ser selecionado", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    expect(TASK_ICON_PRESETS.map((preset) => preset.key)).toContain(
      MEDICATION_TASK_ICON_KEY
    );
    render(
      <TaskIconPicker value={{ icon_key: null, icon_url: null }} onChange={onChange} />
    );

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    await user.click(await screen.findByRole("button", { name: "Medicação" }));

    expect(onChange).toHaveBeenCalledWith({ icon_key: "pill", icon_url: null });
  });

  // Feature 051: o preset de compras precisa existir no grid pra tarefa criada a partir de um
  // item da lista nascer com o ícone certo — e continuar trocável como qualquer outra tarefa.
  it("o preset 'Compra' (shopping-cart) aparece no grid e pode ser selecionado", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    expect(TASK_ICON_PRESETS.map((preset) => preset.key)).toContain(
      SHOPPING_TASK_ICON_KEY
    );
    render(
      <TaskIconPicker value={{ icon_key: null, icon_url: null }} onChange={onChange} />
    );

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    await user.click(await screen.findByRole("button", { name: "Compra" }));

    expect(onChange).toHaveBeenCalledWith({ icon_key: "shopping-cart", icon_url: null });
  });

  it("uma tarefa já criada com o ícone de compras pode trocar pra outro preset (ícone é gravado, não travado)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TaskIconPicker
        value={{ icon_key: SHOPPING_TASK_ICON_KEY, icon_url: null }}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("button", { name: "Trocar ícone" }));
    expect(await screen.findByRole("button", { name: "Compra" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await user.click(screen.getByRole("button", { name: "Estrela" }));

    expect(onChange).toHaveBeenCalledWith({ icon_key: "star", icon_url: null });
  });

  it("clicar num preset chama onChange com { icon_key, icon_url: null } e fecha o popover", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TaskIconPicker value={{ icon_key: null, icon_url: null }} onChange={onChange} />
    );

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    await user.click(await screen.findByRole("button", { name: "Bandeira" }));

    expect(onChange).toHaveBeenCalledWith({ icon_key: "flag", icon_url: null });
    expect(screen.queryByRole("button", { name: "Estrela" })).not.toBeInTheDocument();
  });

  it("o preset atualmente selecionado tem aria-pressed=true, os demais false", async () => {
    const user = userEvent.setup();
    render(
      <TaskIconPicker value={{ icon_key: "star", icon_url: null }} onChange={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Trocar ícone" }));

    expect(await screen.findByRole("button", { name: "Estrela" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Bandeira" })).toHaveAttribute("aria-pressed", "false");
  });

  // Feature 086, benefício direto da mudança de caminho: o arquivo ia para `{userId}/{taskId}.ext`,
  // então sem tarefa salva não havia caminho e o botão nascia desabilitado com a dica "Salve a
  // tarefa antes de enviar uma imagem". Com `{userId}/library/{uuid}.ext` isso deixou de existir —
  // o picker nem recebe mais `taskId`, e enviar imagem funciona em tarefa nova.
  it("'Enviar imagem' está habilitado mesmo sem tarefa salva, e a dica antiga sumiu", async () => {
    const user = userEvent.setup();
    render(<TaskIconPicker value={{ icon_key: null, icon_url: null }} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));

    expect(screen.getByRole("button", { name: "Enviar imagem" })).not.toBeDisabled();
    expect(screen.queryByText("Salve a tarefa antes de enviar uma imagem.")).not.toBeInTheDocument();
  });

  it("o upload de arquivo de uma tarefa ainda não salva sobe e entra na biblioteca", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.mocked(uploadIconAsset).mockResolvedValue(
      libraryAsset("icon-novo", "logo-empresa", "https://cdn.example.com/library/logo.png")
    );
    render(<TaskIconPicker value={{ icon_key: null, icon_url: null }} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    const file = new File(["conteudo"], "logo-empresa.png", { type: "image/png" });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);

    expect(uploadIconAsset).toHaveBeenCalledWith({ file });
    await vi.waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        icon_key: null,
        icon_url: "https://cdn.example.com/library/logo.png",
      })
    );

    // "Todo ícone custom passa a ir para a biblioteca — inclusive o upload de arquivo."
    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    expect(await screen.findByRole("button", { name: "logo-empresa" })).toBeInTheDocument();
  });

  it("selecionar um arquivo chama uploadIconAsset e onChange com icon_url, limpando icon_key", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.mocked(uploadIconAsset).mockResolvedValue(asset("https://cdn.example.com/task-1.png"));
    render(
      <TaskIconPicker value={{ icon_key: "star", icon_url: null }} onChange={onChange} />
    );

    await user.click(screen.getByRole("button", { name: "Trocar ícone" }));
    const file = new File(["conteudo"], "icone.png", { type: "image/png" });
    // O popover do Radix renderiza em um portal fora do container local do `render`, precisa
    // buscar no `document` inteiro.
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(uploadIconAsset).toHaveBeenCalledWith({ file });
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        icon_key: null,
        icon_url: "https://cdn.example.com/task-1.png",
      });
    });
  });

  it("upload que falha mostra um toast de erro e não chama onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.mocked(uploadIconAsset).mockRejectedValue(new Error("arquivo muito grande"));
    render(
      <TaskIconPicker value={{ icon_key: null, icon_url: null }} onChange={onChange} />
    );

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    const file = new File(["conteudo"], "icone.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await vi.waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Erro", variant: "destructive" })
      );
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  // Feature 073: o ícone é propriedade da série. O aviso existe pra o usuário não achar que mexeu
  // só naquele dia e levar um susto ao ver o passado mudar.
  it("com sharedWithSeries, o popover avisa que a edição vale para toda a recorrência", async () => {
    const user = userEvent.setup();
    render(
      <TaskIconPicker
        value={{ icon_key: null, icon_url: null }}
        onChange={vi.fn()}
        sharedWithSeries
      />
    );

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));

    expect(
      await screen.findByText("Vale para todas as ocorrências desta recorrência.")
    ).toBeInTheDocument();
  });

  it("sem sharedWithSeries, o aviso de recorrência não aparece", async () => {
    const user = userEvent.setup();
    render(
      <TaskIconPicker value={{ icon_key: null, icon_url: null }} onChange={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));

    expect(await screen.findByRole("button", { name: "Enviar imagem" })).toBeInTheDocument();
    expect(
      screen.queryByText("Vale para todas as ocorrências desta recorrência.")
    ).not.toBeInTheDocument();
  });

  // Antes da 086 o arquivo ia para `{userId}/{taskId}.{ext}` e quem chamava tinha de passar o id da
  // **origem** da série para as irmãs não apontarem para o arquivo de uma ocorrência que pode ser
  // excluída (feature 073). Com o caminho por biblioteca, nenhum id de tarefa entra no upload.
  it("o upload não leva id de tarefa nenhum — o arquivo é da biblioteca, não da tarefa", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.mocked(uploadIconAsset).mockResolvedValue(asset("https://cdn.example.com/origem.png"));
    render(
      <TaskIconPicker
        value={{ icon_key: null, icon_url: null }}
        onChange={onChange}
        sharedWithSeries
      />
    );

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    const file = new File(["conteudo"], "icone.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(uploadIconAsset).toHaveBeenCalledWith({ file });
    expect(vi.mocked(uploadIconAsset).mock.calls[0]).not.toContain("origem");
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        icon_key: null,
        icon_url: "https://cdn.example.com/origem.png",
      });
    });
  });

  it("com ícone definido, o botão 'Remover ícone' chama onChange limpando icon_key e icon_url", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TaskIconPicker value={{ icon_key: "star", icon_url: null }} onChange={onChange} />
    );

    await user.click(screen.getByRole("button", { name: "Trocar ícone" }));
    await user.click(screen.getByRole("button", { name: "Remover ícone" }));

    expect(onChange).toHaveBeenCalledWith({ icon_key: null, icon_url: null });
  });
});

/**
 * Feature 086 — a seção "Meus ícones": a metade "e aí esse ícone já fica salvo também na lista" do
 * pedido-mãe. A lista mora dentro do próprio popover porque é onde o usuário está quando quer
 * escolher um ícone.
 */
describe("TaskIconPicker — biblioteca de ícones (feature 086)", () => {
  beforeEach(() => {
    vi.mocked(uploadIconAsset).mockReset();
    vi.mocked(fetchIconAssets).mockReset();
    vi.mocked(fetchIconAssets).mockResolvedValue([]);
    toastMock.mockReset();
  });

  it("a lista só é buscada quando o popover abre (o picker aparece em toda linha da Lista)", async () => {
    const user = userEvent.setup();
    render(
      <TaskIconPicker value={{ icon_key: null, icon_url: null }} onChange={vi.fn()} />
    );

    expect(fetchIconAssets).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));

    await vi.waitFor(() => expect(fetchIconAssets).toHaveBeenCalledTimes(1));
  });

  it("lista os ícones que vieram da API e selecionar um grava icon_url com icon_key nulo", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.mocked(fetchIconAssets).mockResolvedValue([
      libraryAsset("icon-1", "Foguete", "https://cdn.example.com/foguete.svg"),
      libraryAsset("icon-2", "Livro", "https://cdn.example.com/livro.png"),
    ]);
    render(
      <TaskIconPicker value={{ icon_key: "star", icon_url: null }} onChange={onChange} />
    );

    await user.click(screen.getByRole("button", { name: "Trocar ícone" }));
    await user.click(await screen.findByRole("button", { name: "Foguete" }));

    expect(onChange).toHaveBeenCalledWith({
      icon_key: null,
      icon_url: "https://cdn.example.com/foguete.svg",
    });
  });

  it("o ícone da biblioteca atualmente em uso aparece marcado, como os presets", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchIconAssets).mockResolvedValue([
      libraryAsset("icon-1", "Foguete", "https://cdn.example.com/foguete.svg"),
      libraryAsset("icon-2", "Livro", "https://cdn.example.com/livro.png"),
    ]);
    render(
      <TaskIconPicker
        value={{ icon_key: null, icon_url: "https://cdn.example.com/foguete.svg" }}
        onChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Trocar ícone" }));

    expect(await screen.findByRole("button", { name: "Foguete" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Livro" })).toHaveAttribute("aria-pressed", "false");
    // E nenhum preset fica marcado junto: as duas colunas são mutuamente exclusivas.
    expect(screen.getByRole("button", { name: "Estrela" })).toHaveAttribute("aria-pressed", "false");
  });

  it("o ícone da lista é renderizado por <img>, nunca inline", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchIconAssets).mockResolvedValue([
      libraryAsset("icon-1", "Foguete", "https://cdn.example.com/foguete.svg"),
    ]);
    render(
      <TaskIconPicker value={{ icon_key: null, icon_url: null }} onChange={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    const tile = await screen.findByRole("button", { name: "Foguete" });

    const img = tile.querySelector("img");
    expect(img).toHaveAttribute("src", "https://cdn.example.com/foguete.svg");
    expect(tile.querySelector("svg")).toBeNull();
  });

  it("biblioteca vazia mostra o texto que diz o que fazer", async () => {
    const user = userEvent.setup();
    render(
      <TaskIconPicker value={{ icon_key: null, icon_url: null }} onChange={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));

    expect(await screen.findByText(ICON_LIBRARY_EMPTY)).toBeInTheDocument();
  });

  it("enquanto carrega, mostra esqueleto curto — não spinner de tela cheia", async () => {
    const user = userEvent.setup();
    let resolve: (rows: IconAsset[]) => void = () => {};
    vi.mocked(fetchIconAssets).mockReturnValue(
      new Promise<IconAsset[]>((r) => {
        resolve = r;
      })
    );
    render(
      <TaskIconPicker value={{ icon_key: null, icon_url: null }} onChange={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));

    expect(await screen.findByRole("status", { name: "Carregando seus ícones" })).toBeInTheDocument();
    // Os presets continuam disponíveis durante o carregamento.
    expect(screen.getByRole("button", { name: "Estrela" })).toBeInTheDocument();

    resolve([libraryAsset("icon-1", "Foguete", "https://cdn.example.com/foguete.svg")]);
    expect(await screen.findByRole("button", { name: "Foguete" })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Carregando seus ícones" })).not.toBeInTheDocument();
  });

  it("erro de carregamento vira uma linha de aviso sem derrubar os presets", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.mocked(fetchIconAssets).mockRejectedValue(new Error("offline"));
    render(
      <TaskIconPicker value={{ icon_key: null, icon_url: null }} onChange={onChange} />
    );

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));

    expect(await screen.findByText(ICON_LIBRARY_ERROR)).toBeInTheDocument();
    // O que a feature exige: escolher preset continua funcionando com a lista fora do ar.
    await user.click(screen.getByRole("button", { name: "Estrela" }));
    expect(onChange).toHaveBeenCalledWith({ icon_key: "star", icon_url: null });
  });
});

/**
 * Feature 086, a outra metade do pedido-mãe: "permitir também colar svg na aba de ícone". Dois
 * caminhos, porque `Ctrl+V` dentro de um popover só chega a algum lugar se houver campo focado — o
 * botão "Colar SVG" é o caminho garantido, o `onPaste` é o atalho.
 */
describe("TaskIconPicker — colar SVG (feature 086)", () => {
  const CLEAN = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>';
  const DIRTY =
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="4"/></svg>';

  beforeEach(() => {
    vi.mocked(uploadIconAsset).mockReset();
    vi.mocked(fetchIconAssets).mockReset();
    vi.mocked(fetchIconAssets).mockResolvedValue([]);
    toastMock.mockReset();
  });

  async function openPicker(onChange = vi.fn()) {
    const user = userEvent.setup();
    render(
      <TaskIconPicker value={{ icon_key: null, icon_url: null }} onChange={onChange} />
    );
    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    return { user, onChange };
  }

  it("o botão 'Colar SVG' abre o campo de colar", async () => {
    const { user } = await openPicker();

    expect(screen.queryByLabelText(/Markup do SVG/)).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Colar SVG" }));

    expect(await screen.findByLabelText(/Markup do SVG/)).toBeInTheDocument();
  });

  it("colar SVG no popover (sem campo focado) abre o campo já preenchido", async () => {
    await openPicker();
    const content = (await screen.findByRole("button", { name: "Colar SVG" })).closest(
      "[data-radix-popper-content-wrapper], div"
    ) as HTMLElement;

    fireEvent.paste(content, { clipboardData: { getData: () => CLEAN } });

    expect(await screen.findByLabelText(/Markup do SVG/)).toHaveValue(CLEAN);
  });

  it("colar num campo do popover não sequestra a colagem (o atalho é só para o vazio)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.mocked(fetchIconAssets).mockResolvedValue([
      libraryAsset("icon-1", "Foguete", "https://cdn.example.com/library/foguete.svg"),
    ]);
    render(<TaskIconPicker value={{ icon_key: null, icon_url: null }} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    await user.click(await screen.findByRole("button", { name: "Gerenciar" }));
    await user.click(await screen.findByRole("button", { name: "Renomear Foguete" }));

    const input = screen.getByLabelText("Novo nome de Foguete");
    await user.clear(input);
    await user.paste(CLEAN);

    // O texto foi para o campo que tinha o foco, e o campo de colar SVG não abriu por cima.
    expect(input).toHaveValue(CLEAN);
    expect(screen.queryByLabelText(/Markup do SVG/)).not.toBeInTheDocument();
  });

  it("colar texto que não parece SVG não abre o campo (o popover segue como estava)", async () => {
    await openPicker();
    const content = (await screen.findByRole("button", { name: "Colar SVG" })).closest(
      "div"
    ) as HTMLElement;

    fireEvent.paste(content, { clipboardData: { getData: () => "só um texto qualquer" } });

    expect(screen.queryByLabelText(/Markup do SVG/)).not.toBeInTheDocument();
  });

  it("salvar o SVG colado sobe o markup LIMPO, põe o ícone na lista e o adota na tarefa", async () => {
    const { user, onChange } = await openPicker();
    vi.mocked(uploadIconAsset).mockResolvedValue(
      libraryAsset("icon-9", "Bolinha", "https://cdn.example.com/library/bolinha.svg")
    );

    await user.click(await screen.findByRole("button", { name: "Colar SVG" }));
    await user.click(screen.getByLabelText(/Markup do SVG/));
    await user.paste(DIRTY);
    // O usuário vê, antes de salvar, que a limpeza tirou algo — o desenho pode não ser o do site
    // de origem.
    expect(await screen.findByText(SVG_ICON_REMOVED_WARNING)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Nome na lista/), "Bolinha");
    await user.click(screen.getByRole("button", { name: "Salvar ícone" }));

    await vi.waitFor(() => expect(uploadIconAsset).toHaveBeenCalledTimes(1));
    const [source, name] = vi.mocked(uploadIconAsset).mock.calls[0];
    expect(name).toBe("Bolinha");
    expect("svg" in source && source.svg).not.toContain("<script");
    expect("svg" in source && source.svg).toContain("<circle");

    // Já vira o ícone da tarefa: foi para isso que o popover foi aberto.
    await vi.waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        icon_key: null,
        icon_url: "https://cdn.example.com/library/bolinha.svg",
      })
    );
  });

  it("o ícone salvo passa a aparecer na lista ao reabrir o popover, sem nova busca", async () => {
    const { user } = await openPicker();
    vi.mocked(uploadIconAsset).mockResolvedValue(
      libraryAsset("icon-9", "Bolinha", "https://cdn.example.com/library/bolinha.svg")
    );

    await user.click(await screen.findByRole("button", { name: "Colar SVG" }));
    await user.click(screen.getByLabelText(/Markup do SVG/));
    await user.paste(CLEAN);
    await user.click(screen.getByRole("button", { name: "Salvar ícone" }));

    await vi.waitFor(() => expect(uploadIconAsset).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Definir ícone" }));

    expect(await screen.findByRole("button", { name: "Bolinha" })).toBeInTheDocument();
    expect(fetchIconAssets).toHaveBeenCalledTimes(1);
  });

  it("SVG inválido não chega à API e mostra a mensagem da recusa", async () => {
    const { user, onChange } = await openPicker();

    await user.click(await screen.findByRole("button", { name: "Colar SVG" }));
    await user.click(screen.getByLabelText(/Markup do SVG/));
    await user.paste("<svg><script>alert(1)</script></svg>");
    await user.click(screen.getByRole("button", { name: "Salvar ícone" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/removido por segurança/);
    expect(uploadIconAsset).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("falha no upload do SVG vira toast e não muda o ícone da tarefa", async () => {
    const { user, onChange } = await openPicker();
    vi.mocked(uploadIconAsset).mockRejectedValue(new Error("bucket fora do ar"));

    await user.click(await screen.findByRole("button", { name: "Colar SVG" }));
    await user.click(screen.getByLabelText(/Markup do SVG/));
    await user.paste(CLEAN);
    await user.click(screen.getByRole("button", { name: "Salvar ícone" }));

    await vi.waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Erro", variant: "destructive" })
      )
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Cancelar fecha o campo e esquece o markup", async () => {
    const { user } = await openPicker();

    await user.click(await screen.findByRole("button", { name: "Colar SVG" }));
    await user.click(screen.getByLabelText(/Markup do SVG/));
    await user.paste(CLEAN);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByLabelText(/Markup do SVG/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Colar SVG" }));
    expect(await screen.findByLabelText(/Markup do SVG/)).toHaveValue("");
  });
});

/**
 * Feature 086 — gerenciar a biblioteca de dentro do popover. A regra que mais importa aqui é a da
 * exclusão: ela tira a linha da lista e **não** mexe em quem já usa aquele ícone (nem no arquivo do
 * bucket, o que o teste de API afirma do outro lado).
 */
describe("TaskIconPicker — excluir e renomear da biblioteca (feature 086)", () => {
  const FOGUETE = "https://cdn.example.com/library/foguete.svg";

  beforeEach(() => {
    vi.mocked(uploadIconAsset).mockReset();
    vi.mocked(fetchIconAssets).mockReset();
    vi.mocked(deleteIconAsset).mockReset();
    vi.mocked(renameIconAsset).mockReset();
    vi.mocked(deleteIconAsset).mockResolvedValue(undefined);
    vi.mocked(renameIconAsset).mockResolvedValue(undefined);
    vi.mocked(fetchIconAssets).mockResolvedValue([
      libraryAsset("icon-1", "Foguete", FOGUETE),
      libraryAsset("icon-2", "Livro", "https://cdn.example.com/library/livro.png"),
    ]);
    toastMock.mockReset();
  });

  async function openManaging(
    value: { icon_key: string | null; icon_url: string | null } = {
      icon_key: null,
      icon_url: null,
    }
  ) {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TaskIconPicker value={value} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /ícone/i }));
    await user.click(await screen.findByRole("button", { name: "Gerenciar" }));
    return { user, onChange };
  }

  it("gerenciar é opcional: sem clicar, a lista é só de escolher", async () => {
    const user = userEvent.setup();
    render(<TaskIconPicker value={{ icon_key: null, icon_url: null }} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));

    expect(await screen.findByRole("button", { name: "Foguete" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir Foguete" })).not.toBeInTheDocument();
  });

  it("excluir pede confirmação dizendo que quem já usa o ícone continua com ele", async () => {
    const { user } = await openManaging();

    await user.click(await screen.findByRole("button", { name: "Excluir Foguete" }));

    expect(screen.getByText(new RegExp(ICON_DELETE_WARNING))).toBeInTheDocument();
    expect(deleteIconAsset).not.toHaveBeenCalled();
  });

  it("confirmar tira o ícone da lista sem alterar o icon_url da tarefa", async () => {
    // A tarefa aberta usa justamente o ícone que vai ser excluído: é o caso em que um efeito
    // colateral apareceria.
    const { user, onChange } = await openManaging({ icon_key: null, icon_url: FOGUETE });

    await user.click(await screen.findByRole("button", { name: "Excluir Foguete" }));
    await user.click(screen.getByRole("button", { name: "Excluir" }));

    await vi.waitFor(() => expect(deleteIconAsset).toHaveBeenCalledWith("icon-1"));
    await vi.waitFor(() =>
      expect(screen.queryByRole("button", { name: "Excluir Foguete" })).not.toBeInTheDocument()
    );
    // O ícone da tarefa não foi mexido — nem para limpar, nem para trocar.
    expect(onChange).not.toHaveBeenCalled();
    // E o vizinho continua na lista.
    expect(screen.getByRole("button", { name: "Excluir Livro" })).toBeInTheDocument();
  });

  it("cancelar a exclusão não chama a API", async () => {
    const { user } = await openManaging();

    await user.click(await screen.findByRole("button", { name: "Excluir Foguete" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(deleteIconAsset).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Excluir Foguete" })).toBeInTheDocument();
  });

  it("renomear troca o rótulo na lista, e só ele", async () => {
    const { user, onChange } = await openManaging();

    await user.click(await screen.findByRole("button", { name: "Renomear Foguete" }));
    const input = screen.getByLabelText("Novo nome de Foguete");
    await user.clear(input);
    await user.type(input, "Lançamento");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await vi.waitFor(() => expect(renameIconAsset).toHaveBeenCalledWith("icon-1", "Lançamento"));
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "Excluir Lançamento" })).toBeInTheDocument()
    );
    expect(onChange).not.toHaveBeenCalled();

    // Saindo do modo gerenciar, o ícone segue escolhível pelo nome novo.
    await user.click(screen.getByRole("button", { name: "Concluir" }));
    await user.click(await screen.findByRole("button", { name: "Lançamento" }));
    expect(onChange).toHaveBeenCalledWith({ icon_key: null, icon_url: FOGUETE });
  });

  it("falha ao excluir vira toast e o ícone continua na lista", async () => {
    vi.mocked(deleteIconAsset).mockRejectedValue(new Error("sem rede"));
    const { user } = await openManaging();

    await user.click(await screen.findByRole("button", { name: "Excluir Foguete" }));
    await user.click(screen.getByRole("button", { name: "Excluir" }));

    await vi.waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Erro", variant: "destructive" })
      )
    );
    expect(screen.getByText(new RegExp(ICON_DELETE_WARNING))).toBeInTheDocument();
  });
});
