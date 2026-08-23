export type ProjectStatus = "planned" | "active" | "completed" | "archived";

export interface Project {
  id: string;
  user_id?: string;
  name: string;
  description?: string | null;
  color?: string | null;
  /**
   * `project.notes` NÃO está mais aqui de propósito (feature 055): as notas de projeto viraram o
   * módulo de Notas (`src/types/notes.ts`), e nenhum código lê ou escreve a coluna. Ela continua
   * existindo no banco, com o conteúdo original, como rede de segurança até o usuário confirmar a
   * migração — o `drop column` é a última tarefa da 058.
   */
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
  /**
   * Nulo = evento recebido por convite (feature 076): o convidado tem a cópia do evento na agenda
   * dele, mas não tem o projeto do anfitrião. A agenda usa cor/rótulo neutros nesse caso.
   */
  project_id: string | null;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  created_at?: string;
}

export type ProjectEventCreateRequest = Omit<
  ProjectEvent,
  "id" | "user_id" | "created_at"
>;

/** Convite de evento (feature 076) — espelha `public.event_invite`. */
export type EventInviteStatus = "pending" | "accepted" | "revoked" | "expired";

export interface EventInvite {
  id: string;
  event_id: string;
  /** Nulo = convite "só link": quem tiver o token aceita. */
  email: string | null;
  token: string;
  created_by: string;
  status: EventInviteStatus;
  expires_at: string;
  accepted_by?: string | null;
  /** `project_event` criado na conta do convidado ao aceitar. */
  accepted_event_id?: string | null;
  email_sent_at?: string | null;
  created_at?: string;
}

export type EventInviteCreateRequest = {
  event_id: string;
  email?: string | null;
};

/**
 * O que `get_event_invite_by_token` devolve para o convidado: o estado do convite mais o mínimo do
 * evento para ele decidir. Nada do anfitrião (e-mail, nome, projeto) atravessa — ver a migration
 * `20260820130000_event_invite_rpcs.sql`.
 */
export type EventInvitePreview = Pick<
  EventInvite,
  "id" | "event_id" | "token" | "email" | "status" | "expires_at" | "created_at"
> & {
  accepted_by?: string | null;
  accepted_event_id?: string | null;
  event_title: string | null;
  event_starts_at: string | null;
  event_ends_at: string | null;
  /** `true` quando quem está lendo é o próprio convidado que já aceitou. */
  accepted_by_me: boolean;
};

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
  /** Tarefa pontual (feature 070): um instante sem duração — trocar lençol, trocar escova, tomar
   * remédio. A agenda a desenha como bolinha marcável (`QuickTaskDot`) no horário, em vez de um
   * bloco com altura sintética. Mutuamente exclusiva com `estimated_duration` na UI (ligar a flag
   * zera a duração), e ortogonal às demais: uma dose de medicação é `is_medication` **e**
   * `is_quick` (feature 071). */
  is_quick?: boolean;
  /** Marca a tarefa (e a série materializada a partir dela) como uma medicação (feature 049) —
   * usado pra exibir o histórico de doses tomadas no dialog "Ocorrências de...". */
  is_medication?: boolean;
  /** Marca a tarefa (e a série materializada a partir dela) como uma consulta médica (feature 061)
   * — o especialista vai no `title` ("Cardiologista — Dr. Silva"), local/preparo na `description`.
   * Usado pra renderizar o item com ícone de estetoscópio no calendário geral e pra exibir
   * "Compareceu às" (a partir de `completed_at`) no dialog "Ocorrências de...". */
  is_consultation?: boolean;
  /** Tratamento (`medication`) do qual esta tarefa é uma **dose** (feature 064) — mesmo padrão de
   * `linked_recurring_id`: entidade de domínio de um lado, tarefas materializadas do outro.
   * Séries com esta coluna preenchida são puladas por `materializeRecurringInstances`; quem gera
   * as doses é `materializeMedicationDoses` (`src/api/health/medications.ts`), e os dois caminhos
   * juntos duplicariam doses no calendário. */
  medication_id?: string | null;
  /** Qual dos `medication.times` esta dose representa (`HH:MM` ou `HH:MM:SS` — o Postgres devolve
   * com segundos). Junto com `due_date` é a chave que impede materializar a mesma dose duas vezes;
   * é por isso que uma medicação de 08:00 e 20:00 gera duas tarefas no mesmo dia. */
  dose_time?: string | null;
  /** Ordem manual dentro da faixa de prioridade do painel "Por prioridade" do quadrante de projeto
   * (feature 082). Asc, com o comparador da tela (feature 079) como desempate — toda tarefa nasce
   * em `0`, então sem o desempate a faixa inteira ficaria em ordem indefinida. Só o arraste
   * escreve aqui: a Lista em caixas, o Kanban e o painel "Por prazo" ignoram esta coluna de
   * propósito (ordem manual global seria pedido novo). */
  sort_order?: number;
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
