# Deployment

## Environments

| Env | App | Database | Auth |
|---|---|---|---|
| local | `next dev` | local PostgreSQL (`npm run db:setup`) | dev personas (DEV_AUTH=1) |
| staging | Vercel preview / Node host | Supabase project (staging) | Supabase Auth Google |
| production | Vercel / approved enterprise infra | Supabase project (prod) | Supabase Auth Google, Workspace-restricted |

The app is portable: only `DATABASE_URL` + Supabase Auth env vars differ per environment.

## Supabase setup (exact steps)

1. Create a Supabase project (region close to users).
2. Apply migrations, in order, to the project database — either
   `supabase db push` with the Supabase CLI linked to this repo, or run each file in
   `supabase/migrations/` via the SQL editor / `psql "$SUPABASE_DB_URL"`.
   `00000000000000_roles.sql` is a no-op there (roles already exist).
3. Seed: run `supabase/seed.sql`, then generate + run the pilot OKR seed
   (`python3 scripts/pilot/gen_seed_okr.py` → `supabase/seed_okr.sql`) **or** import via
   `scripts/import-okr.ts` with the service connection string.
   ⚠ Production employees: keep only real people; the `WorkOS Admin (dev)` persona row and
   dev `auth_user_id` UUIDs are for development — remove/replace them in production
   (`update employees set auth_user_id = null where employee_code = 'DEV_ADMIN'; delete …`).
4. Authentication → Providers → Google: Client ID/Secret from the Workspace admin
   (docs/GOOGLE_DRIVE.md); redirect URL is preconfigured by Supabase.
5. Authentication → URL configuration: site URL = production `NEXT_PUBLIC_APP_URL`,
   additional redirect `https://<app>/auth/callback`.
6. Copy connection string (Settings → Database, use the pooled connection for serverless)
   into `DATABASE_URL`.

## Application deploy (Vercel example)

1. Import the repo, set root directory to `ippdd-workos/`.
2. Environment variables (Settings → Environment Variables):

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | public | `https://workos.<domain>` |
| `NEXT_PUBLIC_SUPABASE_URL` | public | project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | publishable (anon) key |
| `SUPABASE_SECRET_KEY` | **server-only** | used only for first-login employee linking |
| `DATABASE_URL` | **server-only** | Supabase pooled Postgres connection string |
| `GOOGLE_WORKSPACE_DOMAIN` | server | `netgroup.mn` |
| `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` | server-only | `mock` needs no key |
| `SESSION_SECRET` | server-only | long random string |
| `DEV_AUTH` | — | **never set in production** (hard-disabled anyway) |

3. Build command `npm run build` (defaults). Deploy.
4. Smoke check: `/login` shows the Google button; an unprovisioned Google account lands on
   `/unauthorized`; a provisioned one reaches the dashboard.

## Production activation checklist (external, admin-controlled)

- [ ] Google OAuth Client created; Supabase Google provider configured
- [ ] Supabase project provisioned; migrations + seeds applied; dev personas removed
- [ ] Production domain + `NEXT_PUBLIC_APP_URL` set; HTTPS enforced by the platform
- [ ] Real employee roster provisioned (Admin → Ажилтнууд or `upsertEmployee`)
- [ ] AI provider decision (keep `mock` until a data-flow review approves an external provider — see docs/SECURITY_CHECKLIST.md)
- [ ] Backup/recovery reviewed (docs/OPERATIONS.md)

Until these are done the correct status wording is
**CODE COMPLETE — EXTERNAL CONFIGURATION REQUIRED**, never "production ready".
