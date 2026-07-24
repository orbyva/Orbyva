-- =============================================================================
-- Orbyva — no-op (histórico)
-- O bypass de admin (postgres / supabase_admin / service_role) já está em
-- 20260723120000_app_access_enforce.sql via is_db_admin() + has_app_access().
-- Esta migration existia como cópia idêntica; mantida só para o histórico de
-- timestamps não quebrar `supabase migration repair` / `db push`.
-- =============================================================================

select 1;
