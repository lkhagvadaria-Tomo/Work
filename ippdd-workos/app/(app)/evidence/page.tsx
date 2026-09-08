import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { Card, EmptyState, Stat } from "@/components/ui";

export const metadata = { title: "Нотолгоо" };
export const dynamic = "force-dynamic";

export default async function EvidencePage() {
  const session = await requireSession();

  const data = await withUser(session.authUid, async (tx) => {
    const rows = (
      await tx.query<{
        id: string; evidence_type: string; title: string; verified: boolean;
        drive_url: string | null; external_url: string | null; created_at: string;
        creator: string; work_id: string; work_code: string; kr_label: string | null;
      }>(
        `select e.id, e.evidence_type, e.title, e.verified, e.drive_url, e.external_url,
                e.created_at, c.full_name as creator, w.id as work_id, w.work_code,
                (select o.objective_code || '-' || k.kr_code
                   from key_results k join objectives o on o.id = k.objective_id
                  where k.id = w.key_result_id) as kr_label
           from evidence e
           join work_items w on w.id = e.work_item_id
           join employees c on c.id = e.created_by
          order by e.created_at desc limit 200`,
      )
    ).rows;
    const gaps = (
      await tx.query<{ id: string; work_code: string; title: string }>(
        `select w.id, w.work_code, w.title from work_items w
          where w.status not in ('CLOSED','CANCELLED','NOT_STARTED')
            and not exists (select 1 from evidence e where e.work_item_id = w.id)
          order by w.work_code`,
      )
    ).rows;
    return { rows, gaps };
  });

  const verified = data.rows.filter((r) => r.verified).length;

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold">Нотолгооны сан</h1>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Нийт нотолгоо" value={data.rows.length} />
        <Stat label="Баталгаажсан" value={verified} tone={verified === data.rows.length && data.rows.length > 0 ? "good" : "default"} />
        <Stat label="Нотолгоогүй идэвхтэй ажил" value={data.gaps.length} tone={data.gaps.length > 0 ? "warn" : "good"} />
      </div>

      {data.gaps.length > 0 && (
        <Card title="Нотолгоо дутуу ажлууд">
          <ul className="space-y-1 text-sm">
            {data.gaps.map((g) => (
              <li key={g.id}>
                <Link href={`/work/${g.id}`} className="font-mono text-xs font-semibold text-blue-700 underline">{g.work_code}</Link>{" "}
                <span className="text-slate-600">{g.title}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Бүх нотолгоо">
        {data.rows.length === 0 ? (
          <EmptyState title="Нотолгоо бүртгэгдээгүй" hint="Ажлын дэлгэрэнгүй хуудаснаас Drive нотолгоо холбоно." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data w-full">
              <thead>
                <tr><th>Нэр</th><th>Төрөл</th><th>Ажил</th><th>KR</th><th>Бүртгэсэн</th><th>Төлөв</th><th>Огноо</th></tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="max-w-sm">
                      {r.drive_url || r.external_url ? (
                        <a className="text-blue-700 underline" href={r.drive_url ?? r.external_url ?? "#"} target="_blank" rel="noreferrer">
                          {r.title}
                        </a>
                      ) : r.title}
                    </td>
                    <td className="text-xs">{r.evidence_type}</td>
                    <td><Link href={`/work/${r.work_id}`} className="font-mono text-xs text-blue-700 underline">{r.work_code}</Link></td>
                    <td className="text-xs">{r.kr_label ?? "—"}</td>
                    <td className="text-xs">{r.creator}</td>
                    <td className="text-xs">
                      {r.verified
                        ? <span className="rounded bg-emerald-100 px-1.5 font-semibold text-emerald-700">✓ баталгаажсан</span>
                        : <span className="rounded bg-amber-50 px-1.5 text-amber-700">хүлээгдэж буй</span>}
                    </td>
                    <td className="text-xs">{new Date(r.created_at).toLocaleDateString("mn-MN")}</td>
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
