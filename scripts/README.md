# Scripts SQL (Supabase)

## Fonte da verdade: `supabase/migrations/`

Os arquivos em `scripts/*.sql` são **espelho** das migrations (para colar no SQL Editor).
Projetos novos: `supabase db push` (ou link + migrate).

Não edite só um lado — altere a migration e copie para `scripts/` (ou o contrário, depois sync).

### Repair (projeto que já rodou SQL no Editor)

1. Marque 001–012 como aplicados (não reexecute):
   ```bash
   supabase migration repair --status applied 20240101000100
   # … repita até 20240101001200
   ```
2. Aplique acesso trial/Pro:
   - `20260723120000_app_access_enforce.sql` (ou `scripts/app_access_enforce.sql`)
   - `20260723130000_app_access_admin_bypass.sql` é **no-op** (bypass já está no enforce)

```bash
supabase db push
# ou cole app_access_enforce.sql no SQL Editor
```

## Ordem (legado SQL Editor)

| # | Arquivo | O que faz |
|---|---------|-----------|
| 1 | `tenancy_rls.sql` | **Obrigatório** — `user_id`, RLS, wipe/delete account |
| 2 | `dimensions_tenancy.sql` | Tipos/classes por usuário |
| 3 | `billing.sql` | `profiles` (teste 7d → Pro) + `waitlist` |
| 4 | `seed_natures.sql` | Naturezas Receita / Despesa |
| 5 | `movies_opinion.sql` | Opinião em `movie` |
| 5b | `movie_episodes.sql` | Episódios de séries |
| 6 | `vehicle_kind.sql` | `kind` em `vehicle` |
| 7 | `fuel_log_transaction.sql` | `transaction_id` em fuel log |
| 8 | `shared_trips.sql` | Viagens compartilhadas |
| 9 | `shared_trips_invite_fix.sql` | Aceite de convite |
| 10 | `trip_activity_author.sql` | Autor da atividade |
| 11 | `security_hardening.sql` | **Obrigatório** — trava billing / convites |
| 12 | **`app_access_enforce.sql`** | **P0** — bloqueia escrita sem trial/Pro |

## Notas

- Sem `tenancy_rls.sql`, o app filtra no cliente, mas o banco ainda pode vazar. Teste com **2 contas**.
- **`app_access_enforce.sql`** é o gate server-side do trial (independente do Stripe).
- Billing Stripe: `billing.sql` + secrets + `VITE_STRIPE_PUBLISHABLE_KEY`. Sem a chave → waitlist; com a chave → teste → Pro.
- Cobrança Live exige Cards Active no Stripe Dashboard.
