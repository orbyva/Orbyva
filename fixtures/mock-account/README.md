# Dados mock — conta demo Orbyva

CSVs + seed SQL para popular uma conta nova (prints da landing / demos).
Datas centradas em mai–jul/2026.

## User demo deste seed

`19f584d5-8649-4770-8569-cce62cf74b7f`

## Passo a passo

1. Login nessa conta e deixe o onboarding criar as **dimensões** padrão.
2. **Finanças** → Importar `01-financas.csv`
3. **Cinema** → Importar `02-cinema-letterboxd.csv`
4. Supabase → **SQL Editor** → rode `seed_demo_user.sql` (metas, hábitos, lugares, viagens, veículo)
5. Supabase → **SQL Editor** → rode `seed_budget_recurring.sql` (orçamento jul/2026 + parcelas)
6. Recarregue o app

O SQL de life/car é idempotente para esse `user_id`: apaga e reinsere.
`seed_budget_recurring.sql` também: apaga só `monthly_budget` e `recurring_transaction` desse user.
Não mexe em `transaction` nem `movie`.

## Arquivos

| Arquivo | Uso |
|---------|-----|
| `01-financas.csv` | Import UI |
| `02-cinema-letterboxd.csv` | Import UI |
| `seed_demo_user.sql` | SQL Editor (vida / carro) |
| `seed_budget_recurring.sql` | SQL Editor (orçamento + parcelas) |
| `03`–`10` CSV | Referência (mesmo conteúdo do seed life) |

## Screenshots (Fase F)

1. Hub / Início
2. Finanças (dashboard)
3. **Orçamento** (Julho/2026 — após `seed_budget_recurring.sql`)
4. **Parcelas** (após o mesmo seed)
5. Viagens / Hábitos / Cinema etc.
