import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { Card, EmptyState } from "@/components/ui";
import { WorkStatusBadge } from "@/components/shared/status";
import type { WorkStatus, WorkType } from "@/types/db";

export const metadata = { title: "Миний ажил" };
export const dynamic = "force-dynamic";

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "Бүгд" },
  { key: "due-soon", label: "Хугацаа дөхсөн" },
  { key: "overdue", label: "Хугацаа хэтэрсэн" },
  { key: "waiting-review", label: "Review хүлээж буй" },
  { key: "returned", label: "Буцаагдсан" },
  { key: "waiting", label: "Батлал хүлээж буй" },
  { key: "no-evidence", label: "Нотолгоогүй" },
  { key: "ready", label: "Хаахад бэлэн" },
  { key: "closed", label: "Хаагдсан" },
];

interface Row {
  id: string; work_code: string; title: string; work_type: WorkType;
  status: WorkStatus; priority: string; deadline: string | null;
  kr_label: string | null; evidence: string; owner_name: string;
  closure_status: string | null;
}

export default async function WorkListPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; q?: string }>;
}) {
  const session = await requireSession();
  const { f = "all", q = "" } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);

  const rows = await withUser(session.authUid, async (tx) => {
    const { rows } = await tx.query<Row>(
      `select w.id, w.work_code, w.title, w.work_type, w.status, w.priority, w.deadline,
              (select o.objective_code || '-' || k.kr_code
                 from key_results k join objectives o on o.id = k.objective_id
                where k.id = w.key_result_id) as kr_label,
              (select count(*) from evidence e where e.work_item_id = w.id) as evidence,
              e2.full_name as owner_name,
              (select cr.status::text from closure_requests cr
                where cr.scope_type = 'WORK_ITEM' and cr.scope_id = w.id
                order by cr.created_at desc limit 1) as closure_status
         from work_items w join employees e2 on e2.id = w.owner_id
        where ($1 = '' or w.title ilike '%'||$1||'%' or w.work_code ilike '%'||$1||'%')
        order by w.deadline nulls last, w.work_code`,
      [q],
    );
    return rows;
  });

  const soon = addDays(today, 7);
  const filtered = rows.filter((w) => {
    switch (f) {
      case "due-soon": return !isTerminal(w.status) && w.deadline != null && w.deadline >= today && w.deadline <= soon;
      case "overdue": return !isTerminal(w.status) && w.deadline != null && w.deadline < today;
      case "waiting-review": return ["SUBMITTED", "UNDER_REVIEW"].includes(w.status);
      case "returned": return ["RETURNED", "REJECTED", "BLOCKED"].includes(w.status);
      case "waiting": return ["WAITING_APPROVAL", "REVIEW_PASSED"].includes(w.status);
      case "no-evidence": return !isTerminal(w.status) && Number(w.evidence) === 0;
      case "ready": return w.closure_status === "READY_FOR_SIGNOFF";
      case "closed": return w.status === "CLOSED";
      default: return true;
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold">Миний ажил</h1>
        <Link href="/work/new" className="rounded-md bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
          + Шинэ ажил
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((x) => (
          <Link
            key={x.key}
            href={`/work?f=${x.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              f === x.key
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {x.label}
          </Link>
        ))}
        <form className="ml-auto" action="/work" method="get">
          <input type="hidden" name="f" value={f} />
          <input
            name="q" defaultValue={q} placeholder="Хайх (код, нэр)…"
            className="w-56 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
            aria-label="Хайлт"
          />
        </form>
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState title="Тохирох ажил алга" hint="Шүүлтүүрээ өөрчлөх эсвэл шинэ ажил үүсгэнэ үү." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data w-full">
              <thead>
                <tr>
                  <th>Код</th><th>Нэр</th><th>Төрөл</th><th>KR</th><th>Эзэмшигч</th>
                  <th>Зэрэглэл</th><th>Төлөв</th><th>Хугацаа</th><th>Нотолгоо</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((w) => (
                  <tr key={w.id}>
                    <td><Link href={`/work/${w.id}`} className="font-mono text-xs font-semibold text-blue-700 underline">{w.work_code}</Link></td>
                    <td className="max-w-md"><span className="line-clamp-2">{w.title}</span></td>
                    <td className="text-xs">{w.work_type}</td>
                    <td className="text-xs">{w.kr_label ?? "—"}</td>
                    <td className="text-xs">{w.owner_name}</td>
                    <td className="text-xs">{w.priority}</td>
                    <td><WorkStatusBadge status={w.status} /></td>
                    <td className={!isTerminal(w.status) && w.deadline && w.deadline < today ? "font-semibold text-red-700" : ""}>
                      {w.deadline ?? "—"}
                    </td>
                    <td className="tabular-nums">{w.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function isTerminal(s: WorkStatus) {
  return s === "CLOSED" || s === "CANCELLED";
}
function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
