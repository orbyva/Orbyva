-- Drop project.notes column (legacy from 055, replaced by notes module)
-- This column was kept as safety net during migration; user confirmed all project notes
-- are intact in the new notes module (kind='markdown' with project_id set).

alter table public.project drop column if exists notes;