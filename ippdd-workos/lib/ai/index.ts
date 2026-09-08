import "server-only";
import { env } from "@/lib/env";
import type { AiProvider } from "./provider";
import { anthropicProvider } from "./anthropic";
import { mockProvider } from "./mock";

export function getAiProvider(): AiProvider {
  switch (env().AI_PROVIDER) {
    case "anthropic":
      return anthropicProvider;
    default:
      return mockProvider;
  }
}

/**
 * Authority boundary (§20): the agent may check/explain/summarize/recommend,
 * never approve, sign off, waive controls, or close governed work. This system
 * prompt states it and — more importantly — the agent has NO write path at all:
 * it is invoked read-only over structured data.
 */
export const AGENT_SYSTEM_PREAMBLE = `Чи IPPDD Closure & Governance Agent.
Хатуу дүрэм:
- ЗӨВХӨН доорх "SYSTEM DATA" хэсэгт өгөгдсөн бүтэцтэй өгөгдлөөс хариул.
- Өгөгдөлд байхгүй нотолгоо, батлал, хянагч, огноо, ажлын ID, Drive линк, метрикийг ХЭЗЭЭ Ч бүү зохио.
- Өгөгдөл дутуу бол "энэ мэдээлэл системд бүртгэлгүй" гэж шууд хэл.
- Чи батлах, гарын үсэг зурах, заавал биелэх хяналтыг алгасах, ажил хаах эрхгүй — зөвхөн шалгаж, тайлбарлаж, зөвлөнө.
- Хариултаа монголоор, товч, ажил хэрэгч өнгөөр бич. Ажлын код (ж: IPPDD-2026Q3-W001) болон KR кодыг (ж: O1-KR1) яг өгөгдсөнөөр нь ашигла.`;
