export type TaskStatus = "todo" | "doing" | "done";
export type TaskPriority = "low" | "medium" | "high";
export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type RecurrenceMonthlyMode = "day" | "weekday";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  until?: string | null;
  count?: number | null;
  weekdays?: number[];
  monthlyMode?: RecurrenceMonthlyMode;
  time?: string | null;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  due_date: string | null;
  due_time?: string | null;
  completed_at?: string | null;
  parent_task_id: string | null;
  project_id: string | null;
  priority?: TaskPriority | null;
  recurrence_rule: RecurrenceRule | null;
  recurrence_origin_id: string | null;
  linked_recurring_id: string | null;
  linked_shopping_item_id?: string | null;
  linked_installment_number?: number | null;
  tag_ids?: string[];
  medication_id?: string | null;
  dose_time?: string | null;
  is_quick?: boolean;
  is_medication?: boolean;
  is_consultation?: boolean;
  icon_key?: string | null;
  icon_url?: string | null;
}

export type TaskListBucket = "overdue" | "today" | "inbox";

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "A fazer",
  doing: "Fazendo",
  done: "Feito",
};

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface TaskExternalLinkDraft {
  url: string;
  comment?: string | null;
}

export interface ProjectEvent {
  id: string;
  project_id: string | null;
  title: string;
  starts_at: string;
  ends_at?: string | null;
}

export type ProjectStatus = "planned" | "active" | "completed" | "archived";

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  status: ProjectStatus;
  created_at?: string;
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planned: "Planejado",
  active: "Ativo",
  completed: "Concluído",
  archived: "Arquivado",
};

export const PROJECT_FILTER_ALL = "all";
export const PROJECT_FILTER_NONE = "none";
