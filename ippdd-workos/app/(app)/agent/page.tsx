import { requireSession } from "@/lib/auth/session";
import { buildAgentContext } from "@/lib/ai/agent";
import { AGENT_SYSTEM_PREAMBLE, getAiProvider } from "@/lib/ai";
import { Card, inputCls } from "@/components/ui";
import Link from "next/link";

export const metadata = { title: "AI туслах" };
export const dynamic = "force-dynamic";

const SUGGESTIONS = [
  "O1-KR1-ээ хааж болох уу?",
  "Ямар нотолгоо дутуу байна?",
  "Аль батлалыг хүлээж байна вэ?",
  "Улирлын хаалтыг юу блоклож байна?",
  "Дараагийн алхам юу вэ?",
  "Хугацаа хэтэрсэн ажлууд минь юу вэ?",
];

export default async function AgentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireSession();
  const { q } = await searchParams;
  let answer: string | null = null;
  let providerName = "";
  let errorMsg: string | null = null;

  if (q && q.trim().length > 1) {
    try {
      const context = await buildAgentContext(session);
      const provider = getAiProvider();
      providerName = provider.name;
      answer = await provider.complete({
        system: `${AGENT_SYSTEM_PREAMBLE}\n\n=== SYSTEM DATA ===\n${context}`,
        messages: [{ role: "user", content: q.trim().slice(0, 2000) }],
        maxTokens: 1200,
      });
    } catch {
      errorMsg = "AI үйлчилгээ одоогоор боломжгүй байна. Түр хүлээгээд дахин оролдоно уу.";
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-lg font-bold">IPPDD Closure & Governance Agent</h1>
        <p className="mt-1 text-sm text-slate-500">
          Зөвхөн системийн бүтэцтэй өгөгдлөөс хариулна. AI нь зөвлөх үүрэгтэй:{" "}
          <strong>батлах, гарын үсэг зурах, ажил хаах эрхгүй</strong> — эцсийн хариуцлага
          хүний гарын үсэгт үлдэнэ (§2.5a human-accountable).
        </p>
      </div>

      <Card>
        <form action="/agent" method="get" className="flex gap-2">
          <input
            name="q" defaultValue={q ?? ""} placeholder="Асуултаа бичнэ үү…"
            className={inputCls} maxLength={2000} aria-label="AI-д өгөх асуулт"
          />
          <button className="shrink-0 rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white">
            Асуух
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <Link key={s} href={`/agent?q=${encodeURIComponent(s)}`}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">
              {s}
            </Link>
          ))}
        </div>
      </Card>

      {errorMsg && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMsg}
        </p>
      )}

      {answer && (
        <Card title={`Хариулт (provider: ${providerName})`}>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{answer}</div>
          <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
            AI-ийн хариулт зөвлөмж төдий — засаглалын шийдвэрийг гейт + хүний sign-off гаргана.
            Энэ хүсэлтэд таны нэр, ажил/OKR-ийн бүтэцтэй мэдээлэл AI provider руу дамжсан
            (docs/SECURITY_CHECKLIST.md §data-flows).
          </p>
        </Card>
      )}
    </div>
  );
}
