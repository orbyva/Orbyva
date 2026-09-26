#!/usr/bin/env bash
# Valida as duas migrations da feature 064 — `20260816230000_medication.sql` e
# `20260816233000_medication_backfill.sql` — num Postgres 16 descartável em Docker, sem tocar no
# banco remoto.
#
# Esta é a única feature do sub-módulo que **escreve em dado existente**: o backfill converte as
# medicações da 049 (task com `is_medication` + `recurrence_rule`) em linhas de `medication`. Um
# backfill que roda duas vezes e duplica é um bug caro e irreversível, então a idempotência aqui é
# **provada**, não presumida: a migration de backfill é aplicada duas vezes e as mesmas assertivas
# absolutas de `04_assert_backfill.sql` têm de valer nas duas passagens. Os controles negativos 10
# e 11 fecham o argumento, mostrando que essas assertivas de fato acusam uma duplicata e que é o
# guard `medication_id is null` que segura a segunda execução.
#
# Uso: bash supabase/tests/medication/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEDICATION_MIGRATION="$HERE/../../migrations/20260816230000_medication.sql"
BACKFILL_MIGRATION="$HERE/../../migrations/20260816233000_medication_backfill.sql"
CONTAINER=orbyva-medication-pg

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=orbyva postgres:16 >/dev/null

# `pg_isready` sozinho não serve: durante o bootstrap o initdb sobe um servidor temporário que já
# responde, mas ainda não criou o banco `orbyva` — esperar por uma query de verdade evita a corrida.
ready=""
for _ in $(seq 1 90); do
  if docker exec "$CONTAINER" psql -U postgres -d orbyva -tAc 'select 1' >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ -z "$ready" ]; then
  echo "FALHOU: Postgres não ficou pronto a tempo" >&2
  exit 1
fi

WORK="$(mktemp -d)"
cp "$HERE"/*.sql "$WORK/"
cp "$MEDICATION_MIGRATION" "$WORK/10_medication_migration.sql"
cp "$BACKFILL_MIGRATION" "$WORK/11_backfill_migration.sql"
docker cp "$WORK" "$CONTAINER:/sql" >/dev/null

# Ordem: stubs + o dado da 049, a migration de schema, as assertivas, a reaplicação (tem que ser
# idempotente), o backfill, as assertivas do backfill, **o backfill de novo** e as mesmas
# assertivas (prova de idempotência), os controles negativos e por fim as de RLS.
# 05_assert_rls fica no fim de tudo porque termina apagando um usuário de `auth.users`.
# 06_assert_diagnostico (feature 096) vem depois dele: prova que as quatro consultas do roteiro de
# diagnóstico discriminam H1–H4, e para isso semeia quatro tratamentos próprios — que quebrariam as
# contagens absolutas de `public.medication` do 05 se entrassem antes.
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/00_stubs.sql \
  -f /sql/01_seed.sql \
  -f /sql/10_medication_migration.sql \
  -f /sql/02_assert_schema.sql \
  -f /sql/10_medication_migration.sql `# reaplicação: tem que ser idempotente` \
  -f /sql/02_assert_schema.sql \
  -f /sql/11_backfill_migration.sql \
  -f /sql/04_assert_backfill.sql \
  -f /sql/11_backfill_migration.sql `# SEGUNDA aplicação do backfill: não pode duplicar nada` \
  -f /sql/04_assert_backfill.sql `# mesmas contagens absolutas: é a prova de idempotência` \
  -f /sql/03_negative_controls.sql \
  -f /sql/05_assert_rls.sql \
  -f /sql/06_assert_diagnostico.sql

echo "OK: 20260816230000_medication.sql e 20260816233000_medication_backfill.sql validadas em Postgres 16 (backfill aplicado 2x sem duplicar)."
echo "OK: as quatro consultas do roteiro de diagnóstico da 096 discriminam as hipóteses H1-H4."
