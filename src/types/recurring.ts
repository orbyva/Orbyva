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
}

export interface RecurringUpdateRequest extends Partial<RecurringCreateRequest> {
  id: string;
}
