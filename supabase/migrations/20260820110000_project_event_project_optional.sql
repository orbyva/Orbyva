-- Feature 076: `project_event.project_id` passa a aceitar nulo.
--
-- Até aqui todo evento de agenda nascia dentro de um projeto (`ProjectFormDialog`), então
-- `project_id` era `not null`. A 076 introduz o convite de evento: quando alguém aceita um convite,
-- a RPC `accept_event_invite` cria uma **cópia** do evento na conta do convidado — e o convidado não
-- tem (nem deve ter) o projeto do anfitrião. Criar um projeto "Convites" na conta dele foi
-- descartado por poluir a lista de projetos sem ele pedir.
--
-- Nada mais muda: a FK e o `on delete cascade` continuam iguais, e nenhuma linha existente é tocada
-- (`drop not null` afrouxa a restrição, não reescreve dados).

alter table public.project_event
  alter column project_id drop not null;

comment on column public.project_event.project_id is
  'Projeto dono do evento. NULO = evento recebido por convite (feature 076): o convidado tem a '
  'cópia do evento na agenda dele, mas não tem o projeto do anfitrião. A UI usa cor/rótulo neutros '
  'quando é nulo.';
