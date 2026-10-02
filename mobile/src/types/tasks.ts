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
  estimated_duration?: number | null;
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

export type EventInviteStatus = "pending" | "accepted" | "revoked" | "expired";

/** `public.event_invite`. `email` nulo = convite só por link. */
export interface EventInvite {
  id: string;
  event_id: string;
  email: string | null;
  token: string;
  created_by: string;
  status: EventInviteStatus;
  expires_at: string;
  accepted_by?: string | null;
  accepted_event_id?: string | null;
  email_sent_at?: string | null;
  created_at?: string;
}

/** O que `get_event_invite_by_token` devolve ao convidado (nada do anfitrião). */
export type EventInvitePreview = Pick<
  EventInvite,
  "id" | "event_id" | "token" | "email" | "status" | "expires_at" | "created_at"
> & {
  accepted_by?: string | null;
  accepted_event_id?: string | null;
  event_title: string | null;
  event_starts_at: string | null;
  event_ends_at: string | null;
  accepted_by_me: boolean;
};

/** `public.link_icon_rule`: regra de aparência de link externo (a primeira que casa vence). */
export interface LinkIconRule {
  id: string;
  user_id?: string;
  name: string;
  pattern: string;
  label_template: string | null;
  icon_key: string | null;
  icon_url: string | null;
  position: number;
  enabled: boolean;
  created_at?: string;
}

export type LinkIconRuleDraft = Omit<LinkIconRule, "id" | "user_id" | "created_at">;

export interface TaskTimeEntry {
  id: string;
  task_id: string;
  started_at: string;
  ended_at: string | null;
}
