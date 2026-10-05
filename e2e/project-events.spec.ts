import { expect, test } from "@playwright/test";
import { e2eEnv, passwordGrant, rest } from "./helpers/auth";
import { e2eStamp } from "./helpers/cleanup";

/**
 * Feature 067 — fluxo da Agenda contra o banco real (migration da 066 aplicada): evento avulso, de
 * projeto e de tarefa; editar horário; excluir; e as duas check constraints que a tela respeita.
 * Bate no PostgREST com JWT real, sem navegador. Tudo que cria é apagado no `finally`.
 */
const env = e2eEnv();

type EventRow = {
  id: string;
  user_id: string;
  project_id: string | null;
  task_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string | null;
};

const at = (hoursFromNow: number) =>
  new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();

test.describe("eventos da agenda", () => {
  test.skip(!env.hasAuth, "Defina E2E_EMAIL e E2E_PASSWORD (e Supabase)");

  test("avulso, de projeto e de tarefa; editar; excluir; constraints", async () => {
    const session = await passwordGrant(env.email!, env.password!);
    const token = session.access_token;
    const uid = session.user.id;
    const stamp = e2eStamp("event");
    let projectId: string | null = null;
    let taskId: string | null = null;
    const eventIds: string[] = [];

    const insert = async <T>(table: string, row: Record<string, unknown>) => {
      const r = await rest(table, token, { method: "POST", body: JSON.stringify(row) });
      return { ...r, row: (r.json as T[] | null)?.[0] };
    };
    const createEvent = async (fields: Partial<EventRow>) => {
      const r = await insert<EventRow>("project_event", {
        user_id: uid,
        title: `${stamp} ${fields.title ?? "evento"}`,
        starts_at: at(24),
        ...fields,
      });
      if (r.row) eventIds.push(r.row.id);
      return r;
    };
    const readEvent = async (id: string) => {
      const r = await rest("project_event", token, {
        method: "GET",
        query: `select=*&id=eq.${id}`,
      });
      expect(r.res.ok, r.text).toBeTruthy();
      return (r.json as EventRow[])[0];
    };

    try {
      const project = await insert<{ id: string }>("project", { user_id: uid, name: stamp });
      expect(project.res.ok, project.text).toBeTruthy();
      projectId = project.row!.id;

      const task = await insert<{ id: string }>("task", {
        user_id: uid,
        project_id: projectId,
        title: stamp,
      });
      expect(task.res.ok, task.text).toBeTruthy();
      taskId = task.row!.id;

      const loose = await createEvent({ title: "avulso", ends_at: at(25) });
      expect(loose.res.ok, loose.text).toBeTruthy();
      expect(loose.row).toMatchObject({ project_id: null, task_id: null });

      const ofProject = await createEvent({ title: "projeto", project_id: projectId });
      expect(ofProject.res.ok, ofProject.text).toBeTruthy();
      expect(ofProject.row).toMatchObject({ project_id: projectId, task_id: null });

      const ofTask = await createEvent({ title: "tarefa", task_id: taskId });
      expect(ofTask.res.ok, ofTask.text).toBeTruthy();
      expect(ofTask.row).toMatchObject({ project_id: null, task_id: taskId });

      const both = await createEvent({ title: "os dois", project_id: projectId, task_id: taskId });
      expect(both.res.status, both.text).toBe(400);
      expect(both.text).toContain("project_event_single_link");

      const backwards = await createEvent({ title: "fim antes", starts_at: at(30), ends_at: at(29) });
      expect(backwards.res.status, backwards.text).toBe(400);
      expect(backwards.text).toContain("project_event_ends_after_starts");

      const newStart = at(48);
      const newEnd = at(50);
      const edit = await rest("project_event", token, {
        method: "PATCH",
        query: `id=eq.${loose.row!.id}&user_id=eq.${uid}`,
        body: JSON.stringify({ starts_at: newStart, ends_at: newEnd }),
      });
      expect(edit.res.ok, edit.text).toBeTruthy();
      const edited = await readEvent(loose.row!.id);
      expect(new Date(edited.starts_at).toISOString()).toBe(newStart);
      expect(new Date(edited.ends_at!).toISOString()).toBe(newEnd);

      const del = await rest("project_event", token, {
        method: "DELETE",
        query: `id=eq.${ofProject.row!.id}&user_id=eq.${uid}`,
      });
      expect(del.res.ok, del.text).toBeTruthy();
      expect(await readEvent(ofProject.row!.id)).toBeUndefined();

      const dropTask = await rest("task", token, { method: "DELETE", query: `id=eq.${taskId}` });
      expect(dropTask.res.ok, dropTask.text).toBeTruthy();
      taskId = null;
      expect(await readEvent(ofTask.row!.id)).toBeUndefined();
    } finally {
      for (const id of eventIds) {
        await rest("project_event", token, { method: "DELETE", query: `id=eq.${id}` }).catch(
          () => undefined
        );
      }
      if (taskId) {
        await rest("task", token, { method: "DELETE", query: `id=eq.${taskId}` }).catch(
          () => undefined
        );
      }
      if (projectId) {
        await rest("project", token, { method: "DELETE", query: `id=eq.${projectId}` }).catch(
          () => undefined
        );
      }
    }
  });
});
