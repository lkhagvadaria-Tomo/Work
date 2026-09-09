# IPPDD WorkOS

**OKR, Work, Evidence, Approval & Governance Execution System** — Netcapital Financial
Group, Investment Product & Process Development Department (IPPDD). Pilot: А.Лхагвадарь,
2026 Q3; architected for multi-employee / multi-department / multi-quarter rollout.

Core governance model:

> **DELIVERED ≠ REVIEWED ≠ APPROVED ≠ IMPLEMENTED ≠ KR ACHIEVED ≠ CLOSED**
>
> Employees never set `CLOSED`. They **SUBMIT FOR CLOSURE**; the deterministic Gate
> Engine (G1–G7) evaluates deliverables, self-QC, reviews, approvals, implementation,
> metric validation, evidence and open critical findings; then an authorized human signs
> off. `RULE GATE PASS + HUMAN SIGN-OFF = CLOSED` — enforced in the UI, in RLS, **and** in
> database triggers + SECURITY DEFINER functions, so no API path can bypass it.

## Stack

- **Next.js 16** (App Router, Server Components/Actions), **TypeScript strict**, **Tailwind 4**
- **PostgreSQL** (Supabase in production) — version-controlled SQL migrations, full **RLS**
- **Supabase Auth** for "Sign in with Google" (Workspace domain restricted); no passwords
- **Google Drive** stays the document source of truth — the app stores references + metadata
- **AI abstraction layer** (`lib/ai`): mock / Anthropic providers; agent is advisory-only
- Tests: **Vitest** (unit, integration, RLS) + **Playwright** (E2E)

See `docs/` for architecture, data model, auth/RLS, gate engine, Drive integration,
workflow, deployment, operations and the security checklist. Decision log:
`docs/DECISIONS.md`. Build status: `docs/BUILD_STATUS.md`.

## Prerequisites

- Node.js ≥ 20 (developed on 22)
- PostgreSQL ≥ 15 running locally (or a Supabase project)
- Playwright Chromium for E2E (preinstalled in the dev container; else `npx playwright install chromium`)

## Local setup (clone → running app)

```bash
npm install
npm run setup   # DB + migrations + seeds (pilot OKR from the authoritative workbook)
                # and auto-creates .env.local for development
npm run dev     # http://localhost:3000 — log in with a dev persona
```

Монгол хэл дээрх идэвхжүүлэлтийн бүрэн заавар (локал демо + production):
**`docs/АЖИЛЛУУЛАХ_ЗААВАР.md`**. Production database provisioning is one command:
`DATABASE_URL='postgresql://…supabase.co…' npm run deploy:db` — applies migrations +
production-safe seed (no dev personas; `supabase/seed_dev.sql` is development-only).

Dev personas (development only, hard-disabled in production builds):
`А.Лхагвадарь (пилот ажилтан)`, `Б.Онон (хянагч)`, `О.Мөнх-Эрдэнэ (захирал)`, `WorkOS Admin`.

## Tests & quality gates

```bash
npm run lint             # ESLint
npm run typecheck        # tsc --noEmit (strict)
npm test                 # unit: gate engine, state machine, OKR calc, next actions
npm run test:integration # lifecycle against real Postgres (workos_test)
npm run test:rls         # RLS policy matrix against real Postgres
npm run test:e2e         # Playwright: full closure flow + gate-FAIL negative path
npm run build            # production build
```

Integration/RLS/E2E provision a dedicated `workos_test` / reset the local DB via
`scripts/db/local-setup.sh` — nothing runs against production data.

## OKR import (§workbook)

```bash
# dry run (preview + weight validation, no writes)
npx tsx scripts/import-okr.ts --file scripts/pilot/la_okr_2026Q3.json \
  --email lkhagvadari.a@netgroup.mn --quarter 2026-Q3

# apply (service connection; duplicates are rejected, never overwritten)
DATABASE_URL=postgres://workos_service:workos_service@localhost:5432/workos \
  npx tsx scripts/import-okr.ts --file <workbook.xlsx|.json> --email <email> --quarter 2026-Q3 --apply
```

## Production configuration

Google OAuth + Supabase setup, deployment steps and required secrets are documented in
`docs/DEPLOYMENT.md` and `docs/GOOGLE_DRIVE.md`. `.env.example` lists every variable and
whether it is public-safe or server-only. **Never commit real values.**
