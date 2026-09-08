import Link from "next/link";
import type { ReactNode } from "react";
import { requireSession } from "@/lib/auth/session";
import { queryAs } from "@/lib/db";
import { logout } from "@/actions/auth";

const NAV: { href: string; label: string; roles?: string[] }[] = [
  { href: "/dashboard", label: "Нүүр" },
  { href: "/okr", label: "Миний OKR" },
  { href: "/work", label: "Миний ажил" },
  { href: "/evidence", label: "Нотолгоо" },
  { href: "/reviews", label: "Хяналт (Review)" },
  { href: "/approvals", label: "Батлал (Approval)" },
  { href: "/agent", label: "AI туслах" },
  { href: "/reports", label: "Тайлан / Dashboard", roles: ["MANAGER", "DIRECTOR", "ADMIN"] },
  { href: "/admin", label: "Админ", roles: ["ADMIN"] },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const { employee } = session;
  const unread = await queryAs<{ n: string }>(
    session.authUid,
    "select count(*) as n from notifications where read_at is null",
  );
  const unreadCount = Number(unread[0]?.n ?? 0);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="border-b border-slate-100 px-4 py-4">
          <p className="text-base font-bold tracking-tight">IPPDD WorkOS</p>
          <p className="mt-0.5 text-[11px] leading-tight text-slate-500">
            OKR · Work · Evidence · Approval · Governance
          </p>
        </div>
        <nav className="flex-1 space-y-0.5 p-2" aria-label="Үндсэн цэс">
          {NAV.filter((n) => !n.roles || n.roles.includes(employee.system_role)).map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3 text-xs text-slate-500">
          <p className="font-semibold text-slate-700">{employee.full_name}</p>
          <p>{employee.position_title ?? employee.system_role}</p>
          <form action={logout} className="mt-2">
            <button className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
              Гарах
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 md:px-6">
          <div className="flex items-center gap-3 md:hidden">
            <span className="text-sm font-bold">IPPDD WorkOS</span>
          </div>
          <nav className="flex gap-2 overflow-x-auto text-xs md:hidden" aria-label="Гар утасны цэс">
            {NAV.filter((n) => !n.roles || n.roles.includes(employee.system_role)).map((n) => (
              <Link key={n.href} href={n.href} className="whitespace-nowrap text-slate-600 underline">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/notifications"
              className="relative rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Мэдэгдэл
              {unreadCount > 0 && (
                <span className="ml-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </Link>
            <span className="hidden text-xs text-slate-500 sm:block">{employee.email}</span>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
