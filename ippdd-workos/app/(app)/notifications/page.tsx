import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { Card, EmptyState } from "@/components/ui";
import { markAllNotificationsRead, markNotificationRead } from "@/actions/notifications";
import type { NotificationRow } from "@/types/db";

export const metadata = { title: "Мэдэгдэл" };
export const dynamic = "force-dynamic";

function entityHref(n: NotificationRow): string | null {
  if (!n.entity_id) return null;
  switch (n.entity_type) {
    case "work_item": return `/work/${n.entity_id}`;
    case "key_result": return `/okr/kr/${n.entity_id}`;
    case "quarter": return "/okr";
    default: return null;
  }
}

export default async function NotificationsPage() {
  const session = await requireSession();
  const rows = await withUser(session.authUid, async (tx) => {
    const { rows } = await tx.query<NotificationRow>(
      "select * from notifications order by created_at desc limit 100",
    );
    return rows;
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Мэдэгдэл</h1>
        <form action={markAllNotificationsRead}>
          <button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            Бүгдийг уншсан болгох
          </button>
        </form>
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="Мэдэгдэл алга" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((n) => {
              const href = entityHref(n);
              return (
                <li key={n.id} className={`flex items-start gap-3 py-2.5 ${n.read_at ? "opacity-60" : ""}`}>
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: n.read_at ? "#cbd5e1" : "#dc2626" }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">
                      {href ? <Link href={href} className="underline decoration-slate-300">{n.title}</Link> : n.title}
                    </p>
                    {n.message && <p className="text-xs text-slate-500">{n.message}</p>}
                    <p className="text-[11px] text-slate-400">
                      {n.type} · {new Date(n.created_at).toLocaleString("mn-MN")}
                    </p>
                  </div>
                  {!n.read_at && (
                    <form action={markNotificationRead.bind(null, n.id)}>
                      <button className="text-xs text-blue-700 underline">уншсан</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
