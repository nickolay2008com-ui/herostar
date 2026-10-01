import { generateFreeLlmChat } from './free-llm.js';
import { generateGeminiClone } from './gemini-clone.js';

export const CLONE_AI_DEADLINE_MS = 36_000;
export const CLONE_FREE_LLM_BUDGET_MS = 12_000;

function remainingMs(startedAt) {
  return Math.max(0, CLONE_AI_DEADLINE_MS - (Date.now() - startedAt));
}

export async function generateCloneAi({
  instructions = '',
  input = [],
  maxOutputTokens = 1000,
  mode = 'dialog',
  freeLlm = generateFreeLlmChat,
  gemini = generateGeminiClone,
} = {}) {
  const startedAt = Date.now();

  try {
    const free = await freeLlm({
      instructions,
      input,
      maxOutputTokens,
      timeoutMs: Math.min(CLONE_FREE_LLM_BUDGET_MS, remainingMs(startedAt)),
    });
    console.info(`[HeroStar AI] provider=free:${free.provider} product=clone mode=${mode} model=${free.model}`);
    return {
      text: free.text,
      provider: `free:${free.provider}`,
      model: free.model,
      status: 'ok',
    };
  } catch (error) {
    console.warn('[HeroStar AI] Free LLM unavailable; falling back to Gemini:', {
      code: String(error?.code || 'unknown').slice(0, 80),
      status: Number(error?.status || 0) || null,
    });
  }

  const remaining = remainingMs(startedAt);
  if (remaining >= 1000) {
    try {
      const result = await gemini({
        instructions,
        input,
        maxOutputTokens,
        timeoutMs: remaining,
      });
      return {
        text: result.text,
        provider: 'gemini',
        model: result.model,
        status: 'ok',
      };
    } catch (error) {
      console.error('[HeroStar AI] Gemini fallback unavailable:', error?.message || error);
    }
  }

  return { text: '', provider: null, model: null, status: 'unavailable' };
}
