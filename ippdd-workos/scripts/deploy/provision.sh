#!/usr/bin/env bash
# IPPDD WorkOS — production/staging database provisioning (Supabase or any Postgres).
#
#   DATABASE_URL='postgresql://postgres:...@db.<project>.supabase.co:5432/postgres' \
#     bash scripts/deploy/provision.sh
#
# Applies, in order: all migrations → seed.sql (production-safe: real employees,
# no dev personas) → seed_okr.sql (pilot OKR from the authoritative workbook).
# Add --dev to also apply seed_dev.sql (impersonation personas) — NEVER in production.
# Refuses to run against a database that already has the schema (no silent re-apply).
set -euo pipefail
cd "$(dirname "$0")/../.."

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "✕ DATABASE_URL орчны хувьсагч дутуу." >&2
  echo "  Supabase → Settings → Database → Connection string (URI, direct) утгыг өг:" >&2
  echo "  DATABASE_URL='postgresql://postgres:...@db.xxxx.supabase.co:5432/postgres' bash $0" >&2
  exit 2
fi
command -v psql >/dev/null || { echo "✕ psql суулгаагүй байна (postgresql-client)." >&2; exit 2; }

PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q)

echo "== холболт шалгаж байна…"
"${PSQL[@]}" -Atc "select current_database() || ' @ ' || version()" | head -1

if [[ "$("${PSQL[@]}" -Atc "select to_regclass('public.work_items') is not null")" == "t" ]]; then
  echo "✕ Энэ өгөгдлийн санд IPPDD WorkOS-ийн схем аль хэдийн байна — давхар суулгахаас" >&2
  echo "  сэргийлж зогслоо. Цэвэр сан хэрэгтэй бол Supabase дээр шинэ project үүсгэ." >&2
  exit 1
fi

echo "== миграцууд"
for f in supabase/migrations/*.sql; do
  echo "   $f"
  "${PSQL[@]}" -f "$f"
done

echo "== seed (production-safe core)"
"${PSQL[@]}" -f supabase/seed.sql

if [[ "${1:-}" == "--dev" ]]; then
  echo "== seed_dev (DEV personas — production-д ХОРИОТОЙ)"
  "${PSQL[@]}" -f supabase/seed_dev.sql
fi

echo "== seed_okr (пилот OKR — эх сурвалж: IPPDD_OKR_Q3_2026-08-01_v1.0)"
if [[ ! -f supabase/seed_okr.sql ]]; then
  python3 scripts/pilot/gen_seed_okr.py
fi
"${PSQL[@]}" -f supabase/seed_okr.sql

echo
echo "✓ Өгөгдлийн сан бэлэн боллоо."
"${PSQL[@]}" -Atc "select '  ажилтан: ' || count(*) from employees union all
                   select '  зорилт: ' || count(*) from objectives union all
                   select '  KR: ' || count(*) from key_results union all
                   select '  ажил: ' || count(*) from work_items"
echo
echo "Дараагийн алхам (docs/АЖИЛЛУУЛАХ_ЗААВАР.md):"
echo "  1) Supabase → Authentication → Providers → Google: Client ID/Secret оруулах"
echo "  2) Хостинг (Vercel г.м.) дээр .env.example дэх хувьсагчдыг тохируулах"
echo "  3) Ажилтнууд Google-ээр анх нэвтрэхэд эрх нь автоматаар холбогдоно"
