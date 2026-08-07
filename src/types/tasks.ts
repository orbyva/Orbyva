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
  /** Link externo genérico (ex.: issue/PR do GitHub) — provider é detectado no cliente pela URL. */
  external_url?: string | null;
  external_provider?: string | null;
  completed_at?: string | null;
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
