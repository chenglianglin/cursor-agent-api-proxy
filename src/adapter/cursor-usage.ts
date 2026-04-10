/**
 * Map Cursor CLI `result.usage` fields to OpenAI-compatible `usage`.
 */

import type { OpenAICompletionUsage } from "../types/openai.js";

const EMPTY: OpenAICompletionUsage = {
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
};

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** `usage` may be nested under metadata, etc. */
export function usagePayloadFromResult(raw: Record<string, unknown>): Record<string, unknown> | undefined {
  const top = raw.usage;
  if (top && typeof top === "object" && !Array.isArray(top)) {
    return top as Record<string, unknown>;
  }
  const meta = raw.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const m = meta as Record<string, unknown>;
    const u = m.usage ?? m.tokenUsage ?? m.token_usage;
    if (u && typeof u === "object" && !Array.isArray(u)) return u as Record<string, unknown>;
  }
  const tokenUsage = raw.tokenUsage ?? raw.token_usage;
  if (tokenUsage && typeof tokenUsage === "object" && !Array.isArray(tokenUsage)) {
    return tokenUsage as Record<string, unknown>;
  }
  return undefined;
}

/** Normalize CLI usage whether camelCase or snake_case. */
export function cursorUsageToOpenAI(
  usage: Record<string, unknown> | undefined
): OpenAICompletionUsage {
  if (!usage) return { ...EMPTY };

  const u = usage as Record<string, unknown>;
  /** Tokens processed as "new" input (often 0 when the whole prompt hit the prompt cache). */
  const freshInput = Math.max(
    0,
    num(u.inputTokens) ?? num(u.input_tokens) ?? 0
  );
  const completion = Math.max(
    0,
    num(u.outputTokens) ?? num(u.output_tokens) ?? 0
  );
  /** Tokens read from Cursor prompt cache (context served from cache). */
  const cached = Math.max(
    0,
    num(u.cacheReadTokens) ??
      num(u.cache_read_tokens) ??
      num(u.cacheRead) ??
      0
  );

  /**
   * Cursor splits: `inputTokens` + `cacheReadTokens` ≈ total prompt-side context.
   * OpenAI-style `prompt_tokens` is clearer as the sum so dashboards don't show 0 when cache is huge.
   */
  const promptTotal = freshInput + cached;

  const out: OpenAICompletionUsage = {
    prompt_tokens: promptTotal,
    completion_tokens: completion,
    total_tokens: promptTotal + completion,
  };

  const cacheWrite = Math.max(
    0,
    num(u.cacheWriteTokens) ?? num(u.cache_write_tokens) ?? 0
  );
  if (cached > 0 || cacheWrite > 0) {
    out.prompt_tokens_details = { cached_tokens: cached };
  }

  return out;
}
