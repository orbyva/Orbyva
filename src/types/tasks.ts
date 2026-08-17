export type ProjectStatus = "planned" | "active" | "completed" | "archived";

export interface Project {
  id: string;
  user_id?: string;
  name: string;
  description?: string | null;
  color?: string | null;
  notes?: string | null;
  goal_id?: string | null;
  status: ProjectStatus;
  tag_ids: string[];
  created_at?: string;
  updated_at?: string;
}

export type ProjectCreateRequest = Omit<
  Project,
  "id" | "user_id" | "created_at" | "updated_at"
>;

export type ProjectUpdateRequest = Partial<ProjectCreateRequest> & {
  id: string;
};

export interface ProjectEvent {
  id: string;
  user_id?: string;
  project_id: string;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  created_at?: string;
}

export type ProjectEventCreateRequest = Omit<
  ProjectEvent,
  "id" | "user_id" | "created_at"
>;

export interface Tag {
  id: string;
  user_id?: string;
  name: string;
  color: string;
  created_at?: string;
}

export type TagCreateRequest = Omit<Tag, "id" | "user_id" | "created_at">;
export type TagUpdateRequest = Partial<TagCreateRequest> & { id: string };

export type TaskStatus = "todo" | "doing" | "done";
export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type TaskPriority = "low" | "medium" | "high";
export type RecurrenceMonthlyMode = "day" | "weekday";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  /** Termina numa data (mutuamente exclusivo com `count` na UI; ambos podem coexistir sem erro). */
  until?: string | null;
  /** Termina depois de N ocorrências (contando a tarefa-origem como a primeira). */
  count?: number | null;
  /** Só válido com frequency "weekly". 0=domingo…6=sábado. Sem isso, mantém o comportamento antigo. */
  weekdays?: number[];
  /**
   * Só válido com frequency "monthly". "day" (padrão, comportamento antigo) repete no mesmo
   * dia do mês; "weekday" repete no mesmo "enésimo dia da semana do mês" da tarefa-origem
   * (ex.: "toda terceira terça-feira"), inferido de `originDueDate` — não é escolhido à parte.
   */
  monthlyMode?: RecurrenceMonthlyMode;
  /** HH:mm, herdado por cada ocorrência gerada como due_time. */
  time?: string | null;
}

export interface Task {
  id: string;
  user_id?: string;
  project_id: string | null;
  parent_task_id: string | null;
  recurrence_origin_id: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  tag_ids: string[];
  due_date: string | null;
  due_time?: string | null;
  start_date?: string | null;
  priority?: TaskPriority | null;
  recurrence_rule: RecurrenceRule | null;
  linked_recurring_id: string | null;
  linked_installment_number: number | null;
  /** Item da Lista de Compras que originou a tarefa (feature 051) — vínculo unidirecional 1:1.
   * Concluir a tarefa marca o item como comprado e vice-versa; excluir o item zera esta coluna
   * (`on delete set null`) sem apagar a tarefa. */
  linked_shopping_item_id?: string | null;
  /** Link externo genérico (ex.: issue/PR do GitHub) — provider é detectado no cliente pela URL. */
  external_url?: string | null;
  external_provider?: string | null;
  completed_at?: string | null;
  /** Estimated time to complete in minutes. */
  estimated_duration?: number | null;
  /** Chave de um ícone preset fixo (ex.: "flag", "star") — mutuamente exclusivo com `icon_url`;
   * selecionar um preset limpa o outro. Exibição prioriza `icon_url` quando presente. */
  icon_key?: string | null;
  /** URL pública de um ícone customizado enviado pelo usuário (bucket `task-icons`) — mutuamente
   * exclusivo com `icon_key`. */
  icon_url?: string | null;
  /** Marca a tarefa como um marco no Gantt (feature 037) — sem duração, um ponto na linha do
   * tempo (`due_date`) em vez de uma barra. */
  is_milestone?: boolean;
  /** Marca a tarefa (e a série materializada a partir dela) como uma medicação (feature 049) —
   * usado pra exibir o histórico de doses tomadas no dialog "Ocorrências de...". */
  is_medication?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type TaskCreateRequest = Omit<
  Task,
  | "id"
  | "user_id"
  | "created_at"
  | "updated_at"
  | "recurrence_origin_id"
  | "completed_at"
  | "linked_installment_number"
>;

export type TaskUpdateRequest = Partial<TaskCreateRequest> & { id: string };

export interface TaskDependency {
  task_id: string;
  depends_on_task_id: string;
}

export interface TaskTimeEntry {
  id: string;
  user_id?: string;
  task_id: string;
  started_at: string;
  ended_at: string | null;
  created_at?: string;
}

export interface SubtaskDraft {
  /** Presente só quando já é uma subtarefa real (modo edição) — ausente = ainda não salva. */
  id?: string;
  title: string;
}
