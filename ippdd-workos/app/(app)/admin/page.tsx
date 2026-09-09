import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { Card, Field, inputCls } from "@/components/ui";
import {
  createQuarter, setEmployeeActive, setQuarterStatus, updateClosureProfile,
  upsertDepartment, upsertEmployee,
} from "@/actions/admin";
import type { ClosureProfile } from "@/types/db";

export const metadata = { title: "Админ" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await requireSession();
  if (session.employee.system_role !== "ADMIN") redirect("/dashboard");

  const data = await withUser(session.authUid, async (tx) => {
    const [departments, employees, quarters, profiles, audit] = await Promise.all([
      tx.query<{ id: string; code: string; name: string }>(
        "select id, code, name from departments where active order by code"),
      tx.query<{
        id: string; employee_code: string; email: string; full_name: string;
        system_role: string; active: boolean; auth_user_id: string | null;
      }>("select id, employee_code, email, full_name, system_role, active, auth_user_id from employees order by full_name"),
      tx.query<{ id: string; code: string; status: string; start_date: string; end_date: string }>(
        "select id, code, status, start_date, end_date from quarters order by start_date desc"),
      tx.query<ClosureProfile>("select * from closure_profiles order by work_type"),
      tx.query<{ action: string; entity_type: string; created_at: string; actor: string | null }>(
        `select a.action, a.entity_type, a.created_at, e.full_name as actor
           from audit_logs a left join employees e on e.id = a.actor_id
          order by a.created_at desc limit 30`),
    ]);
    return {
      departments: departments.rows, employees: employees.rows,
      quarters: quarters.rows, profiles: profiles.rows, audit: audit.rows,
    };
  });

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold">Системийн тохиргоо</h1>

      <Card title="Ажилтнууд">
        <div className="overflow-x-auto">
          <table className="data w-full">
            <thead><tr><th>Код</th><th>Нэр</th><th>И-мэйл</th><th>Эрх</th><th>Google холбогдсон</th><th>Төлөв</th><th></th></tr></thead>
            <tbody>
              {data.employees.map((e) => (
                <tr key={e.id}>
                  <td className="font-mono text-xs">{e.employee_code}</td>
                  <td>{e.full_name}</td>
                  <td className="text-xs">{e.email}</td>
                  <td className="text-xs font-semibold">{e.system_role}</td>
                  <td className="text-xs">{e.auth_user_id ? "✓ тийм" : "— үгүй"}</td>
                  <td className="text-xs">{e.active ? "идэвхтэй" : "идэвхгүй"}</td>
                  <td>
                    <form action={setEmployeeActive.bind(null, e.id, !e.active)}>
                      <button className="text-xs text-blue-700 underline">
                        {e.active ? "идэвхгүй болгох" : "идэвхжүүлэх"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <details className="mt-3 rounded-md border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-medium">+ Ажилтан нэмэх / шинэчлэх (и-мэйлээр)</summary>
          <form action={upsertEmployee} className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Ажилтны код *"><input name="employee_code" required className={inputCls} /></Field>
            <Field label="И-мэйл *" hint="Google Workspace и-мэйл — нэвтрэх эрх үүнд холбогдоно">
              <input name="email" type="email" required className={inputCls} />
            </Field>
            <Field label="Нэр *"><input name="full_name" required className={inputCls} /></Field>
            <Field label="Газар *">
              <select name="department_id" required className={inputCls}>
                {data.departments.map((d) => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
              </select>
            </Field>
            <Field label="Албан тушаал"><input name="position_title" className={inputCls} /></Field>
            <Field label="Менежер">
              <select name="manager_id" className={inputCls}>
                <option value="">—</option>
                {data.employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </Field>
            <Field label="Системийн эрх *">
              <select name="system_role" required className={inputCls}>
                {["EMPLOYEE", "REVIEWER", "APPROVER", "MANAGER", "DIRECTOR", "ADMIN"].map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <div className="flex items-end">
              <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">Хадгалах</button>
            </div>
          </form>
        </details>
      </Card>

      <Card title="Улирлууд">
        <table className="data w-full">
          <thead><tr><th>Код</th><th>Хугацаа</th><th>Төлөв</th><th>Өөрчлөх</th></tr></thead>
          <tbody>
            {data.quarters.map((q) => (
              <tr key={q.id}>
                <td className="font-mono text-xs">{q.code}</td>
                <td className="text-xs">{q.start_date} → {q.end_date}</td>
                <td className="text-xs font-semibold">{q.status}</td>
                <td>
                  <form action={setQuarterStatus.bind(null, q.id)} className="flex items-center gap-2">
                    <select name="status" defaultValue={q.status} className="rounded border border-slate-300 px-1.5 py-0.5 text-xs">
                      {["PLANNING", "ACTIVE", "CLOSING", "CLOSED", "ARCHIVED"].map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <button className="text-xs text-blue-700 underline">хадгалах</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <details className="mt-3 rounded-md border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-medium">+ Шинэ улирал үүсгэх</summary>
          <form action={createQuarter} className="mt-3 flex flex-wrap items-end gap-3">
            <Field label="Он *"><input name="year" type="number" min={2020} max={2100} required className={inputCls} /></Field>
            <Field label="Улирал *">
              <select name="quarter" required className={inputCls}>
                <option>1</option><option>2</option><option>3</option><option>4</option>
              </select>
            </Field>
            <Field label="Эхлэх *"><input name="start_date" type="date" required className={inputCls} /></Field>
            <Field label="Дуусах *"><input name="end_date" type="date" required className={inputCls} /></Field>
            <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">Үүсгэх</button>
          </form>
          <p className="mt-2 text-[11px] text-slate-400">Шинэ улирал PLANNING төлөвтэй үүснэ; идэвхжүүлэхдээ дээрх төлөвөөр ACTIVE болгоно.</p>
        </details>
      </Card>

      <Card title="Газрууд">
        <table className="data w-full">
          <thead><tr><th>Код</th><th>Нэр</th></tr></thead>
          <tbody>
            {data.departments.map((d) => (
              <tr key={d.id}><td className="font-mono text-xs">{d.code}</td><td>{d.name}</td></tr>
            ))}
          </tbody>
        </table>
        <details className="mt-3 rounded-md border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-medium">+ Газар нэмэх / шинэчлэх (кодоор)</summary>
          <form action={upsertDepartment} className="mt-3 flex flex-wrap items-end gap-3">
            <Field label="Код *" hint="2–20 том үсэг/тоо/_"><input name="code" required pattern="[A-Z0-9_]{2,20}" className={inputCls} /></Field>
            <Field label="Нэр *"><input name="name" required className={inputCls} /></Field>
            <Field label="Захирал">
              <select name="director_employee_id" className={inputCls}>
                <option value="">—</option>
                {data.employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </Field>
            <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">Хадгалах</button>
          </form>
        </details>
      </Card>

      <Card title="Хаалтын профайл (ажлын төрөл тус бүрийн гейт шаардлага)">
        <div className="overflow-x-auto">
          <table className="data w-full">
            <thead>
              <tr>
                <th>Төрөл</th><th>Deliv.</th><th>SelfQC</th><th>Батлал</th>
                <th>Хэрэгж.</th><th>Валид.</th><th>Метрик</th><th>Нотолгоо</th>
                <th>Min ev.</th><th>Хялбар</th><th></th>
              </tr>
            </thead>
            <tbody>
              {data.profiles.map((p) => (
                <tr key={p.id}>
                  <td className="text-xs font-semibold">{p.work_type}</td>
                  <FormCells p={p} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Өөрчлөлт нь дараагийн гейт ажиллагаанаас мөрдөгдөнө. Бүх өөрчлөлт audit log-д бүртгэгдэнэ.
        </p>
      </Card>

      <Card title="Сүүлийн audit бүртгэлүүд">
        <ul className="space-y-1 text-sm">
          {data.audit.map((a, i) => (
            <li key={i} className="flex gap-2 text-slate-600">
              <span className="w-40 shrink-0 text-xs tabular-nums text-slate-400">
                {new Date(a.created_at).toLocaleString("mn-MN")}
              </span>
              <span className="font-mono text-xs">{a.action}</span>
              <span className="text-xs">{a.entity_type}</span>
              <span className="text-xs text-slate-400">{a.actor ?? "систем"}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function FormCells({ p }: { p: ClosureProfile }) {
  const box = (name: string, checked: boolean) => (
    <td>
      <input type="checkbox" name={name} defaultChecked={checked} form={`cp-${p.id}`} className="h-3.5 w-3.5" aria-label={name} />
    </td>
  );
  return (
    <>
      {box("requires_deliverables", p.requires_deliverables)}
      {box("requires_self_qc", p.requires_self_qc)}
      {box("requires_approval", p.requires_approval)}
      {box("requires_implementation", p.requires_implementation)}
      {box("requires_validation", p.requires_validation)}
      {box("requires_metric", p.requires_metric)}
      {box("requires_evidence", p.requires_evidence)}
      <td>
        <input type="number" name="min_evidence_count" defaultValue={p.min_evidence_count}
          min={0} max={10} form={`cp-${p.id}`} className="w-14 rounded border border-slate-300 px-1 py-0.5 text-xs" aria-label="min evidence" />
      </td>
      {box("simplified_closure", p.simplified_closure)}
      <td>
        <form id={`cp-${p.id}`} action={updateClosureProfile}>
          <input type="hidden" name="work_type" value={p.work_type} />
          <button className="text-xs text-blue-700 underline">хадгалах</button>
        </form>
      </td>
    </>
  );
}
