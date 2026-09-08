export const metadata = { title: "Хандах эрхгүй" };

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-bold text-red-700">Хандах эрхгүй</h1>
        <p className="mt-2 text-sm text-slate-600">
          Таны Google бүртгэл энэ системд бүртгэлтэй идэвхтэй ажилтантай холбогдоогүй байна.
          Хандах эрх авахын тулд системийн админд (ХОБПХГ) хандана уу.
        </p>
        <a href="/login" className="mt-4 inline-block text-sm font-medium text-blue-700 underline">
          Нэвтрэх хуудас руу буцах
        </a>
      </div>
    </main>
  );
}
