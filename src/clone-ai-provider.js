import { generateFreeLlmChat } from './free-llm.js';
import { generateGeminiClone } from './gemini-clone.js';

export const CLONE_AI_DEADLINE_MS = 36_000;
export const CLONE_FREE_LLM_BUDGET_MS = 12_000;
export const CLONE_FREE_LLM_MAX_OUTPUT_TOKENS = 900;

function remainingMs(startedAt) {
  return Math.max(0, CLONE_AI_DEADLINE_MS - (Date.now() - startedAt));
}

function compactFreeInstructions(instructions) {
  return String(instructions || '').replace(
    /Полная chart передана как фон для понимания положений и связей\./,
    'Для Free LLM переданы только выбранные selectedFactors и краткий контекст карты; обосновывай ответ ими и не добавляй случайные факторы.',
  );
}

function compactFreeInput(input = []) {
  return (Array.isArray(input) ? input : []).map((item) => {
    if (item?.role !== 'user' || typeof item?.content !== 'string') return item;

    let payload = null;
    try {
      payload = JSON.parse(item.content);
    } catch {
      return item;
    }
    if (payload?.product !== 'clone') return item;

    const profile = payload.consultationProfile || null;
    const chart = payload.chart || null;
    return {
      ...item,
      content: JSON.stringify({
        mode: payload.mode || 'dialog',
        product: 'clone',
        consultationProfile: profile ? {
          id: profile.id || null,
          promptVersion: profile.promptVersion || null,
          factorBudget: profile.factorBudget || null,
        } : null,
        chartContext: chart ? {
          system: chart.system || null,
          scope: chart.scope || null,
          unknownTime: Boolean(chart.birth?.unknownTime),
        } : null,
        selectedFactors: Array.isArray(payload.selectedFactors) ? payload.selectedFactors : [],
        history: Array.isArray(payload.history) ? payload.history : [],
        question: payload.question || '',
        externalContext: payload.externalContext || null,
      }),
    };
  });
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
      instructions: compactFreeInstructions(instructions),
      input: compactFreeInput(input),
      maxOutputTokens: CLONE_FREE_LLM_MAX_OUTPUT_TOKENS,
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
