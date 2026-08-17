-- Add estimated_duration column to task table
-- Stores estimated time in minutes (nullable)

alter table public.task
  add column if not exists estimated_duration integer;

comment on column public.task.estimated_duration is
  'Estimated time to complete the task in minutes';
