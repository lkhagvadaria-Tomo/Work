import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { Card, EmptyState, Meter } from "@/components/ui";
import { KrStatusBadge, GateBadge } from "@/components/shared/status";
import { weightedAchievement } from "@/lib/okr/calc";
import { submitQuarterForClosure } from "@/actions/okr";
import type { GateResult, KrStatus } from "@/types/db";

export const metadata = { title: "Миний OKR" };
export const dynamic = "force-dynamic";

export default async function OkrPage() {
  const session = await requireSession();

  const data = await withUser(session.authUid, async (tx) => {
    const quarter = (
      await tx.query<{ id: string; code: string }>(
        "select id, code from quarters where status = 'ACTIVE' order by start_date desc limit 1",
      )
    ).rows[0];
    if (!quarter) return { quarter: null, objectives: [], quarterRequest: null };

    const { rows: objectives } = await tx.query<{
      id: string; objective_code: string; title: string; weight: string;
    }>(
      `select id, objective_code, title, weight from objectives
        where employee_id = $1 and quarter_id = $2 and status <> 'CANCELLED'
        order by objective_code`,
      [session.employee.id, quarter.id],
    );

    const withKrs = [];
    for (const o of objectives) {
      const { rows: krs } = await tx.query<{
        id: string; kr_code: string; title: string; weight: string; deadline: string | null;
        status: KrStatus; achievement_percent: string | null;
        open_work: string; total_work: string; evidence: string;
        last_gate: GateResult | null;
      }>(
        `select k.id, k.kr_code, k.title, k.weight, k.deadline, k.status, k.achievement_percent,
                (select count(*) from work_items w where w.key_result_id = k.id
                   and w.status not in ('CLOSED','CANCELLED')) as open_work,
                (select count(*) from work_items w where w.key_result_id = k.id
                   and w.status <> 'CANCELLED') as total_work,
                (select count(*) from evidence e join work_items w on w.id = e.work_item_id
                   where w.key_result_id = k.id) as evidence,
                (select g.result from gate_runs g
                   where g.scope_type = 'KEY_RESULT' and g.scope_id = k.id
                   order by g.started_at desc limit 1) as last_gate
           from key_results k where k.objective_id = $1 order by k.kr_code`,
        [o.id],
      );
      withKrs.push({ ...o, krs });
    }

    const quarterRequest = (
      await tx.query<{ id: string; status: string }>(
        `select id, status from closure_requests
          where scope_type = 'QUARTER' and scope_id = $1 and requested_by = $2
          order by created_at desc limit 1`,
        [quarter.id, session.employee.id],
      )
    ).rows[0] ?? null;

    return { quarter, objectives: withKrs, quarterRequest };
  });

  if (!data.quarter) {
    return <EmptyState title="Идэвхтэй улирал алга" hint="Админ улирлыг ACTIVE болгоно." />;
  }

  const achieved = weightedAchievement(
    data.objectives.map((o) => ({
      weight: o.weight,
      krs: o.krs.map((k) => ({
        weight: k.weight, achievement_percent: k.achievement_percent, status: k.status,
      })),
    })),
  );
  const allKrs = data.objectives.flatMap((o) => o.krs);
  const closable = allKrs.length > 0 && allKrs.every((k) => k.status === "CLOSED");
  const submitQuarter = submitQuarterForClosure.bind(null, data.quarter.id);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">Миний OKR — {data.quarter.code}</h1>
          <p className="text-sm text-slate-500">
            Жинлэсэн гүйцэтгэл: <strong className="tabular-nums">{achieved}%</strong>{" "}
            (= Σ зорилтын жин × KR жин × KR гүйцэтгэл)
          </p>
        </div>
        <form action={submitQuarter}>
          <button
            className="rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            title="Улирлын хаалтын гейт ажиллуулж, захирлын sign-off-д илгээнэ"
          >
            Улирлын хаалт хүсэх{closable ? "" : " (гейт шалгана)"}
          </button>
        </form>
      </div>

      {data.quarterRequest && (
        <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Улирлын хаалтын хүсэлтийн төлөв: <strong>{data.quarterRequest.status}</strong>
          {data.quarterRequest.status === "READY_FOR_SIGNOFF" && " — захирлын sign-off хүлээгдэж байна"}
        </p>
      )}

      {data.objectives.length === 0 && (
        <EmptyState title="OKR бүртгэлгүй" hint="Импортын скрипт эсвэл админаар OKR-оо бүртгүүлнэ үү." />
      )}

      {data.objectives.map((o) => (
        <Card
          key={o.id}
          title={
            <span>
              {o.objective_code} · {o.title}{" "}
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600">
                жин {Number(o.weight)}%
              </span>
            </span>
          }
        >
          <div className="overflow-x-auto">
            <table className="data w-full">
              <thead>
                <tr>
                  <th>KR</th><th>Нэр</th><th>Жин</th><th>Хугацаа</th>
                  <th>Гүйцэтгэл</th><th>Төлөв</th><th>Ажил</th><th>Нотолгоо</th><th>Гейт</th>
                </tr>
              </thead>
              <tbody>
                {o.krs.map((k) => (
                  <tr key={k.id}>
                    <td>
                      <Link href={`/okr/kr/${k.id}`} className="font-mono text-xs font-semibold text-blue-700 underline">
                        {k.kr_code}
                      </Link>
                    </td>
                    <td className="max-w-lg"><span className="line-clamp-2">{k.title}</span></td>
                    <td className="tabular-nums">{Number(k.weight)}%</td>
                    <td>{k.deadline ?? "—"}</td>
                    <td className="w-32"><Meter value={Number(k.achievement_percent ?? 0)} label="" /></td>
                    <td><KrStatusBadge status={k.status} /></td>
                    <td className="tabular-nums">{Number(k.total_work) - Number(k.open_work)}/{k.total_work}</td>
                    <td className="tabular-nums">{k.evidence}</td>
                    <td>{k.last_gate ? <GateBadge result={k.last_gate} /> : <span className="text-xs text-slate-400">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}
