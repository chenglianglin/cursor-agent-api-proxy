/**
 * Map Cursor CLI `result.usage` fields to OpenAI-compatible `usage`.
 */

import type { CursorCliUsage } from "../types/cursor-cli.js";
import type { OpenAICompletionUsage } from "../types/openai.js";

const EMPTY: OpenAICompletionUsage = {
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
};

export function cursorUsageToOpenAI(usage: CursorCliUsage | undefined): OpenAICompletionUsage {
  if (!usage) return { ...EMPTY };

  const prompt = Math.max(0, usage.inputTokens ?? 0);
  const completion = Math.max(0, usage.outputTokens ?? 0);
  const cached = Math.max(0, usage.cacheReadTokens ?? 0);

  const out: OpenAICompletionUsage = {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
  };

  if (cached > 0) {
    out.prompt_tokens_details = { cached_tokens: cached };
  }

  return out;
}
