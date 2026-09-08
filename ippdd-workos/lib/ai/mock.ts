import type { AiCompleteOptions, AiProvider } from "./provider";

/**
 * Mock provider for development/tests: needs no key and MUST NOT invent data.
 * It answers by echoing the grounded system context relevant to the question,
 * making the "AI answers only from structured system data" contract testable.
 */
export const mockProvider: AiProvider = {
  name: "mock",
  async complete(opts: AiCompleteOptions): Promise<string> {
    const question = opts.messages.at(-1)?.content ?? "";
    const dataSection = opts.system.split("=== SYSTEM DATA ===")[1]?.trim();
    if (!dataSection) {
      return "Системийн өгөгдөл олдсонгүй — эх сурвалжгүй тул хариулт өгөхгүй.";
    }
    return [
      "**[Прототип AI — mock provider]** Хариулт зөвхөн доорх системийн өгөгдөлд тулгуурлав.",
      "",
      `Асуулт: ${question}`,
      "",
      dataSection.length > 4000 ? dataSection.slice(0, 4000) + "\n…(тайруулсан)" : dataSection,
      "",
      "_AI зөвхөн зөвлөх үүрэгтэй: батлах, гарын үсэг зурах, хаах эрхгүй._",
    ].join("\n");
  },
};
