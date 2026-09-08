import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { Card, EmptyState, Field, inputCls } from "@/components/ui";
import { GateBadge, SeverityBadge, WorkStatusBadge } from "@/components/shared/status";
import { ownerPrimaryAction } from "@/lib/workflow/state-machine";
import {
  startWork, submitForReview, resubmit, recordSelfQc, requestApproval,
  recordImplementation, recordMetricActual, validateMetric,
  submitForClosure, finalizeWorkClosure, decideReview, decideApproval,
} from "@/actions/work";
import { addDeliverable, addEvidence, addRequirement, markDeliverableFinal, removeEvidence, verifyEvidence } from "@/actions/evidence";
import type {
  Approval, ClosureProfile, Deliverable, DeliverableRequirement, Evidence,
  GateFinding, GateRun, ImplementationRecord, MetricValidation, Review, WorkItem,
} from "@/types/db";

export const metadata = { title: "Ажлын дэлгэрэнгүй" };
export const dynamic = "force-dynamic";

const EVIDENCE_TYPES = [
  "DOCUMENT", "SPREADSHEET", "PRESENTATION", "SCREENSHOT", "REPORT", "EMAIL",
  "MEETING_DECISION", "UAT", "PRODUCTION", "METRIC", "APPROVAL", "TRAINING",
  "SYSTEM_LOG", "OTHER",
];

