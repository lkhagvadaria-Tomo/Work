# Security checklist (§41–42)

## Implemented and tested

- [x] **Authentication**: Google Workspace via Supabase Auth; server-side domain check;
      pre-provisioned employees only; disabled employees rejected at session resolution;
      no password storage of any kind.
- [x] **Authorization**: RLS on **every** application table; role-, ownership- and
      assignment-based policies; helper functions SECURITY DEFINER with pinned
      `search_path`; verified by `npm run test:rls` (no-claims = zero rows; IDOR write
      attempts blocked/no-op; reviewer/approver scope limits; recipient-only notifications).
- [x] **Employee cannot force CLOSED** — UI + RLS + trigger flag + SQL re-verification;
      forged gate-run scenario covered by an integration test.
- [x] **Segregation of duties**: owner ≠ approver (constraint+trigger+policy); owner can't
      sign off own closure; creator can't verify own evidence; validator identity required
      on metric PASS/FAIL.
- [x] **Server-side validation**: zod schemas in every server action; enum/regex/check
      constraints in the DB; UI validation is convenience only.
- [x] **CSRF**: server actions (Next's built-in origin checks) + SameSite=Lax cookies; no
      custom state-changing GET endpoints.
- [x] **Secrets**: `.env` gitignored; `.env.example` placeholders only; secret env vars
      read exclusively in server modules (`import "server-only"`); AI errors never echo
      keys or payloads; audit logs never store secrets.
- [x] **Least-privilege Google scopes**: identity scopes for sign-in;
      `drive.metadata.readonly` only when metadata reads are enabled (docs/GOOGLE_DRIVE.md).
- [x] **Redirect safety**: OAuth redirects only to `NEXT_PUBLIC_APP_URL` paths; login
      errors passed as encoded text, rendered as text (no HTML injection; React escapes).
- [x] **Link validation**: Drive URLs restricted to drive.google.com/docs.google.com;
      external evidence links must be https; enforced in server actions **and** DB checks.
- [x] **Sanitized errors**: users get a generic Mongolian message; raw DB errors stay in
      server logs.
- [x] **IDOR**: all object access resolved through RLS (`can_read_work`/`can_read_kr`);
      direct-id probing returns nothing (tested).
- [x] **Audit trail**: append-only (`UPDATE/DELETE` blocked by trigger for every role);
      all lifecycle actions audited in-transaction.
- [x] **Dev impersonation**: double-gated (`NODE_ENV !== 'production'` **and** `DEV_AUTH=1`),
      HMAC-signed cookie, timing-safe compare.
- [x] **Dependency review**: minimal dependency surface (next/react/tailwind, pg, zod,
      supabase auth libs, lucide); `npm audit` clean at build time.

## Data minimization & AI data flows (§42)

- Stored per person: name, work email, employee code, department, role, manager — nothing
  more. No passwords, no HR data. Documents stay in Drive (references only).
- **What flows to the AI provider** (only when `AI_PROVIDER=anthropic` and the user asks
  the agent): the asker's name/role and their own OKR/work/review/approval/gate rows as
  structured JSON, under RLS — never other employees' confidential rows, never Drive
  document contents, never secrets. With `mock` nothing leaves the server. The agent page
  states this to the user.

## Rate limiting / hardening for production

- Platform-level rate limiting (Vercel/WAF) recommended on `/auth/*` and `/agent`.
- Supabase Auth has built-in OAuth abuse protections; DB connections use the pooled port.
- Add security headers at the platform (CSP/HSTS) during production activation.

## Residual risks (stated, not hidden)

- Drive "changed after approval" detection is **metadata drift**, not content hashing —
  upgrade path documented in docs/GOOGLE_DRIVE.md.
- Local dev database uses plain-password local roles — development only.
- In-app notifications only; no out-of-band alerting yet (§37 future channels).
