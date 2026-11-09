// Anthropic prices, US dollars per million tokens, from
// https://platform.claude.com/docs/en/about-claude/pricing (read 2026-11-08).
// Global routing (the default); US-only inference would be ×1.1.
// Haiku 5.5's prices are for prompts up to 100,000 tokens; Kakak's are ~4,000.

export type KakakModel = "claude-opus-5-5" | "claude-sonnet-5-5" | "claude-haiku-5-5";

interface Price {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

export const PRICES: Record<KakakModel, Price> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite5m: 5, cacheWrite1h: 8, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheWrite5m: 0.125, cacheWrite1h: 0.2, cacheRead: 0.01 },
};

/** The parts of the API's usage object that cost money. */
export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number | null;
    ephemeral_1h_input_tokens?: number | null;
  } | null;
}

/** Cost of one call in micro-dollars (millionths of a dollar), rounded up. */
export function costMicroUsd(model: KakakModel, usage: UsageLike): number {
  const price = PRICES[model];
  const write1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  // When the breakdown is missing, count every cache write at the 5-minute
  // price (what Kakak uses).
  const write5m =
    usage.cache_creation?.ephemeral_5m_input_tokens ??
    Math.max(0, (usage.cache_creation_input_tokens ?? 0) - write1h);
  const read = usage.cache_read_input_tokens ?? 0;
  // Dollars per million tokens × tokens = micro-dollars.
  const micro =
    usage.input_tokens * price.input +
    usage.output_tokens * price.output +
    write5m * price.cacheWrite5m +
    write1h * price.cacheWrite1h +
    read * price.cacheRead;
  return Math.ceil(micro);
}
