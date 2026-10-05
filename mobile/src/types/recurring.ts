import type { Class } from "@/types/dimensions";

export type { Dimension } from "@/types/dimensions";

export interface Installment {
  label: string;
  number: number;
  dueDate: string;
}

export type Installments = Installment[] | string;

export interface Recurring {
  id: string;
  user_id?: string;
  class: Class;
  value: number;
  description: string;
  frequency: string;
  validity: string | null;
  due_day: number | null;
  installment_count: number | null;
  payment_start_date: string | null;
  status: boolean;
  created_at: string;
  paid_parcels: number[];
  installments?: Installments;
  link_url?: string | null;
}

export type DueAlertStatus = "overdue" | "upcoming";

export interface RecurringDueAlert {
  recurring: Recurring;
  status: DueAlertStatus;
  installmentNumber: number;
  dueDate: string;
  daysUntilDue: number;
  message: string;
}

export interface RecurringCreateRequest {
  class_id: number;
  value: number;
  description: string;
  frequency: string;
  validity: string | null;
  due_day: number | null;
  installment_count: number | null;
  payment_start_date: string | null;
  status: boolean;
  /** Obrigatório: o update monta o payload por lista branca, e `null` é "apagou o link". */
  link_url: string | null;
}

export interface RecurringUpdateRequest extends Partial<RecurringCreateRequest> {
  id: string;
}
