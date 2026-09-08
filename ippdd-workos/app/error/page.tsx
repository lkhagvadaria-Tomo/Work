import Link from "next/link";

export const metadata = { title: "Алдаа" };

/** Sanitized application error screen — no raw DB exceptions to normal users (§43). */
export default async function ErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">Үйлдэл амжилтгүй</h1>
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {m ?? "Тодорхойгүй алдаа гарлаа."}
        </p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Нүүр хуудас руу буцах
        </Link>
      </div>
    </main>
  );
}
