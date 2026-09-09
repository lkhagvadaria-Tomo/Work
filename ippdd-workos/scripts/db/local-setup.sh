#!/usr/bin/env bash
# Local development database: creates role + database, applies migrations + seeds.
# Reproducible from scratch (§47). Requires local PostgreSQL and superuser access
# via `su postgres` (Linux default) or a PG* env override.
set -euo pipefail
cd "$(dirname "$0")/../.."

DB_NAME="${WORKOS_DB:-workos}"
DB_USER="${WORKOS_DB_USER:-workos}"
DB_PASS="${WORKOS_DB_PASS:-workos}"

run_sql() { su postgres -c "psql -v ON_ERROR_STOP=1 -q $*"; }

echo "== (re)create database $DB_NAME"
su postgres -c "dropdb --if-exists $DB_NAME && createdb $DB_NAME"
run_sql "-c \"do \\\$\\\$ begin
  if not exists (select from pg_roles where rolname='$DB_USER') then
    create role $DB_USER login password '$DB_PASS';
  end if;
end \\\$\\\$;\""

echo "== migrations"
for f in supabase/migrations/*.sql; do
  echo "   $f"
  run_sql "-d $DB_NAME -f '$PWD/$f'"
done

echo "== app role grants (local login user maps to authenticated)"
run_sql "-d $DB_NAME -c 'grant authenticated to $DB_USER; grant usage on schema public, app to $DB_USER;'"

echo "== service login (mirrors Supabase service connection; RLS bypass for imports/jobs)"
run_sql "-c \"do \\\$\\\$ begin
  if not exists (select from pg_roles where rolname='workos_service') then
    create role workos_service login password 'workos_service' bypassrls;
  end if;
end \\\$\\\$;\""
run_sql "-d $DB_NAME -c 'grant service_role to workos_service; grant usage on schema public, app to workos_service; grant all on all tables in schema public to workos_service; grant usage on all sequences in schema public to workos_service;'"

echo "== seed (core + dev personas + pilot OKR)"
python3 scripts/pilot/gen_seed_okr.py
run_sql "-d $DB_NAME -f '$PWD/supabase/seed.sql'"
run_sql "-d $DB_NAME -f '$PWD/supabase/seed_dev.sql'"
run_sql "-d $DB_NAME -f '$PWD/supabase/seed_okr.sql'"

if [[ ! -f .env.local && "$DB_NAME" == "workos" ]]; then
  cat > .env.local <<ENV
DATABASE_URL=postgres://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME
DEV_AUTH=1
SESSION_SECRET=local-dev-$(head -c16 /dev/urandom | od -An -tx1 | tr -d ' \n')
NEXT_PUBLIC_APP_URL=http://localhost:3000
AI_PROVIDER=mock
ENV
  echo "== .env.local үүсгэлээ (dev тохиргоо)"
fi

echo "== done. DATABASE_URL=postgres://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"
echo "== одоо: npm run dev  →  http://localhost:3000 (persona-аар нэвтэрнэ)"
