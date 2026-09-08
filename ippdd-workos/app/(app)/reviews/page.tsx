import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { Card, EmptyState, inputCls } from "@/components/ui";
import { GateBadge, WorkStatusBadge } from "@/components/shared/status";
import { decideReview } from "@/actions/work";
import type { GateResult, WorkStatus } from "@/types/db";

export const metadata = { title: "Хяналт (Review)" };
export const dynamic = "force-dynamic";

interface QueueRow {
  id: string; review_type: string; created_at: string; deliverable_version: string | null;
  work_id: string; work_code: string; title: string; status: WorkStatus;
  owner_name: string; evidence: string; final_dels: string; last_gate: GateResult | null;
}

export default async function ReviewsPage() {
  const session = await requireSession();

  const { queue, history } = await withUser(session.authUid, async (tx) => {
    const queue = (
      await tx.query<QueueRow>(
        `select r.id, r.review_type, r.created_at, r.deliverable_version,
                w.id as work_id, w.work_code, w.title, w.status,
                e.full_name as owner_name,
                (select count(*) from evidence ev where ev.work_item_id = w.id) as evidence,
                (select count(*) from deliverables d where d.work_item_id = w.id and d.final_version) as final_dels,
                (select g.result from gate_runs g where g.scope_type='WORK_ITEM' and g.scope_id=w.id
                  order by g.started_at desc limit 1) as last_gate
           from reviews r
           join work_items w on w.id = r.work_item_id
           join employees e on e.id = w.owner_id
          where r.reviewer_id = $1 and r.decision = 'PENDING'
          order by r.created_at`,
        [session.employee.id],
      )
    ).rows;
    const history = (
      await tx.query<{ work_code: string; work_id: string; review_type: string; decision: string; reviewed_at: string }>(
        `select w.work_code, w.id as work_id, r.review_type, r.decision, r.reviewed_at
           from reviews r join work_items w on w.id = r.work_item_id
          where r.reviewer_id = $1 and r.decision <> 'PENDING'
          order by r.reviewed_at desc limit 15`,
        [session.employee.id],
      )
    ).rows;
    return { queue, history };
  });

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold">Хянагчийн дараалал</h1>

      {queue.length === 0 ? (
        <EmptyState title="Таныг хүлээж буй review алга" />
      ) : (
        queue.map((r) => (
          <Card
            key={r.id}
            title={
              <span>
                <Link href={`/work/${r.work_id}`} className="font-mono text-blue-700 underline">{r.work_code}</Link>{" "}
                — {r.title}
              </span>
            }
          >
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <WorkStatusBadge status={r.status} />
              <span>Эзэмшигч: <strong>{r.owner_name}</strong></span>
              <span>Review төрөл: <strong>{r.review_type}</strong></span>
              <span>Хувилбар: <strong className="font-mono">{r.deliverable_version ?? "—"}</strong></span>
              <span>Эцсийн deliverable: <strong>{r.final_dels}</strong></span>
              <span>Нотолгоо: <strong>{r.evidence}</strong></span>
              <span>Гейт: {r.last_gate ? <GateBadge result={r.last_gate} /> : "—"}</span>
              <span className="text-xs text-slate-400">Илгээсэн: {new Date(r.created_at).toLocaleDateString("mn-MN")}</span>
            </div>
            <form action={decideReview.bind(null, r.id)} className="mt-3 flex flex-wrap items-end gap-3">
              <label className="block flex-1 text-xs font-semibold text-slate-600">
                Тайлбар (RETURN/REJECT-д заавал)
                <input name="comment" className={`mt-1 ${inputCls}`} />
              </label>
              <div className="flex gap-2">
                <button name="decision" value="PASS" className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white">PASS</button>
                <button name="decision" value="RETURN" className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-white">RETURN</button>
                <button name="decision" value="REJECT" className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white">REJECT</button>
              </div>
            </form>
          </Card>
        ))
      )}

      {history.length > 0 && (
        <Card title="Сүүлийн шийдвэрүүд">
          <table className="data w-full">
            <thead><tr><th>Ажил</th><th>Төрөл</th><th>Шийдвэр</th><th>Огноо</th></tr></thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i}>
                  <td><Link href={`/work/${h.work_id}`} className="font-mono text-xs text-blue-700 underline">{h.work_code}</Link></td>
                  <td className="text-xs">{h.review_type}</td>
                  <td className="text-xs font-semibold">{h.decision}</td>
                  <td className="text-xs">{new Date(h.reviewed_at).toLocaleDateString("mn-MN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
