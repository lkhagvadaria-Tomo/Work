import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { GateBadge } from "@/components/shared/status";
import type { GateResult } from "@/types/db";

export const metadata = { title: "Улирлын хаалтын бүртгэл" };
export const dynamic = "force-dynamic";

/**
 * Quarter Closure Record (§33) — printable summary. Deliberately named
 * «бүртгэл/гэрчилгээ», NOT a legally binding e-signature (none implemented).
 */
export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();

  const c = await withUser(session.authUid, async (tx) => {
    const { rows } = await tx.query<{
      id: string; approved_at: string; weighted_achievement: string;
      evidence_completeness: string; krs_total: number; krs_closed: number;
      final_gate_result: GateResult; quarter_code: string;
      employee: string; department: string; approver: string;
      objectives: string;
    }>(
      `select qc.id, qc.approved_at, qc.weighted_achievement, qc.evidence_completeness,
              qc.krs_total, qc.krs_closed, qc.final_gate_result,
              q.code as quarter_code, e.full_name as employee, d.name as department,
              ap.full_name as approver,
              (select string_agg(o.objective_code || ' (' || o.weight || '%) — ' || o.title, E'\n' order by o.objective_code)
                 from objectives o where o.employee_id = qc.employee_id and o.quarter_id = qc.quarter_id) as objectives
         from quarter_closures qc
         join quarters q on q.id = qc.quarter_id
         join employees e on e.id = qc.employee_id
         join departments d on d.id = e.department_id
         join employees ap on ap.id = qc.final_approver_id
        where qc.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  });

  if (!c) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-xl border-2 border-slate-300 bg-white p-8 print:border-0">
        <p className="text-center text-xs uppercase tracking-widest text-slate-400">
          Netcapital Financial Group · IPPDD WorkOS
        </p>
        <h1 className="mt-2 text-center text-xl font-bold">Улирлын хаалтын бүртгэл</h1>
        <p className="text-center text-sm text-slate-500">Quarter Closure Record</p>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div><dt className="text-xs font-semibold uppercase text-slate-400">Ажилтан</dt><dd className="font-medium">{c.employee}</dd></div>
          <div><dt className="text-xs font-semibold uppercase text-slate-400">Газар</dt><dd>{c.department}</dd></div>
          <div><dt className="text-xs font-semibold uppercase text-slate-400">Улирал</dt><dd>{c.quarter_code}</dd></div>
          <div><dt className="text-xs font-semibold uppercase text-slate-400">KR үр дүн</dt><dd className="tabular-nums">{c.krs_closed}/{c.krs_total} хаагдсан</dd></div>
          <div><dt className="text-xs font-semibold uppercase text-slate-400">Жинлэсэн гүйцэтгэл</dt><dd className="tabular-nums font-bold">{Number(c.weighted_achievement)}%</dd></div>
          <div><dt className="text-xs font-semibold uppercase text-slate-400">Нотолгооны бүрэн байдал</dt><dd className="tabular-nums">{Number(c.evidence_completeness)}%</dd></div>
          <div><dt className="text-xs font-semibold uppercase text-slate-400">Эцсийн гейт</dt><dd><GateBadge result={c.final_gate_result} /></dd></div>
          <div><dt className="text-xs font-semibold uppercase text-slate-400">Эцсийн батлагч</dt><dd className="font-medium">{c.approver}</dd></div>
          <div><dt className="text-xs font-semibold uppercase text-slate-400">Батласан огноо</dt><dd>{new Date(c.approved_at).toLocaleString("mn-MN")}</dd></div>
          <div><dt className="text-xs font-semibold uppercase text-slate-400">Хаалтын ID</dt><dd className="font-mono text-xs">{c.id}</dd></div>
        </dl>

        {c.objectives && (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase text-slate-400">Зорилтууд</p>
            <pre className="mt-1 whitespace-pre-wrap font-sans text-sm text-slate-700">{c.objectives}</pre>
          </div>
        )}

        <p className="mt-8 border-t border-slate-200 pt-3 text-[11px] text-slate-400">
          Энэ бүртгэл нь IPPDD WorkOS-ийн хаалтын гейт (deterministic Gate Engine) болон эрх бүхий
          хүний sign-off дээр үндэслэсэн дотоод засаглалын бүртгэл бөгөөд хуулийн цахим гарын үсэг биш.
          Session: {session.employee.full_name} · Хэвлэхийн тулд Ctrl/Cmd+P.
        </p>
      </div>
    </div>
  );
}
