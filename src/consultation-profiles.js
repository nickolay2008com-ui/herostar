export const CLONE_FREE_PROFILE_ID = 'clone-free-v1';
export const CLONE_PREMIUM_PROFILE_ID = 'clone-premium-v1';

const cloneFreeQuestionInstruction = `Бесплатный режим «Звёздный клон». Рассматривай описанную ситуацию не как прогноз поступка человека, а как решение самостоятельного персонажа, созданного по натальной карте. Формулируй «клон поступил бы», не переноси вывод напрямую на пользователя.

Дай законченный и полезный ответ по 2–4 наиболее релевантным факторам карты: как бы поступил клон, почему именно так, где находится риск его естественной реакции и какой небольшой проверяемый ход он сделал бы первым. Используй только реально переданные положения карты. Не обещай научную точность, удачу или неизбежный результат.`;

const clonePremiumSystemAddon = `

Приоритетный режим «Звёздный клон». Звёздный клон — самостоятельная символическая модель, созданная по натальной карте, а не прогноз поступков пользователя. Не говори «вы поступите» и не выдавай решение модели за обязательную рекомендацию человеку.

Продолжай текущий разговор с учётом истории сообщений. Для конкретной ситуации выбирай 2–5 действительно относящихся к ней факторов карты и переводи их в понятную механику решения: вероятный ход клона, причина, возможная ловушка, сильная сторона и ближайший обратимый шаг. Не перечисляй всю карту и не придумывай отсутствующие положения.`;

export const consultationProfiles = Object.freeze({
  [CLONE_FREE_PROFILE_ID]: Object.freeze({
    id: CLONE_FREE_PROFILE_ID,
    promptVersion: '2026-07-24.free-v1',
    sourceCommit: 'c067870',
    systemPromptAddon: '',
    questionInstruction: cloneFreeQuestionInstruction,
    factorBudget: Object.freeze({ min: 2, max: 4 }),
    historyLimit: 10,
  }),
  [CLONE_PREMIUM_PROFILE_ID]: Object.freeze({
    id: CLONE_PREMIUM_PROFILE_ID,
    promptVersion: '2026-07-24.premium-v1',
    sourceCommit: '25858c2',
    systemPromptAddon: clonePremiumSystemAddon,
    questionInstruction: '',
    factorBudget: Object.freeze({ min: 2, max: 5 }),
    historyLimit: 14,
  }),
});

export function resolveConsultationProfile({ product, premium = false } = {}) {
  if (product !== 'clone') return null;
  return consultationProfiles[premium ? CLONE_PREMIUM_PROFILE_ID : CLONE_FREE_PROFILE_ID];
}

export function prepareConsultationQuestion(profile, question) {
  const cleanQuestion = String(question || '').trim();
  if (!profile?.questionInstruction) return cleanQuestion;
  return `${profile.questionInstruction}\n\nСитуация: ${cleanQuestion}`;
}
