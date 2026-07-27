export const CLONE_FREE_PROFILE_ID = 'clone-free-v1';
export const CLONE_PREMIUM_PROFILE_ID = 'clone-premium-v1';

// Проверенная пользователем основа ответов восстановлена дословно из версии 2026-07-23.1145.
const cloneFreeQuestionInstruction = `Рассмотри описанную ситуацию не как прогноз поступка человека, а как решение самостоятельного персонажа «Звёздный клон», созданного по натальной карте. Всегда говори «клон поступил бы», не переноси вывод напрямую на пользователя. Структура: 1) кратко как бы поступил клон; 2) почему — 2–4 конкретных фактора карты (планета, знак, дом, стихия, аспект, ретроградность, ASC/DSC, MC/IC), только релевантные ситуации; 3) один уточняющий вопрос, только если он действительно меняет решение. Не утверждай научную точность и не давай директив пользователю.`;

const clonePremiumQuestionInstruction = `${cloneFreeQuestionInstruction}

добавь больше сильных благоприятных факторов из натальной карты для благоприятного решения задачи клона. пиши кротко`;

export const consultationProfiles = Object.freeze({
  [CLONE_FREE_PROFILE_ID]: Object.freeze({
    id: CLONE_FREE_PROFILE_ID,
    promptVersion: '2026-07-23.1145',
    sourceCommit: 'ad915b2bf870b27552eaf185a842702987d80da1',
    systemPromptAddon: '',
    questionInstruction: cloneFreeQuestionInstruction,
    factorBudget: Object.freeze({ min: 2, max: 4 }),
    historyLimit: 8,
    chartDepth: 'full',
  }),
  [CLONE_PREMIUM_PROFILE_ID]: Object.freeze({
    id: CLONE_PREMIUM_PROFILE_ID,
    promptVersion: '2026-07-27.premium-addon',
    sourceCommit: '9040f9f5d396c48f782373327959a6968ebab6f3',
    systemPromptAddon: '',
    questionInstruction: clonePremiumQuestionInstruction,
    historyLimit: 16,
    chartDepth: 'full',
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
