# Operations

## Logging & observability (§54)

- Server actions catch failures, log server-side via Next's server console (route,
  message; no secrets/token/document contents), and show the user a sanitized Mongolian
  message on `/error?m=…` — never raw DB exceptions.
- Every governance action writes `audit_logs` (actor, entity, action, old/new values,
  optional request id) in the same transaction — this is the operational truth for
  "who did what when".
- Adding APM/error monitoring later: wrap `withUser`/actions with the vendor SDK; no
  architectural change required.

## Backup & recovery

- **Supabase**: enable Point-in-Time Recovery (paid tier) or rely on daily backups;
  additionally schedule `pg_dump` of the project DB to enterprise storage
  (`pg_dump "$DATABASE_URL" --format=custom --file=workos-$(date +%F).dump`).
- **Local/dev**: databases are disposable — `npm run db:setup` reproduces schema + seed
  from version control (§47). Never keep manual, unversioned SQL changes.
- Documents/evidence live in Google Drive under Workspace retention — the app stores
  references, so app-database restore never loses documents.

## Routine tasks

| Task | How |
|---|---|
| Provision an employee | Admin → Ажилтнууд → нэмэх (email = Workspace email); person signs in once to link |
| Disable a leaver | Admin → идэвхгүй болгох (session resolution refuses inactive employees immediately) |
| New quarter | Admin → Улирлууд (insert via SQL/import for now), set status ACTIVE; import OKR workbook via `scripts/import-okr.ts` |
| Adjust governance | Admin → Хаалтын профайл (audited); gate_rules via SQL/console |
| Investigate an action | Admin → Сүүлийн audit бүртгэл, or query `audit_logs` by entity |
| Re-run a failed import | imports are transactional — nothing partial persists; fix input, re-run |

## Known operational characteristics

- Gate runs are immutable history; re-running the gate appends a new run (storage grows
  linearly with closure attempts — negligible at department scale).
- `closure_requests` allows one open request per scope; a GATE_FAILED request is reused by
  the next SUBMIT FOR CLOSURE.
- Session lifetime: Supabase-managed (production) / 12h HMAC cookie (dev).
- The AI agent page issues one provider call per question; with `AI_PROVIDER=mock` it is
  fully offline.

## Incident quick answers

- **"Гейт FAIL боловч бүх зүйл бэлэн"** — check `gate_findings` of the latest run; the
  most common causes are a deliverable without the final-version flag, a PENDING metric
  validation, or an unresolved CRITICAL finding.
- **User sees empty app** — employee row missing/inactive or email mismatch; check
  Admin → Ажилтнууд → "Google холбогдсон".
- **"CLOSED can only be set by the closure gate"** in logs — something attempted a direct
  status write; this is the guard working, not a bug.
