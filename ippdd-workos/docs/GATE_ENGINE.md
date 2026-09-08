# Gate Engine

Deterministic, AI-free closure evaluation (§17–18). Code: `lib/gate-engine/`.

## Gates

| Gate | Check key | FAILs when |
|---|---|---|
| G1 Deliverable | `DELIVERABLES_COMPLETE` | a required requirement has no deliverable, or no **final version** where required (WARNING when no requirements are defined at all) |
| G2 Self QC | `SELF_QC_PASSED` | no SELF_QC review with PASS |
| G3 Review | `REVIEWS_PASSED` | any required review type not PASSed, or any REJECT present |
| G4 Approval | `APPROVALS_PASSED` | any required approval type not APPROVEd (WARNING when approved without a version reference) |
| G5 Implementation | `IMPLEMENTATION_SATISFIED` | required but no record in LIVE / PILOT / NOT_REQUIRED |
| G6 Metric | `METRIC_SATISFIED` | no metric defined, any FAIL, or any PENDING validation |
| G7 Evidence & findings | `EVIDENCE_SUFFICIENT`, `CRITICAL_FINDINGS` | evidence below the profile minimum; unresolved CRITICAL findings on the latest run |
| Warnings | `DEADLINE_CHECK`, `VERSION_INTEGRITY` | overdue deadline; approved deliverable whose Drive `modifiedTime` moved after approval ("APPROVED VERSION MAY HAVE CHANGED" — metadata drift, not cryptographic proof) |

**Rollup:** any required FAIL → `FAIL`; else any WARNING → `WARNING`; else `PASS`.
Gate applicability comes from the work type's `closure_profiles` row (admin-configurable,
§16) plus per-item flags (`implementation_required`, `validation_required`).

## Scopes

- **Work item** — `evaluateWorkClosure(WorkSnapshot)`; snapshot loaded under the caller's
  RLS (`lib/gate-engine/load.ts`), результат persisted as immutable `gate_runs` +
  `gate_findings`.
- **KR** — `evaluateKrClosure`: all governed work CLOSED/CANCELLED + KR metric validated.
- **Quarter (per employee)** — `evaluateQuarterClosure`: every KR closed, open work list,
  evidence completeness, weighted achievement (`lib/okr/calc.ts`).

## Closure protocol

```
owner: SUBMIT FOR CLOSURE
  → engine evaluates → gate_run persisted
  → FAIL  → closure_request PENDING (blockers listed; nothing closes)
  → PASS/WARNING → closure_request READY_FOR_SIGNOFF → approver/director notified
authorized human: APPROVE / RETURN / REJECT
  → app.finalize_work_closure() re-verifies IN SQL:
      • signer ≠ owner, signer ∈ {designated approver, department director, admin}
      • gate run matches the scope and is not FAIL
      • gate run is NOT STALE (work unchanged since evaluation — §44)
      • app.work_closure_blockers() re-checks every profile condition
  → sets the transaction-local closure flag → status CLOSED + closed_at → audit + notify
```

The SQL re-check exists so that even a forged "PASS" gate run written through a direct
API connection cannot close incomplete work — proven in
`tests/integration/lifecycle.test.ts`.

KR and quarter closures follow the same protocol via `app.finalize_kr_closure` /
`app.finalize_quarter_closure` (director/admin sign-off; quarter approval writes the
permanent `quarter_closures` record shown as the Quarter Closure Certificate).

## Configuration

- `closure_profiles` — per work type: required review/approval types, implementation/
  validation/metric/evidence requirements, min evidence count, simplified closure
  (SPRINT/BAU/KPI). Editable in **Admin → Хаалтын профайл**; audited.
- `gate_rules` — registry rows binding check keys to severities/descriptions; additional
  configured rules can be added without code changes (jsonb `configuration`).

## AI boundary

The engine never consumes AI output. The AI agent may *explain* gate findings
(`lib/ai/agent.ts` passes them as structured context) but has no write path to gates,
approvals or closures (§20, D-007).
