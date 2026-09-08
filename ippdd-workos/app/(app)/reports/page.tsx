import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { Card, EmptyState, Stat } from "@/components/ui";
import { GateBadge } from "@/components/shared/status";

export const metadata = { title: "Тайлан / Dashboard" };
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await requireSession();
  if (!["MANAGER", "DIRECTOR", "ADMIN"].includes(session.employee.system_role)) {
    redirect("/dashboard");
  }
  const today = new Date().toISOString().slice(0, 10);

  const data = await withUser(session.authUid, async (tx) => {
    const quarter = (
      await tx.query<{ id: string; code: string }>(
        "select id, code from quarters where status = 'ACTIVE' order by start_date desc limit 1",
      )
    ).rows[0];
    if (!quarter) return null;

    const employees = (
      await tx.query<{
        id: string; full_name: string;
        krs_total: string; krs_closed: string;
        work_total: string; work_closed: string; overdue: string;
        evidence_pct: string; approvals_pending: string; returned: string;
      }>(
        `select e.id, e.full_name,
           (select count(*) from key_results k join objectives o on o.id = k.objective_id
             where o.employee_id = e.id and o.quarter_id = $1 and k.status <> 'CANCELLED') as krs_total,
           (select count(*) from key_results k join objectives o on o.id = k.objective_id
             where o.employee_id = e.id and o.quarter_id = $1 and k.status = 'CLOSED') as krs_closed,
           (select count(*) from work_items w where w.owner_id = e.id and w.quarter_id = $1
             and w.status <> 'CANCELLED') as work_total,
           (select count(*) from work_items w where w.owner_id = e.id and w.quarter_id = $1
             and w.status = 'CLOSED') as work_closed,
           (select count(*) from work_items w where w.owner_id = e.id and w.quarter_id = $1
             and w.status not in ('CLOSED','CANCELLED') and w.deadline < $2) as overdue,
           (select coalesce(round(100.0 * count(*) filter (where ev > 0) / greatest(count(*),1)), 100)
              from (select w.id, (select count(*) from evidence x where x.work_item_id = w.id) as ev
                      from work_items w where w.owner_id = e.id and w.quarter_id = $1
                       and w.status <> 'CANCELLED') t) as evidence_pct,
           (select count(*) from approvals a join work_items w on w.id = a.work_item_id
             where w.owner_id = e.id and a.decision = 'PENDING') as approvals_pending,
           (select count(*) from work_items w where w.owner_id = e.id and w.quarter_id = $1
             and w.status in ('RETURNED','REJECTED')) as returned
           from employees e
          where e.active and e.system_role <> 'ADMIN'
          order by e.full_name`,
        [quarter.id, today],
      )
    ).rows;

    const governance = (
      await tx.query<{
        returned_total: string; open_critical: string; drift: string;
        pending_closures: string; avg_approval_hours: string | null;
      }>(
        `select
           (select count(*) from audit_logs where action in ('REVIEW_RETURN','APPROVAL_RETURN')) as returned_total,
           (select count(*) from gate_findings f where f.severity = 'CRITICAL'
             and f.result = 'FAIL' and not f.resolved) as open_critical,
           (select count(*) from deliverables d where d.final_version
             and d.approved_modified_time is not null and d.drive_modified_time is not null
             and d.drive_modified_time > d.approved_modified_time) as drift,
           (select count(*) from closure_requests where status = 'READY_FOR_SIGNOFF') as pending_closures,
           (select round(avg(extract(epoch from (approved_at - requested_at)) / 3600), 1)::text
              from approvals where approved_at is not null) as avg_approval_hours`,
      )
    ).rows[0];

    const closures = (
      await tx.query<{
        id: string; employee: string; quarter_code: string; weighted_achievement: string;
        krs_total: number; krs_closed: number; final_gate_result: string; approved_at: string;
      }>(
        `select qc.id, e.full_name as employee, q.code as quarter_code,
                qc.weighted_achievement, qc.krs_total, qc.krs_closed,
                qc.final_gate_result, qc.approved_at
           from quarter_closures qc
           join employees e on e.id = qc.employee_id
           join quarters q on q.id = qc.quarter_id
          order by qc.approved_at desc`,
      )
    ).rows;

    const workTypeDist = (
      await tx.query<{ work_type: string; n: string; closed: string }>(
        `select work_type::text, count(*) as n,
                count(*) filter (where status = 'CLOSED') as closed
           from work_items where quarter_id = $1 and status <> 'CANCELLED'
          group by work_type order by n desc`,
        [quarter.id],
      )
    ).rows;

    return { quarter, employees, governance, closures, workTypeDist };
  });

  if (!data) return <EmptyState title="Идэвхтэй улирал алга" />;

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold">Газрын dashboard — {data.quarter.code}</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Sign-off хүлээж буй хаалт" value={data.governance.pending_closures}
          tone={Number(data.governance.pending_closures) > 0 ? "warn" : "good"} />
        <Stat label="Нээлттэй critical finding" value={data.governance.open_critical}
          tone={Number(data.governance.open_critical) > 0 ? "bad" : "good"} />
        <Stat label="Буцаалтын нийт тоо" value={data.governance.returned_total} />
        <Stat label="Батлагдсаны дараах өөрчлөлт ⚠" value={data.governance.drift}
          tone={Number(data.governance.drift) > 0 ? "bad" : "good"}
          sub="Drive metadata drift" />
        <Stat label="Батлалын дундаж цаг" value={data.governance.avg_approval_hours ?? "—"} sub="цагаар" />
      </div>

      <Card title="Ажилтны бэлэн байдал">
        <div className="overflow-x-auto">
          <table className="data w-full">
            <thead>
              <tr>
                <th>Ажилтан</th><th>KR хаалт</th><th>Ажлын хаалт</th><th>Нотолгоо</th>
                <th>Хүлээгдэж буй батлал</th><th>Буцаагдсан</th><th>Хугацаа хэтэрсэн</th><th>Эрсдэл</th>
              </tr>
            </thead>
            <tbody>
              {data.employees.map((e) => {
                const risk =
                  Number(e.overdue) > 1 || Number(e.returned) > 1 ? "FAIL"
                  : Number(e.overdue) > 0 || Number(e.evidence_pct) < 90 ? "WARNING" : "PASS";
                return (
                  <tr key={e.id}>
                    <td className="font-medium">{e.full_name}</td>
                    <td className="tabular-nums">{e.krs_closed}/{e.krs_total}</td>
                    <td className="tabular-nums">{e.work_closed}/{e.work_total}</td>
                    <td className="tabular-nums" title="Нотолгоотой ажлын хувь (нотолгоотой ажил / нийт ажил)">
                      {e.evidence_pct}%
                    </td>
                    <td className="tabular-nums">{e.approvals_pending}</td>
                    <td className="tabular-nums">{e.returned}</td>
                    <td className={`tabular-nums ${Number(e.overdue) > 0 ? "font-semibold text-red-700" : ""}`}>{e.overdue}</td>
                    <td><GateBadge result={risk} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Нотолгоо % = нотолгоотой ажил / нийт ажил. Эрсдэл: хугацаа хэтэрсэн &gt;1 эсвэл буцаалт &gt;1 → FAIL;
          хугацаа хэтэрсэн &gt;0 эсвэл нотолгоо &lt;90% → WARNING.
        </p>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Ажлын төрлийн тархалт">
          <table className="data w-full">
            <thead><tr><th>Төрөл</th><th>Нийт</th><th>Хаагдсан</th></tr></thead>
            <tbody>
              {data.workTypeDist.map((t) => (
                <tr key={t.work_type}>
                  <td className="text-xs">{t.work_type}</td>
                  <td className="tabular-nums">{t.n}</td>
                  <td className="tabular-nums">{t.closed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Улирлын хаалтын бүртгэл (Quarter Closure Records)">
          {data.closures.length === 0 ? (
            <EmptyState title="Хаагдсан улирал алга"
              hint="Ажилтны бүх KR хаагдаж, захирал улирлын хаалтад гарын үсэг зурснаар энд бүртгэгдэнэ." />
          ) : (
            <table className="data w-full">
              <thead><tr><th>Ажилтан</th><th>Улирал</th><th>KR</th><th>Жинлэсэн гүйцэтгэл</th><th>Гейт</th><th>Бүртгэл</th></tr></thead>
              <tbody>
                {data.closures.map((c) => (
                  <tr key={c.id}>
                    <td>{c.employee}</td>
                    <td>{c.quarter_code}</td>
                    <td className="tabular-nums">{c.krs_closed}/{c.krs_total}</td>
                    <td className="tabular-nums">{Number(c.weighted_achievement)}%</td>
                    <td><GateBadge result={c.final_gate_result as never} /></td>
                    <td>
                      <Link className="text-xs text-blue-700 underline" href={`/reports/certificate/${c.id}`}>
                        Гэрчилгээ
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
