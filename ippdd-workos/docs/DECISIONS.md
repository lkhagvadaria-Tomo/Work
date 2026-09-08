# IPPDD WorkOS — DECISION LOG

Format: Decision / Reason / Alternatives / Tradeoff / Date.

---

## D-001 — Supabase (PostgreSQL) as the system of record
- **Decision:** PostgreSQL is the system of record; production database hosted on Supabase.
- **Reason:** Master prompt preference; managed Postgres + Auth + RLS; SQL migrations under
  version control keep the schema portable to enterprise infrastructure / Cloud SQL later.
- **Alternatives:** Firebase (weaker relational integrity), self-hosted Postgres from day 1
  (more ops burden for a pilot).
- **Tradeoff:** Supabase-specific auth glue is isolated in `lib/auth` so the DB layer stays
  plain Postgres.
- **Date:** 2026-09-08

## D-002 — Direct Postgres access (`pg`) with per-request RLS, instead of PostgREST
- **Decision:** All server-side data access goes through node-postgres (`pg`). Every
  request-scoped query runs inside a transaction as role `authenticated` with
  `request.jwt.claims` set to the session user's claims, so **RLS policies are enforced
  exactly as Supabase enforces them**. `supabase-js` is used only for Auth (OAuth flows).
- **Reason:** (1) One data path that works identically against local PostgreSQL 16 and
  Supabase's Postgres (connection string), enabling real integration/RLS/E2E tests in
  environments without Supabase credentials. (2) Complex governance queries (gate
  snapshots, dashboards) are cleaner in SQL than via PostgREST chains. (3) No N+1.
- **Alternatives:** supabase-js/PostgREST for data (cannot run locally without the full
  Supabase stack/Docker); an ORM like Prisma (RLS + `SET LOCAL ROLE` interplay is fragile).
- **Tradeoff:** We manage SQL by hand; mitigated with typed query helpers and tests.
- **Date:** 2026-09-08

## D-003 — Google Workspace sign-in via Supabase Auth; no local passwords
- **Decision:** Production sign-in is "Sign in with Google" via Supabase Auth with the
  Netcapital Workspace domain restriction (`hd` claim verified server-side as well).
  No password storage of any kind.
- **Reason:** Master prompt requirement; least surface area.
- **Alternatives:** NextAuth (second auth store to reconcile with Supabase RLS identities).
- **Tradeoff:** Requires Supabase project + Google OAuth Client configuration (documented
  in docs/GOOGLE_DRIVE.md and docs/DEPLOYMENT.md as external admin actions).
- **Date:** 2026-09-08

## D-004 — Gated dev impersonation for local development and E2E
- **Decision:** When `NODE_ENV !== 'production'` **and** `DEV_AUTH=1`, a persona picker
  signs a server-side HMAC cookie for one of the seeded dev personas. The module throws at
  import time in production builds; the login route also 404s unless both conditions hold.
- **Reason:** Master prompt §50 allows explicit dev impersonation; enables real E2E of the
  full governance flow without Google credentials.
- **Alternatives:** Mock auth in tests only (leaves the running dev app unusable);
  committing Supabase test tokens (unsafe).
- **Tradeoff:** One more auth path; contained in `lib/auth/dev.ts` with production guards.
- **Date:** 2026-09-08

## D-005 — Employees cannot set CLOSED; closure is a server-side gate + human sign-off
- **Decision:** `CLOSED` is reachable only through `SUBMIT FOR CLOSURE` → deterministic
  Gate Engine run → required human sign-off. Enforced in three layers: UI (no action),
  RLS (`WITH CHECK status <> 'CLOSED'` on user updates), and a DB trigger that rejects any
  transition to CLOSED unless the transaction-local flag set by the SECURITY DEFINER
  closure function is present.
- **Reason:** Core governance principle: RULE GATE PASS + HUMAN SIGN-OFF = CLOSED.
- **Alternatives:** App-layer checks only (bypassable via direct DB/API access).
- **Tradeoff:** Slightly more SQL machinery; worth it for non-bypassability.
- **Date:** 2026-09-08

## D-006 — Review and Approval are separate objects and separate gates
- **Decision:** `reviews` (G3) and `approvals` (G4) are distinct tables with distinct
  queues, decisions and RLS. Approval records reference the exact deliverable version.
- **Reason:** DELIVERED ≠ REVIEWED ≠ APPROVED is the core business problem.
- **Date:** 2026-09-08

## D-007 — AI is advisory only (abstraction layer, no authority)
- **Decision:** `lib/ai` defines a provider-agnostic interface (`AiProvider`) with
  Anthropic and Mock implementations selected by env. The agent answers only from
  structured system data passed to it; it has no write path to reviews, approvals, gate
  runs or closures. The deterministic Gate Engine (`lib/gate-engine`) has no AI dependency.
- **Reason:** AI authority boundary (§20); provider portability (§4).
- **Date:** 2026-09-08

## D-008 — Google Drive stays the document source of truth
- **Decision:** The app stores Drive file references + governance metadata
  (`drive_file_id`, name, mime type, modified time, version label), never document bodies.
  Drive metadata is fetched server-side with least-privilege scopes; a metadata snapshot at
  approval time lets the system flag "APPROVED VERSION MAY HAVE CHANGED" (modifiedTime
  drift). This is drift detection, not cryptographic integrity — stated in the UI.
- **Reason:** §12–14; data minimization (§42).
- **Date:** 2026-09-08

## D-009 — Enums in Postgres for closed vocabularies, config tables for open ones
- **Decision:** Statuses/decisions/severities are Postgres enums; work-type closure
  behavior lives in a `closure_profiles` table and `gate_rules` rows so admins change
  governance without code changes.
- **Reason:** §8 (prevent impossible states) + §16/§34 (configurable behavior).
- **Date:** 2026-09-08

## D-010 — Hand-rolled minimal UI kit instead of full shadcn/ui install
- **Decision:** A small set of accessible, Tailwind-based components in `components/ui`
  (Button, Badge, Card, Table, Dialog, Input, Select, Tabs, EmptyState…), same design
  language as shadcn/ui.
- **Reason:** The master prompt allows "shadcn/ui **or equivalent**"; avoids a large
  generated dependency surface for an internal tool and keeps the bundle small.
- **Tradeoff:** Fewer ready-made widgets; acceptable for the module set we ship.
- **Date:** 2026-09-08

## D-011 — Pilot dataset imported from the authoritative workbook
- **Decision:** LA's Q3 OKR was extracted directly from the Drive workbook
  `IPPDD_OKR_Q3_2026-08-01_v1.0` into `scripts/pilot/la_okr_2026Q3.json` (3 objectives
  40/40/20, 10 KRs with weights/deadlines/measurement text). Seed + importer read this
  file; nothing was invented.
- **Reason:** §36 — workbook is authoritative over the prompt summary.
- **Date:** 2026-09-08
