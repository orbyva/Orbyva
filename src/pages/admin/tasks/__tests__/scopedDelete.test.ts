import { beforeEach, describe, expect, it, vi } from "vitest";
import { runScopedTaskDelete } from "@/pages/admin/tasks/scopedDelete";
import { deleteTaskSeries } from "@/api/tasks";
import {
  endMedicationAndDeleteFutureDoses,
  EndMedicationError,
} from "@/api/health/medications";
import type { Task } from "@/types/tasks";

/**
 * Feature 075 — os estados de borda da exclusão com escopo, que as três telas compartilham.
 *
 * O caso que justifica o arquivo é o **erro parcial**: "encerrar o tratamento e apagar as doses" são
 * duas escritas, e a segunda pode falhar depois de a primeira valer. Nesse caso a tela precisa
 * mostrar o erro **e** recarregar — o tratamento **está** encerrado, e deixar a tela velha faria o
 * usuário achar que nada aconteceu e tentar de novo achando que está no mesmo ponto.
 */

vi.mock("@/api/tasks", () => ({ deleteTaskSeries: vi.fn() }));
vi.mock("@/api/health/medications", () => ({
  endMedicationAndDeleteFutureDoses: vi.fn(),
  EndMedicationError: class EndMedicationError extends Error {
    constructor(
      readonly stage: "deactivate" | "delete",
      message: string
    ) {
      super(message);
    }
  },
}));

const task = { id: "dose-1", medication_id: "med-1" } as Task;
const mockedDelete = vi.mocked(deleteTaskSeries);
const mockedEnd = vi.mocked(endMedicationAndDeleteFutureDoses);

function ctx() {
  return { reload: vi.fn(), notify: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runScopedTaskDelete — sucesso", () => {
  it("diz quantas linhas saíram e recarrega a tela", async () => {
    mockedDelete.mockResolvedValue(12);
    const c = ctx();

    await runScopedTaskDelete(task, { mode: "series" }, c);

    expect(mockedDelete).toHaveBeenCalledWith(task, { mode: "series" });
    expect(c.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "12 tarefas excluídas" })
    );
    expect(c.reload).toHaveBeenCalledTimes(1);
  });

  it("uma linha só fala no singular", async () => {
    mockedDelete.mockResolvedValue(1);
    const c = ctx();

    await runScopedTaskDelete(task, { mode: "single" }, c);

    expect(c.notify).toHaveBeenCalledWith(expect.objectContaining({ title: "1 tarefa excluída" }));
  });

  it("'encerrar o tratamento' não passa por deleteTaskSeries direto e avisa que não volta", async () => {
    mockedEnd.mockResolvedValue(4);
    const c = ctx();

    await runScopedTaskDelete(task, { mode: "end-treatment" }, c);

    expect(mockedEnd).toHaveBeenCalledWith(task);
    // A ordem "desativa e só então apaga" mora na API; aqui o que importa é não desviar dela.
    expect(mockedDelete).not.toHaveBeenCalled();
    expect(c.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "4 tarefas excluídas",
        description: expect.stringContaining("não voltam"),
      })
    );
  });
});

describe("runScopedTaskDelete — falhas", () => {
  it("exclusão que falha vira toast destrutivo e a tela **não** recarrega (nada some)", async () => {
    mockedDelete.mockRejectedValue(new Error("permission denied for table task"));
    const c = ctx();

    await runScopedTaskDelete(task, { mode: "series" }, c);

    expect(c.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Erro",
        variant: "destructive",
        // `getErrorMessage` traduz o erro cru do Postgres numa frase que o usuário entende.
        description: "Sem permissão para esta ação.",
      })
    );
    expect(c.reload).not.toHaveBeenCalled();
  });

  it("falhar ao encerrar não recarrega: nada mudou no banco", async () => {
    mockedEnd.mockRejectedValue(
      new EndMedicationError("deactivate", "Não foi possível encerrar o tratamento. Nenhuma dose foi apagada.")
    );
    const c = ctx();

    await runScopedTaskDelete(task, { mode: "end-treatment" }, c);

    expect(c.notify).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive", description: expect.stringContaining("Nenhuma dose foi apagada") })
    );
    expect(c.reload).not.toHaveBeenCalled();
  });

  it("erro parcial (encerrou, não apagou) mostra o erro **e** recarrega", async () => {
    mockedEnd.mockRejectedValue(
      new EndMedicationError("delete", "O tratamento foi encerrado, mas não foi possível apagar as doses futuras.")
    );
    const c = ctx();

    await runScopedTaskDelete(task, { mode: "end-treatment" }, c);

    expect(c.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        description: expect.stringContaining("tratamento foi encerrado"),
      })
    );
    // O encerramento valeu: a tela tem de refletir isso, mesmo tendo dado erro.
    expect(c.reload).toHaveBeenCalledTimes(1);
  });
});
