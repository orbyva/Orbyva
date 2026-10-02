-- Feature 191: preferências de e-mail de /account não salvavam.
-- `profiles` não tem policy de UPDATE para authenticated (billing fechado de propósito em
-- 20240101000300_billing.sql / 20240101001200_security_hardening.sql), então o update direto do
-- cliente casava zero linhas com error null. Esta RPC devolve a escrita só das quatro colunas de
-- e-mail, do próprio usuário. Parâmetro null = coluna intocada (patch parcial).

create or replace function public.update_email_prefs(
  p_digest boolean default null,
  p_alerts boolean default null,
  p_habit_reminder boolean default null,
  p_unsubscribed boolean default null
)
returns table (
  email_digest_enabled boolean,
  email_alerts_enabled boolean,
  email_habit_reminder_enabled boolean,
  email_unsubscribed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  return query
  update public.profiles p
  set
    email_digest_enabled = coalesce(p_digest, p.email_digest_enabled),
    email_alerts_enabled = coalesce(p_alerts, p.email_alerts_enabled),
    email_habit_reminder_enabled = coalesce(p_habit_reminder, p.email_habit_reminder_enabled),
    email_unsubscribed_at = case
      when p_unsubscribed is null then p.email_unsubscribed_at
      when p_unsubscribed then coalesce(p.email_unsubscribed_at, now())
      else null
    end,
    updated_at = now()
  where p.id = uid
  returning
    p.email_digest_enabled,
    p.email_alerts_enabled,
    p.email_habit_reminder_enabled,
    p.email_unsubscribed_at;

  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_email_prefs(boolean, boolean, boolean, boolean) from public;
grant execute on function public.update_email_prefs(boolean, boolean, boolean, boolean) to authenticated;
