import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { Card, EmptyState, Meter } from "@/components/ui";
import { GateBadge, KrStatusBadge, SeverityBadge, WorkStatusBadge } from "@/components/shared/status";
import { setKrAchievement, submitKrForClosure, finalizeKrClosure } from "@/actions/okr";
import type {
  GateFinding, GateRun, KeyResult, MetricValidation, WorkStatus,
} from "@/types/db";

export const metadata = { title: "KR дэлгэрэнгүй" };
export const dynamic = "force-dynamic";

export default async function KrDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();

  const data = await withUser(session.authUid, async (tx) => {
    const kr = (
      await tx.query<KeyResult & { objective_code: string; objective_title: string; owner_name: string; owner_id: string }>(
        `select k.*, o.objective_code, o.title as objective_title,
                e.full_name as owner_name, o.employee_id as owner_id
           from key_results k
           join objectives o on o.id = k.objective_id
           join employees e on e.id = o.employee_id
          where k.id = $1`,
        [id],
      )
    ).rows[0];
    if (!kr) return null;

    const [work, metrics, gate, findings, timeline, request] = await Promise.all([
      tx.query<{
        id: string; work_code: string; title: string; status: WorkStatus;
        deadline: string | null; evidence: string;
      }>(
        `select w.id, w.work_code, w.title, w.status, w.deadline,
                (select count(*) from evidence e where e.work_item_id = w.id) as evidence
           from work_items w where w.key_result_id = $1 order by w.work_code`,
        [id],
      ),
      tx.query<MetricValidation>(
        "select * from metric_validations where key_result_id = $1", [id],
      ),
      tx.query<GateRun>(
        `select * from gate_runs where scope_type = 'KEY_RESULT' and scope_id = $1
          order by started_at desc limit 1`,
        [id],
      ),
      tx.query<GateFinding>(
        `select f.* from gate_findings f join gate_runs g on g.id = f.gate_run_id
          where g.scope_type = 'KEY_RESULT' and g.scope_id = $1
          order by f.created_at desc limit 20`,
        [id],
      ),
      tx.query<{ action: string; created_at: string; actor: string | null }>(
        `select a.action, a.created_at, e.full_name as actor
           from audit_logs a left join employees e on e.id = a.actor_id
          where a.entity_type = 'key_result' and a.entity_id = $1
          order by a.created_at desc limit 20`,
        [id],
      ),
      tx.query<{ id: string; status: string }>(
        `select id, status from closure_requests
          where scope_type = 'KEY_RESULT' and scope_id = $1
          order by created_at desc limit 1`,
        [id],
      ),
    ]);
    return {
      kr, work: work.rows, metrics: metrics.rows,
      gate: gate.rows[0] ?? null, findings: findings.rows,
      timeline: timeline.rows, request: request.rows[0] ?? null,
    };
  });

  if (!data) notFound();
  const { kr } = data;
  const isOwner = kr.owner_id === session.employee.id;
  const isDirector = ["DIRECTOR", "ADMIN"].includes(session.employee.system_role);
  const label = `${kr.objective_code}-${kr.kr_code}`;
  const submitClosure = submitKrForClosure.bind(null, kr.id);
  const setAchievement = setKrAchievement.bind(null, kr.id);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">
            <Link href="/okr" className="underline">Миний OKR</Link> · {kr.objective_code} — {kr.objective_title}
          </p>
          <h1 className="mt-1 text-lg font-bold">{label}: {kr.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <KrStatusBadge status={kr.status} />
            <span>Эзэмшигч: <strong>{kr.owner_name}</strong></span>
            <span>Жин: <strong>{Number(kr.weight)}%</strong></span>
            <span>Хугацаа: <strong>{kr.deadline ?? "—"}</strong></span>
            {kr.target_description && <span>Зорилт: <strong>{kr.target_description}</strong></span>}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {isOwner && kr.status !== "CLOSED" && (
            <form action={submitClosure}>
              <button className="rounded-md bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
                KR хаалт хүсэх
              </button>
            </form>
          )}
        </div>
      </div>

      {data.request?.status === "READY_FOR_SIGNOFF" && isDirector && (
        <Card title="Захирлын sign-off — KR хаалт" className="border-amber-300">
          <form action={finalizeKrClosure.bind(null, data.request.id)} className="flex flex-wrap items-end gap-3">
            <label className="block text-xs font-semibold text-slate-600">
              Гүйцэтгэл (%)
              <input name="achievement_percent" type="number" min={0} max={100} step="0.01"
                defaultValue={Number(kr.achievement_percent ?? 100)}
                className="mt-1 block w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="block flex-1 text-xs font-semibold text-slate-600">
              Тайлбар (RETURN/REJECT-д заавал)
              <input name="comment" className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <div className="flex gap-2">
              <button name="decision" value="APPROVE" className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white">APPROVE</button>
              <button name="decision" value="RETURN" className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-white">RETURN</button>
              <button name="decision" value="REJECT" className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white">REJECT</button>
            </div>
          </form>
        </Card>
      )}
      {data.request && data.request.status !== "READY_FOR_SIGNOFF" && (
        <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          Хаалтын хүсэлтийн төлөв: <strong>{data.request.status}</strong>
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Хаалтын гейт (сүүлийн ажиллагаа)">
          {!data.gate ? (
            <EmptyState title="Гейт хараахан ажиллаагүй" hint="«KR хаалт хүсэх» дарж гейт ажиллуулна." />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <GateBadge result={data.gate.result} />
                <span className="text-sm text-slate-600">
                  {data.gate.passed_checks} PASS · {data.gate.warning_checks} WARN · {data.gate.failed_checks} FAIL
                  <span className="ml-2 text-xs text-slate-400">{new Date(data.gate.started_at).toLocaleString("mn-MN")}</span>
                </span>
              </div>
              <ul className="space-y-2">
                {data.findings.filter((f) => f.gate_run_id === data.gate!.id).map((f) => (
                  <li key={f.id} className="rounded-md border border-slate-200 p-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={f.severity} />
                      <GateBadge result={f.result} />
                      <span className="font-medium">{f.title}</span>
                    </div>
                    {f.recommended_action && (
                      <p className="mt-1 text-xs text-slate-500">→ {f.recommended_action}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title="Метрик — зорилт ба бодит">
          {kr.measurement_method && (
            <p className="mb-3 whitespace-pre-line rounded bg-slate-50 p-2 text-xs text-slate-600">
              {kr.measurement_method}
            </p>
          )}
          {isOwner && kr.status !== "CLOSED" && (
            <form action={setAchievement} className="mb-3 flex items-end gap-2">
              <label className="text-xs font-semibold text-slate-600">
                Гүйцэтгэл (%)
                <input name="achievement_percent" type="number" min={0} max={100} step="0.01"
                  defaultValue={Number(kr.achievement_percent ?? 0)}
                  className="mt-1 block w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              </label>
              <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">Хадгалах</button>
            </form>
          )}
          <Meter value={Number(kr.achievement_percent ?? 0)} label="KR гүйцэтгэл" />
          {data.metrics.length > 0 && (
            <table className="data mt-3 w-full">
              <thead><tr><th>Метрик</th><th>Зорилт</th><th>Бодит</th><th>Төлөв</th></tr></thead>
              <tbody>
                {data.metrics.map((m) => (
                  <tr key={m.id}>
                    <td>{m.metric_name}</td>
                    <td className="tabular-nums">{m.target_operator} {m.target_value ?? "—"} {m.unit ?? ""}</td>
                    <td className="tabular-nums">{m.actual_value ?? "—"}</td>
                    <td><GateBadge result={m.validation_status === "PASS" ? "PASS" : m.validation_status === "FAIL" ? "FAIL" : "NOT_APPLICABLE"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card title="Холбогдсон ажлууд" actions={
        isOwner ? <Link href={`/work/new?kr=${kr.id}`} className="text-xs font-semibold text-blue-700 underline">+ Ажил нэмэх</Link> : undefined
      }>
        {data.work.length === 0 ? (
          <EmptyState title="Ажил бүртгэгдээгүй" hint="KR-ийг хэрэгжүүлэх ажлын бүртгэл үүсгэнэ үү." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data w-full">
              <thead><tr><th>Код</th><th>Нэр</th><th>Төлөв</th><th>Хугацаа</th><th>Нотолгоо</th></tr></thead>
              <tbody>
                {data.work.map((w) => (
                  <tr key={w.id}>
                    <td><Link href={`/work/${w.id}`} className="font-mono text-xs font-semibold text-blue-700 underline">{w.work_code}</Link></td>
                    <td className="max-w-md truncate">{w.title}</td>
                    <td><WorkStatusBadge status={w.status} /></td>
                    <td>{w.deadline ?? "—"}</td>
                    <td className="tabular-nums">{w.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Түүх (audit)">
        {data.timeline.length === 0 ? (
          <EmptyState title="Бүртгэл алга" />
        ) : (
          <ul className="space-y-1 text-sm">
            {data.timeline.map((t, i) => (
              <li key={i} className="flex gap-2 text-slate-600">
                <span className="w-40 shrink-0 text-xs tabular-nums text-slate-400">
                  {new Date(t.created_at).toLocaleString("mn-MN")}
                </span>
                <span className="font-mono text-xs">{t.action}</span>
                <span className="text-xs text-slate-400">{t.actor ?? "систем"}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
