#!/usr/bin/env bash
# Valida `supabase/migrations/20260820100000_task_dedupe_doses_e_ocorrencias.sql` (feature 074) num
# Postgres 16 descartável em Docker — sem tocar no banco remoto.
#
# É a migration mais perigosa do repo até aqui: ela **apaga linha**. Por isso o roteiro é o mesmo
# que a tarefa "Aguarda o usuário" manda executar contra o banco real (anotar o antes, aplicar,
# comparar o depois), só que automatizado e contra um banco de mentira:
#   00_stubs        schema como 064/070/071 o deixam (medication, task.medication_id/dose_time/
#                   is_quick, RLS, trigger do gate Pro)
#   01_seed         dose duplicada com uma concluída, dose duplicada só com pendentes, ocorrência
#                   duplicada, parcelas de Recorrência Financeira no mesmo dia, dose de outro
#                   usuário, doses sem dose_time e tarefas avulsas homônimas
#   02_snapshot_pre grava `pre_counts`/`pre_intocaveis`, valida o seed e prova (controle negativo)
#                   que sem a limpeza o `create unique index` FALHA
#   migration       primeira aplicação
#   03_assert       sobrou uma linha por chave, a concluída é a que sobrou, nada mais foi tocado,
#                   nenhuma linha com completed_at sumiu, RLS/políticas/trigger de pé
#   04_assert_const o que os índices passam a barrar e o que continuam permitindo — inclusive a
#                   prova de que `on conflict (colunas)` NÃO infere índice parcial, que é o motivo
#                   de `taskRows.ts` chamar `upsert` sem `onConflict`
#   05_snapshot_post congela o estado pós-primeira-aplicação
#   migration       segunda aplicação (o `supabase db push` pode ser repetido)
#   03_assert       as mesmas assertivas continuam valendo
#   06_assert_idem  diff linha a linha contra `post_1`: reaplicar não apagou mais nada
#
# Depois disso, um **controle negativo de banco inteiro**: um segundo container com stubs + seed e
# SEM a migration, onde `03_assert` tem de FALHAR. Sem ele, um arquivo de assertivas que não
# assertasse nada passaria despercebido.
#
# Uso: bash supabase/tests/task_dedupe_doses/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION="$HERE/../../migrations/20260820100000_task_dedupe_doses_e_ocorrencias.sql"
CONTAINER=orbyva-task-dedupe-doses-pg
CONTROL=orbyva-task-dedupe-doses-control-pg

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker rm -f "$CONTROL" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

start_pg() {
  local name="$1"
  docker run -d --name "$name" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=orbyva postgres:16 >/dev/null
  # `pg_isready` sozinho não serve: durante o bootstrap o initdb sobe um servidor temporário que já
  # responde, mas ainda não criou o banco `orbyva` — esperar por uma query de verdade evita a corrida.
  local ready=""
  for _ in $(seq 1 90); do
    if docker exec "$name" psql -U postgres -d orbyva -tAc 'select 1' >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [ -z "$ready" ]; then
    echo "FALHOU: Postgres ($name) não ficou pronto a tempo" >&2
    exit 1
  fi
}

WORK="$(mktemp -d)"
cp "$HERE"/*.sql "$WORK/"
cp "$MIGRATION" "$WORK/10_migration.sql"

start_pg "$CONTAINER"
docker cp "$WORK" "$CONTAINER:/sql" >/dev/null

docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/00_stubs.sql \
  -f /sql/01_seed.sql \
  -f /sql/02_snapshot_pre.sql \
  -f /sql/10_migration.sql \
  -f /sql/03_assert_dedupe.sql \
  -f /sql/04_assert_constraints.sql \
  -f /sql/05_snapshot_post.sql \
  -f /sql/10_migration.sql `# reaplicação: tem que ser idempotente` \
  -f /sql/03_assert_dedupe.sql \
  -f /sql/06_assert_idempotente.sql

# ---- controle negativo: sem a migration, as assertivas têm de acusar --------------------------
start_pg "$CONTROL"
docker cp "$WORK" "$CONTROL:/sql" >/dev/null

if docker exec "$CONTROL" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/00_stubs.sql \
  -f /sql/01_seed.sql \
  -f /sql/02_snapshot_pre.sql \
  -f /sql/03_assert_dedupe.sql >/dev/null 2>&1
then
  echo "FALHOU: as assertivas passaram num banco SEM a migration — elas não estão provando nada" >&2
  exit 1
fi

echo "OK: 20260820100000_task_dedupe_doses_e_ocorrencias.sql validada em Postgres 16 (com controle negativo)."
