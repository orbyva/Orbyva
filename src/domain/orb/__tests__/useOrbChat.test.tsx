import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useOrbChat } from "@/hooks/useOrbChat";
import type { OrbMessage, OrbStreamEvent, OrbTurnRequest } from "@/types/orb";

/**
 * O hook é dirigido pelos eventos do SSE, e é isso que este arquivo faz: `streamOrbTurn` vira um
 * turno controlado pelo teste (emitir evento, concluir, falhar), sem rede e sem Supabase.
 */
const { streamMock } = vi.hoisted(() => ({ streamMock: vi.fn() }));
vi.mock("@/api/orb", () => ({ streamOrbTurn: streamMock }));

interface OpcoesDoTurno extends OrbTurnRequest {
  onEvent: (event: OrbStreamEvent) => void;
  signal?: AbortSignal;
}

interface TurnoFake {
  opcoes: OpcoesDoTurno;
  emitir: (event: OrbStreamEvent) => void;
  concluir: () => void;
  falhar: (erro: unknown) => void;
}

let turnos: TurnoFake[] = [];

const ultimo = (): TurnoFake => turnos[turnos.length - 1];

beforeEach(() => {
  turnos = [];
  streamMock.mockReset();
  streamMock.mockImplementation(
    (opcoes: OpcoesDoTurno) =>
      new Promise<void>((resolve, reject) => {
        opcoes.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
        turnos.push({
          opcoes,
          emitir: (event) => opcoes.onEvent(event),
          concluir: resolve,
          falhar: reject,
        });
      })
  );
});

async function iniciarTurno(enviar: () => void) {
  await act(async () => {
    enviar();
  });
  await waitFor(() => expect(turnos.length).toBeGreaterThan(0));
}

function resposta(messages: OrbMessage[]): OrbMessage {
  return messages[messages.length - 1];
}

