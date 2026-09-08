import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { devAuthEnabled, env, supabaseConfigured } from "@/lib/env";
import { DEV_PERSONAS } from "@/lib/auth/dev";
import { devLogin, googleLogin } from "@/actions/auth";

export const metadata = { title: "Нэвтрэх" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/dashboard");
  const { m } = await searchParams;
  const supabaseOn = supabaseConfigured();
  const devOn = devAuthEnabled();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold tracking-tight">IPPDD WorkOS</h1>
        <p className="mt-1 text-sm text-slate-500">
          OKR, ажил, нотолгоо, батлал ба засаглалын гүйцэтгэлийн систем
        </p>

        {m && (
          <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {m}
          </p>
        )}

        <div className="mt-6 space-y-4">
          {supabaseOn ? (
            <form action={googleLogin}>
              <button className="w-full rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                Google-ээр нэвтрэх ({env().GOOGLE_WORKSPACE_DOMAIN})
              </button>
            </form>
          ) : (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Google нэвтрэлт идэвхгүй: Supabase Auth тохиргоо (.env) дутуу. Тохируулах зааврыг
              README болон docs/DEPLOYMENT.md-ээс үзнэ үү.
            </p>
          )}

          {devOn && (
            <form action={devLogin} className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Хөгжүүлэлтийн горим — persona сонгох
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Зөвхөн development орчинд (DEV_AUTH=1). Production-д энэ хэсэг ажиллахгүй.
              </p>
              <select
                name="persona"
                className="mt-3 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                defaultValue={DEV_PERSONAS[0].key}
                aria-label="Persona"
              >
                {DEV_PERSONAS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button className="mt-3 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
                Persona-аар нэвтрэх
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] text-slate-400">
          Netcapital Financial Group · Дотоод систем · Зөвшөөрөлгүй хандалт хориотой
        </p>
      </div>
    </main>
  );
}
