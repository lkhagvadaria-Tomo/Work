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
2. **One command** (recommended): with the project's direct connection string,
   `DATABASE_URL='postgresql://postgres:…@db.<project>.supabase.co:5432/postgres' npm run deploy:db`
   — applies all migrations, the production-safe `seed.sql` (real employees only,
   `auth_user_id = null`, no dev personas) and the pilot OKR (`seed_okr.sql`), and refuses
   to run twice against the same database. `supabase/seed_dev.sql` (impersonation
   personas) is development-only and is **not** applied unless you pass `--dev`.
   Manual alternative: run the same files in order via the SQL editor / `psql`.
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
