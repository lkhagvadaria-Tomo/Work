import { requireSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { Card, Field, inputCls } from "@/components/ui";
import { createWorkItem } from "@/actions/work";

export const metadata = { title: "Шинэ ажил" };
export const dynamic = "force-dynamic";

const WORK_TYPES = [
  "POLICY", "PROCEDURE", "STANDARD", "GUIDELINE", "PROCESS", "PROCESS_IMPROVEMENT",
  "REPORT", "ANALYSIS", "CHANGE_PROPOSAL", "AI_AGENT", "AUTOMATION", "PILOT",
  "TRAINING", "COMMITTEE", "PROJECT", "SPRINT", "KPI", "BAU", "AUDIT_ACTION",
  "MANAGEMENT_ASSIGNMENT", "OTHER",
];

export default async function NewWorkPage({
  searchParams,
}: {
  searchParams: Promise<{ kr?: string }>;
}) {
  const session = await requireSession();
  const { kr } = await searchParams;

  const data = await withUser(session.authUid, async (tx) => {
    const [krs, people] = await Promise.all([
      tx.query<{ id: string; label: string }>(
        `select k.id, o.objective_code || '-' || k.kr_code || ' · ' || left(k.title, 80) as label
           from key_results k join objectives o on o.id = k.objective_id
          where o.employee_id = $1 and k.status not in ('CLOSED','CANCELLED')
          order by label`,
        [session.employee.id],
      ),
      tx.query<{ id: string; full_name: string; system_role: string }>(
        "select id, full_name, system_role from employees where active and id <> $1 order by full_name",
        [session.employee.id],
      ),
    ]);
    return { krs: krs.rows, people: people.rows };
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-lg font-bold">Шинэ ажил үүсгэх</h1>
      <Card>
        <form action={createWorkItem} className="space-y-4">
          <Field label="Нэр *">
            <input name="title" required minLength={3} maxLength={300} className={inputCls} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ажлын төрөл *" hint="Төрөл нь хаалтын профайлыг (шаардлагатай гейтүүдийг) тодорхойлно">
              <select name="work_type" required className={inputCls}>
                {WORK_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Зэрэглэл">
              <select name="priority" defaultValue="MEDIUM" className={inputCls}>
                <option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option>
              </select>
            </Field>
          </div>
          <Field label="Холбогдох KR">
            <select name="key_result_id" defaultValue={kr ?? ""} className={inputCls}>
              <option value="">— KR-гүй (BAU г.м.) —</option>
              {data.krs.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </Field>
          <Field label="Definition of Done" hint="Ямар нөхцөлд «хийгдсэн» гэж үзэхийг тодорхой бич">
            <textarea name="definition_of_done" rows={3} maxLength={4000} className={inputCls} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Хугацаа (deadline)">
              <input name="deadline" type="date" className={inputCls} />
            </Field>
            <Field label="Хянагч (reviewer)">
              <select name="reviewer_id" className={inputCls}>
                <option value="">— сонгох —</option>
                {data.people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </Field>
            <Field label="Батлагч (approver)" hint="Өөрийгөө сонгох боломжгүй — эрх мэдлийн тусгаарлалт">
              <select name="approver_id" className={inputCls}>
                <option value="">— сонгох —</option>
                {data.people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </Field>
          </div>
          <div className="flex gap-6 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="implementation_required" className="h-4 w-4" />
              Хэрэгжилт шаардана (G5)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="validation_required" className="h-4 w-4" />
              Метрик баталгаажуулалт шаардана (G6)
            </label>
          </div>
          <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Үүсгэх
          </button>
        </form>
      </Card>
    </div>
  );
}
