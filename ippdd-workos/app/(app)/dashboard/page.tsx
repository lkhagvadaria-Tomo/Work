import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { Card, EmptyState, Meter, Stat } from "@/components/ui";
import { WorkStatusBadge } from "@/components/shared/status";
import { computeNextActions } from "@/lib/next-actions";
import type { WorkStatus } from "@/types/db";

export const metadata = { title: "Нүүр" };
export const dynamic = "force-dynamic";

interface WorkRow {
  id: string; work_code: string; title: string; status: WorkStatus;
  deadline: string | null; priority: string; evidence_count: string;
  kr_label: string | null; simplified: boolean;
}

export default async function DashboardPage() {
  const session = await requireSession();
  const today = new Date().toISOString().slice(0, 10);

  const data = await withUser(session.authUid, async (tx) => {
    const quarter = (
      await tx.query<{ id: string; code: string; start_date: string; end_date: string }>(
        "select id, code, start_date, end_date from quarters where status = 'ACTIVE' order by start_date desc limit 1",
      )
    ).rows[0];

    const work = (
      await tx.query<WorkRow>(
        `select w.id, w.work_code, w.title, w.status, w.deadline, w.priority,
                (select count(*) from evidence e where e.work_item_id = w.id) as evidence_count,
                (select o.objective_code || '-' || k.kr_code
                   from key_results k join objectives o on o.id = k.objective_id
                  where k.id = w.key_result_id) as kr_label,
                coalesce((select simplified_closure from closure_profiles p
                           where p.work_type = w.work_type), false) as simplified
           from work_items w
          where w.owner_id = $1
          order by w.deadline nulls last`,
        [session.employee.id],
      )
    ).rows;

    const krs = (
      await tx.query<{
        id: string; label: string; status: string; deadline: string | null;
        achievement_percent: string | null; open_work: string;
      }>(
        `select k.id, o.objective_code || '-' || k.kr_code as label, k.status, k.deadline,
                k.achievement_percent,
                (select count(*) from work_items w where w.key_result_id = k.id
                   and w.status not in ('CLOSED','CANCELLED')) as open_work
           from key_results k
           join objectives o on o.id = k.objective_id
          where o.employee_id = $1 ${quarter ? "and o.quarter_id = $2" : ""}
          order by label`,
        quarter ? [session.employee.id, quarter.id] : [session.employee.id],
      )
    ).rows;

    const pendingReviews = (
      await tx.query<{ n: string }>(
        "select count(*) as n from reviews where reviewer_id = $1 and decision = 'PENDING'",
        [session.employee.id],
      )
    ).rows[0];
    const pendingApprovals = (
      await tx.query<{ n: string }>(
        "select count(*) as n from approvals where approver_id = $1 and decision = 'PENDING'",
        [session.employee.id],
      )
    ).rows[0];

    return { quarter, work, krs, pendingReviews, pendingApprovals };
  });

  const { quarter, work, krs } = data;
  const openWork = work.filter((w) => !["CLOSED", "CANCELLED"].includes(w.status));
  const overdue = openWork.filter((w) => w.deadline && w.deadline < today);
  const returned = openWork.filter((w) => ["RETURNED", "REJECTED", "BLOCKED"].includes(w.status));
  const waitingApproval = openWork.filter((w) =>
    ["WAITING_APPROVAL", "REVIEW_PASSED"].includes(w.status),
  );
  const evidenceGaps = openWork.filter(
    (w) => Number(w.evidence_count) === 0 && w.status !== "NOT_STARTED",
  );
  const closedWork = work.filter((w) => w.status === "CLOSED").length;
  const totalWork = work.filter((w) => w.status !== "CANCELLED").length;
  const closedKrs = krs.filter((k) => k.status === "CLOSED").length;
  const krDeadlinesSoon = krs.filter(
    (k) => k.status !== "CLOSED" && k.deadline && k.deadline >= today &&
      k.deadline <= addDays(today, 7),
  );

  const nextActions = computeNextActions({
    workItems: openWork.map((w) => ({
      id: w.id, work_code: w.work_code, title: w.title, status: w.status,
      deadline: w.deadline, priority: w.priority,
      evidence_count: Number(w.evidence_count), kr_label: w.kr_label,
      simplified: w.simplified,
    })),
    krs: krs.map((k) => ({
      id: k.id, label: k.label, status: k.status as never,
      deadline: k.deadline, open_work: Number(k.open_work),
    })),
    today,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-bold">
          Сайн байна уу, {session.employee.full_name}
        </h1>
        <p className="text-sm text-slate-500">
          {quarter ? `${quarter.code} · ${quarter.start_date} → ${quarter.end_date}` : "Идэвхтэй улирал алга"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="KR хаалт" value={`${closedKrs}/${krs.length}`}
          sub="Хаагдсан / нийт KR" tone={closedKrs === krs.length && krs.length > 0 ? "good" : "default"} />
        <Stat label="Ажлын хаалт" value={`${closedWork}/${totalWork}`} sub="Хаагдсан / нийт ажил" />
        <Stat label="Хугацаа хэтэрсэн" value={overdue.length}
          tone={overdue.length > 0 ? "bad" : "good"} sub="Нээлттэй, deadline өнгөрсөн" />
        <Stat label="Хүлээгдэж буй үйлдэл" value={nextActions.length}
          sub="Таны дараагийн алхмууд" tone={nextActions.length > 0 ? "warn" : "good"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Анхаарал шаардаж байна">
          {overdue.length + returned.length + evidenceGaps.length + waitingApproval.length +
            Number(data.pendingReviews.n) + Number(data.pendingApprovals.n) === 0 ? (
            <EmptyState title="Бүх зүйл хэвийн" hint="Анхаарал шаардсан зүйл алга." />
          ) : (
            <ul className="space-y-2 text-sm">
              {overdue.length > 0 && (
                <li className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2">
                  <span className="font-medium text-red-800">{overdue.length} хугацаа хэтэрсэн ажил</span>
                  <Link href="/work?f=overdue" className="text-xs font-semibold text-red-700 underline">Харах</Link>
                </li>
              )}
              {Number(data.pendingReviews.n) > 0 && (
                <li className="flex items-center justify-between rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2">
                  <span className="font-medium text-indigo-800">{data.pendingReviews.n} хянах хүсэлт таныг хүлээж байна</span>
                  <Link href="/reviews" className="text-xs font-semibold text-indigo-700 underline">Хянах</Link>
                </li>
              )}
              {Number(data.pendingApprovals.n) > 0 && (
                <li className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                  <span className="font-medium text-amber-800">{data.pendingApprovals.n} батлал таныг хүлээж байна</span>
                  <Link href="/approvals" className="text-xs font-semibold text-amber-700 underline">Батлах</Link>
                </li>
              )}
              {waitingApproval.length > 0 && (
                <li className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                  <span className="font-medium text-amber-800">{waitingApproval.length} ажил батлал хүлээж байна</span>
                  <Link href="/work?f=waiting" className="text-xs font-semibold text-amber-700 underline">Харах</Link>
                </li>
              )}
              {returned.length > 0 && (
                <li className="flex items-center justify-between rounded-md border border-orange-200 bg-orange-50 px-3 py-2">
                  <span className="font-medium text-orange-800">{returned.length} буцаагдсан / блоклогдсон ажил</span>
                  <Link href="/work?f=returned" className="text-xs font-semibold text-orange-700 underline">Харах</Link>
                </li>
              )}
              {evidenceGaps.length > 0 && (
                <li className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="font-medium text-slate-700">{evidenceGaps.length} ажилд нотолгоо бүртгэгдээгүй</span>
                  <Link href="/work?f=no-evidence" className="text-xs font-semibold text-slate-600 underline">Харах</Link>
                </li>
              )}
              {krDeadlinesSoon.length > 0 && (
                <li className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
                  <span className="font-medium text-blue-800">
                    {krDeadlinesSoon.length} KR-ийн хугацаа 7 хоногт дуусна ({krDeadlinesSoon.map((k) => k.label).join(", ")})
                  </span>
                  <Link href="/okr" className="text-xs font-semibold text-blue-700 underline">OKR</Link>
                </li>
              )}
            </ul>
          )}
        </Card>

        <Card title="Дараагийн алхмууд (дүрэмд суурилсан)">
          {nextActions.length === 0 ? (
            <EmptyState title="Хүлээгдэж буй алхам алга" />
          ) : (
            <ol className="space-y-2 text-sm">
              {nextActions.map((a) => (
                <li key={`${a.entityType}-${a.entityId}-${a.reason}`} className="flex gap-2">
                  <span
                    className={`mt-0.5 inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-bold ${
                      a.rank === 1 ? "bg-red-100 text-red-700"
                      : a.rank === 2 ? "bg-orange-100 text-orange-700"
                      : a.rank <= 4 ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {a.reason}
                  </span>
                  <span>
                    <Link
                      href={a.entityType === "work_item" ? `/work/${a.entityId}` : `/okr/kr/${a.entityId}`}
                      className="font-semibold text-slate-800 underline decoration-slate-300"
                    >
                      {a.label}
                    </Link>{" "}
                    <span className="text-slate-600">— {a.action}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card title="Миний нээлттэй ажлууд">
        {openWork.length === 0 ? (
          <EmptyState title="Нээлттэй ажил алга" hint="Шинэ ажил үүсгэхийн тулд Миний ажил хэсэгт очно уу." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data w-full">
              <thead>
                <tr><th>Код</th><th>Нэр</th><th>KR</th><th>Төлөв</th><th>Хугацаа</th><th>Нотолгоо</th></tr>
              </thead>
              <tbody>
                {openWork.map((w) => (
                  <tr key={w.id}>
                    <td><Link className="font-mono text-xs font-semibold text-blue-700 underline" href={`/work/${w.id}`}>{w.work_code}</Link></td>
                    <td className="max-w-md truncate">{w.title}</td>
                    <td className="text-xs">{w.kr_label ?? "—"}</td>
                    <td><WorkStatusBadge status={w.status} /></td>
                    <td className={w.deadline && w.deadline < today ? "font-semibold text-red-700" : ""}>{w.deadline ?? "—"}</td>
                    <td className="tabular-nums">{w.evidence_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="KR-ийн явц">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {krs.map((k) => (
            <Link key={k.id} href={`/okr/kr/${k.id}`} className="rounded-md border border-slate-200 p-3 hover:bg-slate-50">
              <Meter value={Number(k.achievement_percent ?? 0)} label={k.label} />
              <p className="mt-1 text-[11px] text-slate-500">
                {k.deadline ?? "хугацаагүй"} · нээлттэй ажил {k.open_work}
              </p>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
