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

export type TaskStatus = "todo" | "doing" | "done";
export type RecurrenceFrequency = "daily" | "weekly" | "monthly";
export type TaskPriority = "low" | "medium" | "high";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  until?: string | null;
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
  tags: string[];
  due_date: string | null;
  start_date?: string | null;
  priority?: TaskPriority | null;
  recurrence_rule: RecurrenceRule | null;
  linked_recurring_id: string | null;
  linked_installment_number: number | null;
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
