export type AgentRole = "user" | "assistant" | "system";

export interface AgentMessage {
  role: AgentRole;
  content: string;
}

export interface AgentPendingActionField {
  label: string;
  value: string;
}

export interface AgentPendingAction {
  id: string;
  actionType: "create_transaction" | "create_recurring";
  summary: string;
  fields: AgentPendingActionField[];
  expiresAt: string;
}

export interface AgentChatRequest {
  messages: AgentMessage[];
  confirmActionId?: string;
  cancelActionId?: string;
}

export interface AgentChatResponse {
  message: string;
  pendingAction?: AgentPendingAction;
  suggestedQuestions?: string[];
  insights?: string[];
}

export interface MonthlySummary {
  year: number;
  month: number;
  income: number;
  expense: number;
  balance: number;
}

export interface CategorySpending {
  typeName: string;
  className: string;
  nature: string;
  total: number;
  transactionCount: number;
}

export interface CategoryTrend {
  category: string;
  currentMonth: number;
  previousMonth: number;
  changePercent: number;
}

export interface UnusualExpense {
  id: number;
  description: string;
  value: number;
  transactionAt: string;
  category: string;
  reason: string;
}

export interface BudgetStatusItem {
  typeName: string;
  className: string | null;
  planned: number;
  spent: number;
  remaining: number;
  percentageUsed: number;
  status: string;
}

export interface TransactionRow {
  id: number;
  value: number;
  description: string;
  transaction_at: string;
  class_id: number;
  class?: {
    name: string;
    type?: {
      name: string;
      nature?: { name: string };
    };
  };
}

export interface DimensionRow {
  id: number;
  name: string;
  types: Array<{
    id: number;
    name: string;
    classes: Array<{ id: number; name: string }>;
  }>;
}
