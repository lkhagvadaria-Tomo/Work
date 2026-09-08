import "server-only";
import { env } from "@/lib/env";
import type { AiCompleteOptions, AiProvider } from "./provider";

/** Anthropic Messages API via plain REST (no deep SDK coupling). */
export const anthropicProvider: AiProvider = {
  name: "anthropic",
  async complete(opts: AiCompleteOptions): Promise<string> {
    const apiKey = env().AI_API_KEY;
    const model = env().AI_MODEL;
    if (!apiKey || !model) {
      throw new Error("AI_API_KEY / AI_MODEL are not configured");
    }
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        system: opts.system,
        messages: opts.messages,
      }),
    });
    if (!res.ok) {
      // never leak the key or raw payload into user-facing errors
      throw new Error(`AI provider error (${res.status})`);
    }
    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    return (
      data.content
        ?.filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n") ?? ""
    );
  },
};
