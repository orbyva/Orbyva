/**
 * Executa uma proposta da Orb (feature 100) — o lado do CLIENT da criação com confirmação.
 *
 * Grava pelas MESMAS funções que os formulários do app usam. Não é preferência de estilo: é o que
 * garante que uma tarefa criada pela Orb passe pelas mesmas validações, pelos mesmos vínculos e
 * pelos mesmos defaults que a criada na tela — e que ela continue passando quando essas regras
 * mudarem. Um `insert` próprio aqui envelheceria em silêncio.
 *
 * O payload que chega vem pelo stream e é reconstruído campo a campo por
 * `sanitizeOrbProposalPayload` antes de virar `insert`: nada que o modelo escreveu entra no banco
 * sem passar pela whitelist do tipo.
 */

import { createNote } from "@/api/notes/notes";
import { createShoppingItem } from "@/api/shopping/items";
import { createProject, createProjectEvent, createTask } from "@/api/tasks";
import { createTransactionApi } from "@/api/finance/transactions";
import {
  sanitizeOrbProposalPayload,
  type OrbProposal,
} from "../../supabase/functions/_shared/orb/actions.ts";

export interface OrbProposalOutcome {
  /** Frase curta de sucesso, para o cartão: "Tarefa criada." */
  message: string;
  /** Para onde ir ver o que foi criado. */
  link?: string;
}

function texto(payload: Record<string, unknown>, chave: string): string | null {
  const valor = payload[chave];
  return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}

function numero(payload: Record<string, unknown>, chave: string): number | null {
  const valor = payload[chave];
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

export async function executeOrbProposal(proposal: OrbProposal): Promise<OrbProposalOutcome> {
  const payload = sanitizeOrbProposalPayload(proposal.kind, proposal.payload);
  if (!payload) {
    throw new Error("A proposta chegou incompleta e não foi gravada.");
  }

  switch (proposal.kind) {
    case "task": {
      const titulo = texto(payload, "title") ?? "Nova tarefa";
      const tarefa = await createTask({
        title: titulo,
        description: texto(payload, "description"),
        status: "todo",
        priority: (texto(payload, "priority") as "low" | "medium" | "high" | null) ?? null,
        due_date: texto(payload, "due_date"),
        due_time: texto(payload, "due_time"),
        start_date: texto(payload, "start_date"),
        estimated_duration: numero(payload, "estimated_duration"),
        project_id: texto(payload, "project_id"),
        parent_task_id: null,
        recurrence_rule: null,
        linked_recurring_id: null,
        tag_ids: [],
      });
      return {
        message: "Tarefa criada.",
        // Feature 102: agora existe destino por id. O link por título (`?q=`) era busca textual —
        // ele abre a tarefa errada quando o título se repete, e recorrência materializa dezenas de
        // tarefas com o mesmo nome.
        link: `/tasks?task=${encodeURIComponent(tarefa.id)}`,
      };
    }

    case "transaction": {
      const valor = numero(payload, "value");
      const classId = payload.class_id;
      if (valor === null || (typeof classId !== "number" && typeof classId !== "string")) {
        throw new Error("O lançamento chegou sem valor ou sem categoria.");
      }
      const descricao = texto(payload, "description") ?? "Lançamento";
      // `createTransactionApi` enfileira sozinha quando o navegador está offline — o cartão avisa.
      const { queued } = await createTransactionApi({
        value: valor,
        class_id: Number(classId),
        description: descricao,
        transaction_at: texto(payload, "transaction_at") ?? new Date().toISOString(),
      });
      return {
        message: queued ? "Lançamento na fila — vai subir quando a conexão voltar." : "Lançamento criado.",
        link: `/finance/transactions?q=${encodeURIComponent(descricao)}`,
      };
    }

    case "note": {
      const nota = await createNote({
        title: texto(payload, "title") ?? "Nova nota",
        content: texto(payload, "content") ?? "",
        project_id: texto(payload, "project_id"),
      });
      return { message: "Nota criada.", link: `/notes/${nota.id}` };
    }

    case "shopping_item": {
      await createShoppingItem({
        title: texto(payload, "title") ?? "Novo item",
        description: texto(payload, "description"),
        quantity: numero(payload, "quantity"),
        unit: texto(payload, "unit"),
        status: "pending",
        shopping_category_id: texto(payload, "shopping_category_id"),
      });
      return { message: "Item adicionado à lista.", link: "/shopping-list" };
    }

    case "project": {
      const projeto = await createProject({
        name: texto(payload, "name") ?? "Novo projeto",
        description: texto(payload, "description"),
        status: "active",
        tag_ids: [],
      });
      return { message: "Projeto criado.", link: `/tasks/projects/${projeto.id}` };
    }

    case "event": {
      const inicio = texto(payload, "starts_at");
      if (!inicio) throw new Error("O evento chegou sem data de início.");
      await createProjectEvent({
        title: texto(payload, "title") ?? "Novo evento",
        starts_at: inicio,
        ends_at: texto(payload, "ends_at"),
        project_id: texto(payload, "project_id"),
      });
      return { message: "Evento criado.", link: "/tasks/agenda" };
    }
  }
}
