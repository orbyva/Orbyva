export type GoalCategory =
  | "financial"
  | "health"
  | "learning"
  | "fitness"
  | "other";

export type GoalStatus = "active" | "completed" | "cancelled";

export interface PersonalGoal {
  id: string;
  user_id?: string;
  title: string;
  description?: string | null;
  category: GoalCategory;
  target_value: number;
  current_value: number;
  unit?: string | null;
  deadline?: string | null;
  status: GoalStatus;
  created_at?: string;
  updated_at?: string;
}

export type PersonalGoalCreateRequest = Omit<
  PersonalGoal,
  "id" | "user_id" | "created_at" | "updated_at"
>;

export type PersonalGoalUpdateRequest = Partial<PersonalGoalCreateRequest> & {
  id: string;
};