describe("useOrbChat — chamadas de tool", () => {
  it("mostra duas chamadas da MESMA tool como duas, e fecha cada uma pelo id", async () => {
    const { result } = renderHook(() => useOrbChat());
    await iniciarTurno(() => void result.current.send("quanto gastei em agosto e setembro?"));

    act(() => {
      ultimo().emitir({
        type: "tool",
        id: "c1",
        name: "query_transactions",
        phase: "start",
        input: { start_date: "2026-08-01" },
      });
      ultimo().emitir({
        type: "tool",
        id: "c2",
        name: "query_transactions",
        phase: "start",
        input: { start_date: "2026-09-01" },
      });
    });

    // A dedup por nome escondia a segunda consulta — e o usuário não entendia de onde vinha o número.
    expect(resposta(result.current.messages).tools).toHaveLength(2);
    expect(resposta(result.current.messages).tools?.[0].input).toEqual({
      start_date: "2026-08-01",
    });

    act(() => {
      ultimo().emitir({
        type: "tool",
        id: "c2",
        name: "query_transactions",
        phase: "done",
        ok: true,
        summary: { transactions: [{ description: "Mercado", value: 120 }] },
        duration_ms: 240,
      });
    });

    const tools = resposta(result.current.messages).tools ?? [];
    expect(tools[0].status).toBe("running");
    expect(tools[1]).toMatchObject({
      id: "c2",
      status: "ok",
      durationMs: 240,
      summary: { transactions: [{ description: "Mercado", value: 120 }] },
    });
  });

  it("marca a chamada como erro quando o `done` vem com ok:false", async () => {
    const { result } = renderHook(() => useOrbChat());
    await iniciarTurno(() => void result.current.send("meus hábitos"));

    act(() => {
      ultimo().emitir({ type: "tool", id: "c1", name: "query_habits", phase: "start" });
      ultimo().emitir({
        type: "tool",
        id: "c1",
        name: "query_habits",
        phase: "done",
        ok: false,
        summary: { error: "Não consegui ler os hábitos agora." },
      });
    });

    expect(resposta(result.current.messages).tools?.[0].status).toBe("error");
  });

  it("fecha a chamada aberta pelo nome quando o servidor não manda id", async () => {
    const { result } = renderHook(() => useOrbChat());
    await iniciarTurno(() => void result.current.send("minhas tarefas"));

    act(() => {
      ultimo().emitir({ type: "tool", name: "query_tasks", phase: "start" });
      ultimo().emitir({ type: "tool", name: "query_tasks", phase: "done", ok: true });
    });

    const tools = resposta(result.current.messages).tools ?? [];
    expect(tools).toHaveLength(1);
    expect(tools[0].status).toBe("ok");
  });

  it("no abort, toda chamada em running vira erro e a bolha fica retomável", async () => {
    const { result } = renderHook(() => useOrbChat());
    await iniciarTurno(() => void result.current.send("resumo do mês"));

    act(() => {
      ultimo().emitir({ type: "tool", id: "c1", name: "query_transactions", phase: "start" });
      ultimo().emitir({ type: "tool", id: "c2", name: "query_budget_status", phase: "start" });
      ultimo().emitir({
        type: "tool",
        id: "c1",
        name: "query_transactions",
        phase: "done",
        ok: true,
      });
    });

    await act(async () => {
      result.current.stop();
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    const mensagem = resposta(result.current.messages);
    expect(mensagem.tools?.map((tool) => tool.status)).toEqual(["ok", "error"]);
    expect(mensagem.pending).toBe(false);
    expect(mensagem.interrupted).toBe(true);
    expect(mensagem.content).toBe("Resposta interrompida.");
  });

  it("no erro, chamada ainda aberta também para de girar", async () => {
    const { result } = renderHook(() => useOrbChat());
    await iniciarTurno(() => void result.current.send("quanto sobra este mês?"));

    act(() => {
      ultimo().emitir({ type: "tool", id: "c1", name: "query_transactions", phase: "start" });
      ultimo().emitir({ type: "error", message: "A Orb não conseguiu responder agora." });
    });
    await act(async () => {
      ultimo().concluir();
    });

    const mensagem = resposta(result.current.messages);
    expect(mensagem.tools?.[0].status).toBe("error");
    expect(mensagem.failed).toBe(true);
  });
});

describe("useOrbChat — estado do turno", () => {
  it("guarda o usage do `done` e ignora um usage sem forma conhecida", async () => {
    const { result } = renderHook(() => useOrbChat());

    await iniciarTurno(() => void result.current.send("oi"));
    act(() => {
      ultimo().emitir({ type: "text", text: "Olá!" });
      ultimo().emitir({
        type: "done",
        usage: { input_tokens: 12400, output_tokens: 320, cache_read_input_tokens: 8000, rounds: 2 },
      });
    });
    await act(async () => {
      ultimo().concluir();
    });

    expect(resposta(result.current.messages).usage).toEqual({
      input_tokens: 12400,
      output_tokens: 320,
      cache_read_input_tokens: 8000,
      rounds: 2,
    });

    await iniciarTurno(() => void result.current.send("de novo"));
    act(() => {
      ultimo().emitir({ type: "text", text: "Claro." });
      ultimo().emitir({ type: "done", usage: "bastante" });
    });
    await act(async () => {
      ultimo().concluir();
    });

    expect(resposta(result.current.messages).usage).toBeUndefined();
  });

  it("nunca deixa bolha vazia sem erro quando o turno acaba sem texto", async () => {
    const { result } = renderHook(() => useOrbChat());
    await iniciarTurno(() => void result.current.send("e aí?"));

    await act(async () => {
      ultimo().concluir();
    });

    const mensagem = resposta(result.current.messages);
    expect(mensagem.content).toBe("A Orb terminou sem escrever nada. Tente de novo.");
    expect(mensagem.failed).toBe(true);
    expect(mensagem.pending).toBe(false);
  });

  it("mantém o texto parcial quando o erro chega depois de alguma resposta", async () => {
    const { result } = renderHook(() => useOrbChat());
    await iniciarTurno(() => void result.current.send("relatório completo"));

    act(() => {
      ultimo().emitir({ type: "text", text: "Em agosto você gastou" });
      ultimo().emitir({ type: "error", message: "A resposta ficou longa demais." });
    });
    await act(async () => {
      ultimo().concluir();
    });

    expect(resposta(result.current.messages).content).toBe(
      "Em agosto você gastou\n\nA resposta ficou longa demais."
    );
  });

  it("marca erro de sessão para a UI oferecer login em vez de nova tentativa", async () => {
    const { result } = renderHook(() => useOrbChat());
    await iniciarTurno(() => void result.current.send("oi"));

    await act(async () => {
      ultimo().falhar(new Error("Sessão expirada. Entre de novo para falar com a Orb."));
    });

    expect(resposta(result.current.messages).errorKind).toBe("session");
  });

  it("manda o histórico atualizado no turno seguinte (sem closure velha)", async () => {
    const { result } = renderHook(() => useOrbChat());

    await iniciarTurno(() => void result.current.send("quanto gastei?"));
    act(() => ultimo().emitir({ type: "text", text: "R$ 1.200,00." }));
    await act(async () => {
      ultimo().concluir();
    });

    await iniciarTurno(() => void result.current.send("e em julho?"));

    expect(ultimo().opcoes.messages).toEqual([
      { role: "user", content: "quanto gastei?" },
      { role: "assistant", content: "R$ 1.200,00." },
      { role: "user", content: "e em julho?" },
    ]);
  });
});

describe("useOrbChat — retry e edição", () => {
  it("refaz o turno falho sem duplicar a pergunta do usuário", async () => {
    const { result } = renderHook(() => useOrbChat());

    await iniciarTurno(() => void result.current.send("quanto gastei?"));
    act(() => ultimo().emitir({ type: "error", message: "A Orb não conseguiu responder agora." }));
    await act(async () => {
      ultimo().concluir();
    });
    expect(result.current.messages).toHaveLength(2);

    const falha = result.current.messages[1];
    await iniciarTurno(() => void result.current.retry(falha.id));

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages.filter((mensagem) => mensagem.role === "user")).toHaveLength(1);
    expect(result.current.messages[1].failed).toBeFalsy();
    // A bolha de erro não pode voltar ao servidor como se fosse fala da Orb.
    expect(ultimo().opcoes.messages).toEqual([{ role: "user", content: "quanto gastei?" }]);
  });

  it("refaz também a resposta interrompida", async () => {
    const { result } = renderHook(() => useOrbChat());

    await iniciarTurno(() => void result.current.send("resumo do mês"));
    await act(async () => {
      result.current.stop();
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    expect(result.current.messages[1].interrupted).toBe(true);

    await iniciarTurno(() => void result.current.retry(result.current.messages[1].id));

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].interrupted).toBeFalsy();
    expect(turnos).toHaveLength(2);
  });

  it("editar uma pergunta trunca o que veio depois dela e reenvia", async () => {
    const { result } = renderHook(() => useOrbChat());

    await iniciarTurno(() => void result.current.send("quanto gastei?"));
    act(() => ultimo().emitir({ type: "text", text: "R$ 1.200,00." }));
    await act(async () => {
      ultimo().concluir();
    });

    const pergunta = result.current.messages[0];
    await iniciarTurno(() => void result.current.editUserMessage(pergunta.id, "quanto recebi?"));

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].content).toBe("quanto recebi?");
    expect(ultimo().opcoes.messages).toEqual([{ role: "user", content: "quanto recebi?" }]);
  });

  it("ignora retry e edição enquanto um turno está em stream", async () => {
    const { result } = renderHook(() => useOrbChat());
    await iniciarTurno(() => void result.current.send("quanto gastei?"));

    const pergunta = result.current.messages[0];
    await act(async () => {
      void result.current.retry(pergunta.id);
      void result.current.editUserMessage(pergunta.id, "outra coisa");
      void result.current.send("mais uma");
    });

    expect(turnos).toHaveLength(1);
  });

  it("reset limpa a conversa e destrava o envio", async () => {
    const { result } = renderHook(() => useOrbChat());
    await iniciarTurno(() => void result.current.send("oi"));

    await act(async () => {
      result.current.reset();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.isStreaming).toBe(false);

    await iniciarTurno(() => void result.current.send("de novo"));
    expect(ultimo().opcoes.messages).toEqual([{ role: "user", content: "de novo" }]);
  });
});

