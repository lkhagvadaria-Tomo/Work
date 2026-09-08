import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { Card, EmptyState, inputCls } from "@/components/ui";
import { GateBadge, WorkStatusBadge } from "@/components/shared/status";
import { decideApproval, finalizeWorkClosure } from "@/actions/work";
import { finalizeKrClosure, finalizeQuarterClosure } from "@/actions/okr";
import type { GateResult, WorkStatus } from "@/types/db";

export const metadata = { title: "Батлал (Approval)" };
export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const session = await requireSession();
  const me = session.employee.id;
  const isDirector = ["DIRECTOR", "ADMIN"].includes(session.employee.system_role);

  const data = await withUser(session.authUid, async (tx) => {
    const approvals = (
      await tx.query<{
        id: string; approval_type: string; deliverable_version: string | null; requested_at: string;
        work_id: string; work_code: string; title: string; status: WorkStatus;
        owner_name: string; reviews_passed: string; reviews_total: string;
        open_findings: string; evidence: string; last_gate: GateResult | null;
      }>(
        `select a.id, a.approval_type, a.deliverable_version, a.requested_at,
                w.id as work_id, w.work_code, w.title, w.status, e.full_name as owner_name,
                (select count(*) from reviews r where r.work_item_id = w.id and r.decision = 'PASS') as reviews_passed,
                (select count(*) from reviews r where r.work_item_id = w.id) as reviews_total,
                (select count(*) from gate_findings f join gate_runs g on g.id = f.gate_run_id
                  where g.scope_type='WORK_ITEM' and g.scope_id=w.id and not f.resolved
                    and f.result = 'FAIL') as open_findings,
                (select count(*) from evidence ev where ev.work_item_id = w.id) as evidence,
                (select g.result from gate_runs g where g.scope_type='WORK_ITEM' and g.scope_id=w.id
                  order by g.started_at desc limit 1) as last_gate
           from approvals a
           join work_items w on w.id = a.work_item_id
           join employees e on e.id = w.owner_id
          where a.approver_id = $1 and a.decision = 'PENDING'
          order by a.requested_at`,
        [me],
      )
    ).rows;

    const closures = (
      await tx.query<{
        id: string; scope_type: string; scope_id: string; requested_at: string;
        requester: string; label: string; gate: GateResult | null;
      }>(
        `select cr.id, cr.scope_type, cr.scope_id, cr.requested_at,
                e.full_name as requester,
                case cr.scope_type
                  when 'WORK_ITEM' then (select w.work_code || ' — ' || w.title from work_items w where w.id = cr.scope_id)
                  when 'KEY_RESULT' then (select o.objective_code || '-' || k.kr_code || ' — ' || left(k.title, 90)
                                            from key_results k join objectives o on o.id = k.objective_id
                                           where k.id = cr.scope_id)
                  when 'QUARTER' then (select 'Улирал ' || q.code || ' — ' || e.full_name from quarters q where q.id = cr.scope_id)
                end as label,
                (select g.result from gate_runs g where g.id = cr.gate_run_id) as gate
           from closure_requests cr
           join employees e on e.id = cr.requested_by
          where cr.status = 'READY_FOR_SIGNOFF' and cr.requested_by <> $1
            and (
              (cr.scope_type = 'WORK_ITEM' and exists
                (select 1 from work_items w where w.id = cr.scope_id and w.approver_id = $1))
              or $2  -- director/admin sees KR + quarter + work sign-offs
            )
          order by cr.requested_at`,
        [me, isDirector],
      )
    ).rows;

    return { approvals, closures };
  });

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold">Батлагчийн дараалал</h1>

      {data.approvals.length === 0 && data.closures.length === 0 && (
        <EmptyState title="Таныг хүлээж буй батлал алга" />
      )}

      {data.approvals.map((a) => (
        <Card key={a.id} title={
          <span>
            <Link href={`/work/${a.work_id}`} className="font-mono text-blue-700 underline">{a.work_code}</Link> — {a.title}
          </span>
        }>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <WorkStatusBadge status={a.status} />
            <span>Ажилтан: <strong>{a.owner_name}</strong></span>
            <span>Батлалын төрөл: <strong>{a.approval_type}</strong></span>
            <span>Хувилбар: <strong className="font-mono">{a.deliverable_version ?? "—"}</strong></span>
            <span>Review: <strong>{a.reviews_passed}/{a.reviews_total} PASS</strong></span>
            <span>Гейт: {a.last_gate ? <GateBadge result={a.last_gate} /> : "—"}</span>
            <span>Нээлттэй finding: <strong>{a.open_findings}</strong></span>
            <span>Нотолгоо: <strong>{a.evidence}</strong></span>
          </div>
          <form action={decideApproval.bind(null, a.id)} className="mt-3 flex flex-wrap items-end gap-3">
            <label className="block flex-1 text-xs font-semibold text-slate-600">
              Тайлбар (RETURN/REJECT-д заавал)
              <input name="comment" className={`mt-1 ${inputCls}`} />
            </label>
            <div className="flex gap-2">
              <button name="decision" value="APPROVE" className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white">APPROVE</button>
              <button name="decision" value="RETURN" className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-white">RETURN</button>
              <button name="decision" value="REJECT" className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white">REJECT</button>
            </div>
          </form>
        </Card>
      ))}

      {data.closures.length > 0 && (
        <>
          <h2 className="text-base font-bold">Хаалтын sign-off хүлээгдэж байна</h2>
          {data.closures.map((c) => {
            const action =
              c.scope_type === "WORK_ITEM"
                ? finalizeWorkClosure.bind(null, c.id)
                : c.scope_type === "KEY_RESULT"
                  ? finalizeKrClosure.bind(null, c.id)
                  : finalizeQuarterClosure.bind(null, c.id);
            const href =
              c.scope_type === "WORK_ITEM" ? `/work/${c.scope_id}`
              : c.scope_type === "KEY_RESULT" ? `/okr/kr/${c.scope_id}` : "/reports";
            return (
              <Card key={c.id} title={
                <span>
                  <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600">{c.scope_type}</span>
                  <Link href={href} className="text-blue-700 underline">{c.label}</Link>
                </span>
              }>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                  <span>Хүсэгч: <strong>{c.requester}</strong></span>
                  <span>Гейт: {c.gate ? <GateBadge result={c.gate} /> : "—"}</span>
                  <span className="text-xs text-slate-400">{new Date(c.requested_at).toLocaleString("mn-MN")}</span>
                </div>
                <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
                  {c.scope_type === "KEY_RESULT" && (
                    <label className="block text-xs font-semibold text-slate-600">
                      Гүйцэтгэл (%)
                      <input name="achievement_percent" type="number" min={0} max={100} step="0.01"
                        className="mt-1 block w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                    </label>
                  )}
                  <label className="block flex-1 text-xs font-semibold text-slate-600">
                    Тайлбар (RETURN/REJECT-д заавал)
                    <input name="comment" className={`mt-1 ${inputCls}`} />
                  </label>
                  <div className="flex gap-2">
                    <button name="decision" value="APPROVE" className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white">SIGN OFF</button>
                    <button name="decision" value="RETURN" className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-white">RETURN</button>
                    <button name="decision" value="REJECT" className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white">REJECT</button>
                  </div>
                </form>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
