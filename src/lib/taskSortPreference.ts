/**
 * Preferência local de ordenação da lista de tarefas (feature 079).
 *
 * É preferência de visualização, não dado: fica em `localStorage`, por navegador, e nunca vira
 * coluna de banco. Toda leitura/escrita é tolerante — `localStorage` pode não existir (SSR, teste em
 * ambiente "node") ou lançar (modo privado, cota, cookies bloqueados); nesses casos a tela cai no
 * padrão de fábrica em vez de quebrar.
 */
import { DEFAULT_TASK_SORT_KEY, isTaskSortKey, type TaskSortKey } from "@/domain/tasks/filters";

export const TASK_SORT_STORAGE_KEY = "orbyva_task_sort_v1";

/** A chave salva, ou o padrão de fábrica ("updated") quando não há nada salvo, o valor é inválido
 * ou o `localStorage` não está disponível. */
export function readTaskSortKey(): TaskSortKey {
  try {
    const raw = localStorage.getItem(TASK_SORT_STORAGE_KEY);
    return isTaskSortKey(raw) ? raw : DEFAULT_TASK_SORT_KEY;
  } catch {
    return DEFAULT_TASK_SORT_KEY;
  }
}

/** Salva a escolha. Chave desconhecida não é gravada — melhor manter o que já estava do que
 * escrever lixo que a próxima leitura vai descartar. */
export function writeTaskSortKey(key: TaskSortKey): void {
  if (!isTaskSortKey(key)) return;
  try {
    localStorage.setItem(TASK_SORT_STORAGE_KEY, key);
  } catch {
    /* ignore */
  }
}
