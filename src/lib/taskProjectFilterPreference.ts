/**
 * Preferência local do filtro de projeto das Tarefas (feature 097).
 *
 * É preferência de visualização, não dado: fica em `localStorage`, por navegador, e nunca vira
 * coluna de banco. Toda leitura/escrita é tolerante — `localStorage` pode não existir (SSR, teste em
 * ambiente "node") ou lançar (modo privado, cota, cookies bloqueados); nesses casos a tela cai no
 * padrão de fábrica em vez de quebrar.
 *
 * Uma chave só para as quatro visões e para a rota standalone `/tasks/agenda`: é a mesma
 * preferência do mesmo usuário, e o recorte "estou trabalhando no projeto X" não muda quando ele
 * troca de aba. Quem confere se o id salvo ainda existe é `normalizeProjectFilter`
 * (`@/domain/tasks/filters`) — aqui não dá pra saber, a lista de projetos ainda nem carregou.
 */
import { PROJECT_FILTER_ALL, isProjectFilterValue } from "@/domain/tasks/filters";

export const TASK_PROJECT_FILTER_STORAGE_KEY = "orbyva_task_project_filter_v1";

/** O filtro salvo, ou `"all"` quando não há nada salvo, o valor é inválido ou o `localStorage` não
 * está disponível. */
export function readTaskProjectFilter(): string {
  try {
    const raw = localStorage.getItem(TASK_PROJECT_FILTER_STORAGE_KEY);
    return isProjectFilterValue(raw) ? raw : PROJECT_FILTER_ALL;
  } catch {
    return PROJECT_FILTER_ALL;
  }
}

/** Salva a escolha. Valor sem forma de filtro (string vazia, não-string) não é gravado — melhor
 * manter o que já estava do que escrever lixo que a próxima leitura vai descartar. */
export function writeTaskProjectFilter(value: string): void {
  if (!isProjectFilterValue(value)) return;
  try {
    localStorage.setItem(TASK_PROJECT_FILTER_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}