describe("useOrbChat — histórico enviado", () => {
  it("não devolve à Orb o texto que o próprio client escreveu na bolha", async () => {
    const { result } = renderHook(() => useOrbChat());

    await iniciarTurno(() => void result.current.send("primeira"));
    await act(async () => {
      result.current.stop();
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    await iniciarTurno(() => void result.current.send("segunda"));

    expect(ultimo().opcoes.messages).toEqual([
      { role: "user", content: "primeira" },
      { role: "user", content: "segunda" },
    ]);
  });

  it("mantém o pedaço que a Orb chegou a escrever antes da parada", async () => {
    const { result } = renderHook(() => useOrbChat());

    await iniciarTurno(() => void result.current.send("primeira"));
    act(() => ultimo().emitir({ type: "text", text: "Em agosto você" }));
    await act(async () => {
      result.current.stop();
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    await iniciarTurno(() => void result.current.send("segunda"));

    expect(ultimo().opcoes.messages).toEqual([
      { role: "user", content: "primeira" },
      { role: "assistant", content: "Em agosto você" },
      { role: "user", content: "segunda" },
    ]);
  });
});

/**
 * A navegação da Orb (feature 100). O caminho vem pelo stream, e o hook só o entrega a quem navega
 * depois de passar pela whitelist do catálogo — este bloco é o que garante que essa peneira exista.
 *
 * Navegar no `tool done` no meio do stream tirava a pessoa da conversa antes de ler a resposta.
 * O alvo fica guardado e só dispara depois do turno fechar.
 */
describe("useOrbChat — navegação", () => {
  const alvo = {
    path: "/tasks?project=p-1",
    label: "Tarefas · Sacada",
    screen: "tasks",
    applied: ["project: Sacada"],
  };

  it("não navega no meio do stream — só depois do turno fechar", async () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() => useOrbChat({ onNavigate }));
    await iniciarTurno(() => void result.current.send("me mostra as tarefas do Sacada"));

    act(() => {
      ultimo().emitir({ type: "tool", id: "1", name: "open_screen", phase: "start" });
      ultimo().emitir({ type: "tool", id: "1", name: "open_screen", phase: "done", ok: true, summary: alvo });
      ultimo().emitir({ type: "text", text: "Levei você às tarefas do Sacada." });
    });

    expect(onNavigate).not.toHaveBeenCalled();

    await act(async () => {
      ultimo().concluir();
    });

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(alvo));
  });

  it("não navega se a pessoa parou o stream", async () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() => useOrbChat({ onNavigate }));
    await iniciarTurno(() => void result.current.send("abre cinema"));

    act(() => {
      ultimo().emitir({ type: "tool", id: "1", name: "open_screen", phase: "done", ok: true, summary: alvo });
    });
    expect(onNavigate).not.toHaveBeenCalled();

    await act(async () => {
      result.current.stop();
    });

    // Dá tempo do timeout de navegação (se existisse) disparar — e confirma que não dispara.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 500));
    });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("ignora caminho fora do catálogo e tool que falhou", async () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() => useOrbChat({ onNavigate }));
    await iniciarTurno(() => void result.current.send("abre o console"));

    act(() => {
      ultimo().emitir({
        type: "tool",
        id: "1",
        name: "open_screen",
        phase: "done",
        ok: true,
        summary: { ...alvo, path: "https://exemplo.invalido/ops" },
      });
      ultimo().emitir({
        type: "tool",
        id: "2",
        name: "open_screen",
        phase: "done",
        ok: false,
        summary: { error: "não achei", code: "nao_encontrado" },
      });
      // Resultado de outra tool com o mesmo formato não navega: só a tool de navegação navega.
      ultimo().emitir({ type: "tool", id: "3", name: "query_tasks", phase: "done", ok: true, summary: alvo });
    });

    await act(async () => {
      ultimo().concluir();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 500));
    });
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
