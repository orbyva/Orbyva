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
  /** URL livre da recorrência (ex.: onde se faz o pagamento). Opcional no tipo porque há selects
   * que seguem sem a coluna (`supabase/functions/home-bundle/index.ts`,
   * `_shared/orb/tools/timeline.ts`). */
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
  /** Obrigatório, não opcional: `updateRecurringApi` monta o payload por lista branca, então campo
   * ausente tornaria "apagou o link" indistinguível de "não mandou". */
  link_url: string | null;
}

export interface RecurringUpdateRequest extends Partial<RecurringCreateRequest> {
  id: string;
}