export default async function WorkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const me = session.employee.id;

  const data = await withUser(session.authUid, async (tx) => {
    const work = (
      await tx.query<WorkItem & { owner_name: string; reviewer_name: string | null; approver_name: string | null; kr_label: string | null }>(
        `select w.*, o1.full_name as owner_name, r.full_name as reviewer_name,
                a.full_name as approver_name,
                (select ob.objective_code || '-' || k.kr_code
                   from key_results k join objectives ob on ob.id = k.objective_id
                  where k.id = w.key_result_id) as kr_label
           from work_items w
           join employees o1 on o1.id = w.owner_id
           left join employees r on r.id = w.reviewer_id
           left join employees a on a.id = w.approver_id
          where w.id = $1`,
        [id],
      )
    ).rows[0];
    if (!work) return null;

    const [profile, reqs, dels, evs, revs, apps, impls, mets, gate, findings, timeline, closure] =
      await Promise.all([
        tx.query<ClosureProfile>("select * from closure_profiles where work_type = $1", [work.work_type]),
        tx.query<DeliverableRequirement>(
          "select * from deliverable_requirements where work_item_id = $1 order by sequence", [id]),
        tx.query<Deliverable>("select * from deliverables where work_item_id = $1 order by created_at", [id]),
        tx.query<Evidence & { creator_name: string }>(
          `select e.*, c.full_name as creator_name from evidence e
            join employees c on c.id = e.created_by
           where e.work_item_id = $1 order by e.created_at`, [id]),
        tx.query<Review & { reviewer_name: string }>(
          `select r.*, e.full_name as reviewer_name from reviews r
            join employees e on e.id = r.reviewer_id
           where r.work_item_id = $1 order by r.created_at`, [id]),
        tx.query<Approval & { approver_name: string }>(
          `select a.*, e.full_name as approver_name from approvals a
            join employees e on e.id = a.approver_id
           where a.work_item_id = $1 order by a.created_at`, [id]),
        tx.query<ImplementationRecord>(
          "select * from implementation_records where work_item_id = $1 order by created_at", [id]),
        tx.query<MetricValidation>(
          "select * from metric_validations where work_item_id = $1", [id]),
        tx.query<GateRun>(
          `select * from gate_runs where scope_type='WORK_ITEM' and scope_id=$1
            order by started_at desc limit 1`, [id]),
        tx.query<GateFinding>(
          `select f.* from gate_findings f join gate_runs g on g.id=f.gate_run_id
            where g.scope_type='WORK_ITEM' and g.scope_id=$1
            order by f.created_at desc limit 30`, [id]),
        tx.query<{ action: string; created_at: string; actor: string | null; new_values: unknown }>(
          `select a.action, a.created_at, e.full_name as actor, a.new_values
             from audit_logs a left join employees e on e.id = a.actor_id
            where a.entity_type = 'work_item' and a.entity_id = $1
            order by a.created_at desc limit 30`, [id]),
        tx.query<{ id: string; status: string; final_comment: string | null }>(
          `select id, status, final_comment from closure_requests
            where scope_type='WORK_ITEM' and scope_id=$1 order by created_at desc limit 1`, [id]),
      ]);

    return {
      work, profile: profile.rows[0] ?? null, reqs: reqs.rows, dels: dels.rows,
      evs: evs.rows, revs: revs.rows, apps: apps.rows, impls: impls.rows,
      mets: mets.rows, gate: gate.rows[0] ?? null, findings: findings.rows,
      timeline: timeline.rows, closure: closure.rows[0] ?? null,
    };
  });

  if (!data) notFound();
  const { work } = data;
  const isOwner = work.owner_id === me;
  const isReviewer = work.reviewer_id === me;
  const isApprover = work.approver_id === me;
  const isDirector = ["DIRECTOR", "ADMIN"].includes(session.employee.system_role);
  const simplified = data.profile?.simplified_closure ?? false;
  const primary = isOwner ? ownerPrimaryAction(work.status, { simplified }) : null;
  const hasSelfQc = data.revs.some((r) => r.review_type === "SELF_QC" && r.decision === "PASS");
  const myPendingReview = data.revs.find((r) => r.reviewer_id === me && r.decision === "PENDING");
  const myPendingApproval = data.apps.find((a) => a.approver_id === me && a.decision === "PENDING");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      {/* Header + context action */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">
            <Link href="/work" className="underline">Миний ажил</Link> · {work.work_type}
            {work.kr_label && <> · KR: <strong>{work.kr_label}</strong></>}
          </p>
          <h1 className="mt-1 text-lg font-bold">
            <span className="font-mono text-base text-slate-500">{work.work_code}</span> {work.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <WorkStatusBadge status={work.status} />
            <span>Эзэмшигч: <strong>{work.owner_name}</strong></span>
            <span>Хянагч: <strong>{work.reviewer_name ?? "—"}</strong></span>
            <span>Батлагч: <strong>{work.approver_name ?? "—"}</strong></span>
            <span className={work.deadline && work.deadline < today && work.status !== "CLOSED" ? "font-semibold text-red-700" : ""}>
              Хугацаа: <strong>{work.deadline ?? "—"}</strong>
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {primary?.action === "START_WORK" && (
            <form action={startWork.bind(null, work.id)}>
              <button className="rounded-md bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white">START WORK</button>
            </form>
          )}
          {primary?.action === "SUBMIT_FOR_REVIEW" && (
            <form action={submitForReview.bind(null, work.id)}>
              <button className="rounded-md bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white">SUBMIT FOR REVIEW</button>
            </form>
          )}
          {primary?.action === "RESUBMIT" && (
            <form action={resubmit.bind(null, work.id)}>
              <button className="rounded-md bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white">RESUBMIT</button>
            </form>
          )}
          {primary?.action === "REQUEST_APPROVAL" && (
            <form action={requestApproval.bind(null, work.id)}>
              <input type="hidden" name="approval_type" value="DIRECTOR" />
              <button className="rounded-md bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white">REQUEST APPROVAL</button>
            </form>
          )}
          {primary?.action === "SUBMIT_FOR_CLOSURE" && (
            <form action={submitForClosure.bind(null, work.id)}>
              <button className="rounded-md bg-emerald-700 px-3.5 py-1.5 text-sm font-medium text-white">SUBMIT FOR CLOSURE</button>
            </form>
          )}
          {isOwner && !hasSelfQc && !["NOT_STARTED", "CLOSED", "CANCELLED"].includes(work.status) && (
            <form action={recordSelfQc.bind(null, work.id)}>
              <button className="rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700">
                Self QC PASS бүртгэх
              </button>
            </form>
          )}
        </div>
      </div>

      {work.definition_of_done && (
        <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          <strong className="text-xs uppercase text-slate-400">Definition of Done:</strong>{" "}
          {work.definition_of_done}
        </p>
      )}

      {/* Reviewer decision */}
      {isReviewer && myPendingReview && (
        <Card title={`Таны шийдвэр хүлээгдэж байна — ${myPendingReview.review_type} review`} className="border-indigo-300">
          <form action={decideReview.bind(null, myPendingReview.id)} className="flex flex-wrap items-end gap-3">
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
      )}

      {/* Approver decision */}
      {isApprover && myPendingApproval && (
        <Card title={`Таны батлал хүлээгдэж байна — ${myPendingApproval.approval_type} (хувилбар: ${myPendingApproval.deliverable_version ?? "—"})`} className="border-amber-300">
          <form action={decideApproval.bind(null, myPendingApproval.id)} className="flex flex-wrap items-end gap-3">
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
      )}

      {/* Closure sign-off */}
      {data.closure?.status === "READY_FOR_SIGNOFF" && (isApprover || isDirector) && !isOwner && (
        <Card title="Хаалтын sign-off — гейт давсан, хүний шийдвэр хүлээгдэж байна" className="border-emerald-300">
          <form action={finalizeWorkClosure.bind(null, data.closure.id)} className="flex flex-wrap items-end gap-3">
            <label className="block flex-1 text-xs font-semibold text-slate-600">
              Тайлбар (RETURN/REJECT-д заавал)
              <input name="comment" className={`mt-1 ${inputCls}`} />
            </label>
            <div className="flex gap-2">
              <button name="decision" value="APPROVE" className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white">CLOSE (APPROVE)</button>
              <button name="decision" value="RETURN" className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-white">RETURN</button>
              <button name="decision" value="REJECT" className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white">REJECT</button>
            </div>
          </form>
        </Card>
      )}
      {data.closure && data.closure.status !== "READY_FOR_SIGNOFF" && (
        <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          Хаалтын хүсэлт: <strong>{data.closure.status}</strong>
          {data.closure.final_comment && <> — {data.closure.final_comment}</>}
        </p>
      )}

      {/* Gate */}
      <Card title="Хаалтын гейт (G1–G7)">
        {!data.gate ? (
          <EmptyState title="Гейт хараахан ажиллаагүй" hint="SUBMIT FOR CLOSURE дарж гейт ажиллуулна — ажилтан CLOSED-ийг өөрөө тавьдаггүй." />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <GateBadge result={data.gate.result} />
              <span className="text-sm text-slate-600">
                {data.gate.passed_checks} PASS · {data.gate.warning_checks} WARN · {data.gate.failed_checks} FAIL
                <span className="ml-2 text-xs text-slate-400">
                  {new Date(data.gate.started_at).toLocaleString("mn-MN")}
                </span>
              </span>
            </div>
            <ul className="space-y-2">
              {data.findings.filter((f) => f.gate_run_id === data.gate!.id).map((f) => (
                <li key={f.id} className="rounded-md border border-slate-200 p-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={f.severity} />
                    <GateBadge result={f.result} />
                    <span className="font-medium">{f.title}</span>
                  </div>
                  {f.recommended_action && <p className="mt-1 text-xs text-slate-500">→ {f.recommended_action}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Deliverables */}
        <Card title={`Deliverables (${data.dels.filter((d) => d.final_version).length}/${data.reqs.filter((r) => r.required).length} эцсийн)`}>
          <ul className="space-y-2">
            {data.reqs.map((r) => {
              const attached = data.dels.filter((d) => d.requirement_id === r.id);
              const final = attached.find((d) => d.final_version);
              return (
                <li key={r.id} className="rounded-md border border-slate-200 p-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {r.sequence}. {r.name}
                      {r.required && <span className="ml-1 text-red-600" title="заавал">*</span>}
                    </span>
                    {final ? (
                      <GateBadge result="PASS" />
                    ) : attached.length > 0 ? (
                      <span className="text-xs text-amber-700">драфт {attached.length}</span>
                    ) : (
                      <GateBadge result="FAIL" />
                    )}
                  </div>
                  {attached.map((d) => (
                    <div key={d.id} className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="font-mono font-semibold">{d.version}</span>
                      {d.drive_url ? (
                        <a href={d.drive_url} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                          {d.drive_name ?? d.name}
                        </a>
                      ) : (
                        <span>{d.name}</span>
                      )}
                      <span className="rounded bg-slate-100 px-1">{d.status}</span>
                      {d.final_version && <span className="rounded bg-emerald-100 px-1 font-semibold text-emerald-700">FINAL</span>}
                      {!d.final_version && isOwner && work.status !== "CLOSED" && (
                        <form action={markDeliverableFinal.bind(null, d.id, work.id)}>
                          <button className="text-blue-700 underline">эцсийн болгох</button>
                        </form>
                      )}
                      {d.approved_modified_time && d.drive_modified_time &&
                        new Date(d.drive_modified_time) > new Date(d.approved_modified_time) && (
                          <span className="rounded bg-red-100 px-1 font-semibold text-red-700"
                            title="Drive metadata харьцуулалт — криптограф баталгаа биш">
                            ⚠ БАТЛАСНААС ХОЙШ ӨӨРЧЛӨГДСӨН БАЙЖ БОЛЗОШГҮЙ
                          </span>
                        )}
                    </div>
                  ))}
                </li>
              );
            })}
            {data.dels.filter((d) => !d.requirement_id).map((d) => (
              <li key={d.id} className="rounded-md border border-slate-100 p-2.5 text-xs text-slate-600">
                <span className="font-mono font-semibold">{d.version}</span>{" "}
                {d.drive_url ? <a className="text-blue-700 underline" href={d.drive_url} target="_blank" rel="noreferrer">{d.name}</a> : d.name}
                {d.final_version && <span className="ml-1 rounded bg-emerald-100 px-1 font-semibold text-emerald-700">FINAL</span>}
              </li>
            ))}
          </ul>

          {isOwner && work.status !== "CLOSED" && (
            <details className="mt-3 rounded-md border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">+ Deliverable хавсаргах</summary>
              <form action={addDeliverable} className="mt-3 space-y-3">
                <input type="hidden" name="work_item_id" value={work.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Шаардлага">
                    <select name="requirement_id" className={inputCls}>
                      <option value="">— чөлөөт deliverable —</option>
                      {data.reqs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Нэр *"><input name="name" required className={inputCls} /></Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Drive линк" hint="drive.google.com / docs.google.com">
                    <input name="drive_url" type="url" className={inputCls} />
                  </Field>
                  <Field label="Хувилбар (vX.Y)" hint="v0.x драфт · v0.9 review · v1.0+ батлагдсан">
                    <input name="version" defaultValue="v0.1" pattern="v\d+\.\d+" className={inputCls} />
                  </Field>
                  <label className="flex items-end gap-2 pb-2 text-sm">
                    <input type="checkbox" name="final_version" className="h-4 w-4" /> Эцсийн хувилбар
                  </label>
                </div>
                <button className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Хавсаргах</button>
              </form>
              <form action={addRequirement} className="mt-3 flex items-end gap-2 border-t border-slate-100 pt-3">
                <input type="hidden" name="work_item_id" value={work.id} />
                <Field label="Шинэ шаардлага нэмэх"><input name="name" className={inputCls} /></Field>
                <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Нэмэх</button>
              </form>
            </details>
          )}
        </Card>

        {/* Evidence */}
        <Card title={`Нотолгоо (${data.evs.length})`}>
          {data.evs.length === 0 ? (
            <EmptyState title="Нотолгоо бүртгэгдээгүй" hint="Хаалтын гейт нотолгоо шаардана." />
          ) : (
            <ul className="space-y-2">
              {data.evs.map((e) => (
                <li key={e.id} className="rounded-md border border-slate-200 p-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-slate-100 px-1.5 text-[11px] font-semibold">{e.evidence_type}</span>
                    {e.drive_url || e.external_url ? (
                      <a href={e.drive_url ?? e.external_url ?? "#"} target="_blank" rel="noreferrer"
                        className="font-medium text-blue-700 underline">{e.title}</a>
                    ) : (
                      <span className="font-medium">{e.title}</span>
                    )}
                    {e.verified ? (
                      <span className="rounded bg-emerald-100 px-1.5 text-[11px] font-semibold text-emerald-700">✓ баталгаажсан</span>
                    ) : (
                      <span className="rounded bg-amber-50 px-1.5 text-[11px] text-amber-700">баталгаажаагүй</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>{e.creator_name} · {new Date(e.created_at).toLocaleDateString("mn-MN")}</span>
                    {!e.verified && e.created_by !== me && (isReviewer || isApprover || isDirector) && (
                      <form action={verifyEvidence.bind(null, e.id, work.id)}>
                        <button className="text-emerald-700 underline">баталгаажуулах</button>
                      </form>
                    )}
                    {!e.verified && e.created_by === me && work.status !== "CLOSED" && (
                      <form action={removeEvidence.bind(null, e.id, work.id)}>
                        <button className="text-red-600 underline">устгах</button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {work.status !== "CLOSED" && (
            <details className="mt-3 rounded-md border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">+ Нотолгоо хавсаргах</summary>
              <form action={addEvidence} className="mt-3 space-y-3">
                <input type="hidden" name="work_item_id" value={work.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Төрөл">
                    <select name="evidence_type" className={inputCls}>
                      {EVIDENCE_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="Нэр *"><input name="title" required className={inputCls} /></Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Drive линк"><input name="drive_url" type="url" className={inputCls} /></Field>
                  <Field label="Гадаад линк (https)"><input name="external_url" type="url" className={inputCls} /></Field>
                </div>
                <Field label="Тайлбар"><textarea name="description" rows={2} className={inputCls} /></Field>
                <button className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Хавсаргах</button>
              </form>
            </details>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Reviews & approvals */}
        <Card title="Review ба батлал">
          <h3 className="text-xs font-semibold uppercase text-slate-400">Reviews</h3>
          {data.revs.length === 0 ? <p className="mt-1 text-sm text-slate-500">Review алга</p> : (
            <table className="data mt-1 w-full">
              <thead><tr><th>Төрөл</th><th>Хянагч</th><th>Шийдвэр</th><th>Огноо</th></tr></thead>
              <tbody>
                {data.revs.map((r) => (
                  <tr key={r.id}>
                    <td className="text-xs">{r.review_type}</td>
                    <td className="text-xs">{r.reviewer_name}</td>
                    <td>
                      <GateBadge result={r.decision === "PASS" ? "PASS" : r.decision === "PENDING" ? "NOT_APPLICABLE" : "FAIL"} />
                      {r.comment && <p className="mt-0.5 text-xs text-slate-500">{r.comment}</p>}
                    </td>
                    <td className="text-xs">{r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString("mn-MN") : "хүлээгдэж буй"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h3 className="mt-4 text-xs font-semibold uppercase text-slate-400">Approvals</h3>
          {data.apps.length === 0 ? <p className="mt-1 text-sm text-slate-500">Батлал алга</p> : (
            <table className="data mt-1 w-full">
              <thead><tr><th>Төрөл</th><th>Батлагч</th><th>Хувилбар</th><th>Шийдвэр</th><th>Огноо</th></tr></thead>
              <tbody>
                {data.apps.map((a) => (
                  <tr key={a.id}>
                    <td className="text-xs">{a.approval_type}</td>
                    <td className="text-xs">{a.approver_name}</td>
                    <td className="font-mono text-xs">{a.deliverable_version ?? "—"}</td>
                    <td>
                      <GateBadge result={a.decision === "APPROVE" ? "PASS" : a.decision === "PENDING" ? "NOT_APPLICABLE" : "FAIL"} />
                      {a.comment && <p className="mt-0.5 text-xs text-slate-500">{a.comment}</p>}
                    </td>
                    <td className="text-xs">{a.approved_at ? new Date(a.approved_at).toLocaleDateString("mn-MN") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Implementation + metrics */}
        <Card title="Хэрэгжилт ба метрик">
          <h3 className="text-xs font-semibold uppercase text-slate-400">
            Хэрэгжилт {work.implementation_required ? "(шаардлагатай — G5)" : "(шаардахгүй)"}
          </h3>
          {data.impls.length === 0 ? <p className="mt-1 text-sm text-slate-500">Бүртгэл алга</p> : (
            <ul className="mt-1 space-y-1 text-sm">
              {data.impls.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-1.5 text-[11px] font-semibold ${
                    ["LIVE", "PILOT"].includes(i.implementation_status)
                      ? "bg-emerald-100 text-emerald-700"
                      : ["FAILED", "ROLLED_BACK"].includes(i.implementation_status)
                        ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
                  }`}>{i.implementation_status}</span>
                  <span className="text-xs text-slate-500">{i.environment ?? ""} {i.comment ?? ""}</span>
                </li>
              ))}
            </ul>
          )}
          {isOwner && !["CLOSED", "CANCELLED"].includes(work.status) && (
            <form action={recordImplementation.bind(null, work.id)} className="mt-2 flex flex-wrap items-end gap-2">
              <Field label="Төлөв">
                <select name="implementation_status" className={inputCls}>
                  {["IN_PROGRESS", "PILOT", "LIVE", "FAILED", "ROLLED_BACK", "NOT_REQUIRED"].map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Орчин"><input name="environment" placeholder="production / UAT…" className={inputCls} /></Field>
              <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Бүртгэх</button>
            </form>
          )}

          <h3 className="mt-4 text-xs font-semibold uppercase text-slate-400">Метрик баталгаажуулалт (G6)</h3>
          {data.mets.length === 0 ? <p className="mt-1 text-sm text-slate-500">Метрик алга</p> : (
            <ul className="mt-1 space-y-2">
              {data.mets.map((m) => (
                <li key={m.id} className="rounded-md border border-slate-200 p-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.metric_name}</span>
                    <span className="tabular-nums text-xs text-slate-500">
                      зорилт {m.target_operator} {m.target_value} {m.unit} · бодит: {m.actual_value ?? "—"}
                    </span>
                    <GateBadge result={m.validation_status === "PASS" ? "PASS" : m.validation_status === "FAIL" ? "FAIL" : "NOT_APPLICABLE"} />
                  </div>
                  {!["CLOSED", "CANCELLED"].includes(work.status) && (
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      {isOwner && (
                        <form action={recordMetricActual.bind(null, m.id)} className="flex items-end gap-2">
                          <label className="text-xs font-semibold text-slate-600">
                            Бодит утга
                            <input name="actual_value" type="number" step="any" defaultValue={m.actual_value ?? ""}
                              className="mt-1 block w-28 rounded-md border border-slate-300 px-2 py-1 text-sm" />
                          </label>
                          <button className="rounded border border-slate-300 px-2 py-1 text-xs">Хадгалах</button>
                        </form>
                      )}
                      {(isReviewer || isApprover || isDirector) && m.validation_status === "PENDING" && (
                        <form action={validateMetric.bind(null, m.id)} className="flex gap-1">
                          <button name="validation_status" value="PASS" className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white">PASS</button>
                          <button name="validation_status" value="FAIL" className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white">FAIL</button>
                        </form>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Timeline */}
      <Card title="Түүх (audit trail)">
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
      </Card>
    </div>
  );
}
