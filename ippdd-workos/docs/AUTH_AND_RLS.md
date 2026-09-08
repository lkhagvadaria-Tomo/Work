# Authentication & Row Level Security

## Authentication

### Production — "Sign in with Google" (Supabase Auth)
1. `/login` → `googleLogin()` server action → Supabase OAuth (provider `google`,
   `hd=<GOOGLE_WORKSPACE_DOMAIN>` hint, `prompt=select_account`).
2. `/auth/callback` exchanges the code server-side, then calls `linkEmployee()`:
   - the email **must** belong to a pre-provisioned, **active** `employees` row
     (admin provisions people first — no self-registration);
   - the Workspace domain is re-verified server-side (the `hd` hint alone is not trusted);
   - `app.link_employee()` (SECURITY DEFINER, service-only grant) binds `auth_user_id`
     once; a second Google account with the same email is rejected.
3. Unknown/disabled accounts are signed out and routed to `/unauthorized`.
4. Session cookies are managed by `@supabase/ssr` (httpOnly, server-validated with
   `auth.getUser()` — never trusting the raw cookie contents).

No local passwords exist anywhere in the system.

### Development — gated impersonation (D-004)
`NODE_ENV !== 'production'` **and** `DEV_AUTH=1` enables a persona picker for the seeded
dev users. The cookie is HMAC-signed (`SESSION_SECRET`), 12h expiry, and every verifier
re-checks `devAuthEnabled()` — the path is dead code in production builds.

### Route protection
`proxy.ts` redirects cookie-less requests to `/login` (UX only). Real enforcement:
`requireSession()` in every authenticated layout/page/action + RLS below.

## How RLS is enforced

`lib/db.withUser(authUid, fn)` wraps every request-scoped query:

```sql
begin;
select set_config('request.jwt.claims', '{"sub":"<auth uid>","role":"authenticated"}', true);
set local role authenticated;
-- application queries here — RLS applies
commit;
```

This is exactly how Supabase's PostgREST evaluates policies, so behavior is identical on
local PostgreSQL and Supabase. Helper functions (schema `app`) resolve the caller:
`current_employee_id()`, `current_system_role()`, `is_admin()`, `manages(emp)` (manager
chain ≤4), `directs_department(dept)`, `can_read_work(id)`, `can_read_kr(id)`.

## Policy matrix (summary — source: `00000000000004_rls.sql`)

| Table | EMPLOYEE (owner) | REVIEWER (assigned) | APPROVER (assigned) | MANAGER (chain) | DIRECTOR (dept) | ADMIN |
|---|---|---|---|---|---|---|
| employees/departments/quarters | read | read | read | read | read | read + write |
| objectives / key_results | own read; KR progress update (never CLOSED) | read via assigned work | read via assigned work | subordinate read | dept read + write | all |
| work_items | own CRUD (status guarded; never CLOSED) | read + workflow updates on assigned | read + workflow updates on assigned | subordinate | dept | all |
| deliverables / requirements / evidence | own work; evidence never born verified; delete only own unverified | read; verify via `app.verify_evidence` | read; verify | read | read | all |
| reviews | create requests; SELF_QC on own work | decide **only own PENDING** | read | read | read | all |
| approvals | request (never to self) | read | decide **only own PENDING** | read | read | all |
| gate_runs / findings | create for readable scopes (run_by = self); read | read | read | read | read | all |
| closure_requests | create for own scopes; never APPROVE/REJECT directly | read | sign-off via definer fn | read | sign-off via definer fn | all |
| audit_logs | insert as self; read own/entity-scoped | entity-scoped | entity-scoped | — | read all | read all; **no update/delete for anyone** |
| notifications | strictly `recipient_id = me` | same | same | same | same | same |

Segregation of duties, enforced below the UI:
- owner ≠ approver (check constraint + trigger + insert policy);
- owner cannot sign off own closure (work, KR, quarter) — definer functions;
- evidence creator cannot verify own evidence — `app.verify_evidence`;
- metric PASS/FAIL must carry the validator's own identity — RLS `with check`.

## Tests

`npm run test:rls` runs the matrix against a real database (`tests/rls/rls.test.ts`):
no-claims sees nothing; unrelated same-department employee sees nothing and cannot write
(IDOR); reviewer/director scopes; forced-closure attempts fail for every role; audit
append-only; notifications recipient-only; config admin-write.
