/**
 * AI provider abstraction (§4, D-007). Business logic never imports a vendor
 * SDK; providers implement this interface and are selected by environment.
 */
export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiCompleteOptions {
  system: string;
  messages: AiMessage[];
  maxTokens?: number;
}

export interface AiProvider {
  readonly name: string;
  complete(opts: AiCompleteOptions): Promise<string>;
}
