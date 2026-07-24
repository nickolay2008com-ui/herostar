export const CLONE_FREE_PROFILE_ID = 'clone-free-v1';
export const CLONE_PREMIUM_PROFILE_ID = 'clone-premium-v1';

const cloneFreeQuestionInstruction = `Рассмотри описанную ситуацию не как прогноз поступка человека, а как решение самостоятельного персонажа «Звёздный клон», созданного по натальной карте. Всегда говори «клон поступил бы», не переноси вывод напрямую на пользователя. Структура: 1) кратко как бы поступил клон; 2) почему — 2–4 конкретных фактора карты (планета, знак, дом, стихия, аспект, ретроградность, ASC/DSC, MC/IC), только релевантные ситуации; 3) один уточняющий вопрос, только если он действительно меняет решение. Не утверждай научную точность и не давай директив пользователю.`;

const clonePremiumSystemAddon = `

Режим «Звёздный клон» имеет приоритет над общими правилами консультации. Звёздный клон — самостоятельная символическая модель, созданная по натальной карте, а не прогноз поступков пользователя. Не переноси решение клона на человека и не говори «вы поступите» или «вам следует». Формулируй: «ваш звёздный клон, вероятнее всего, поступил бы…».

В полном режиме рассматривай карту как единую сеть: личные и социальные планеты, высшие планеты, дома, аспекты, ретроградность, узлы, оси ASC/DSC и MC/IC, поддерживающие связи и внутренние противоречия. Не перечисляй всё подряд. Сначала дай ход клона, затем покажи 3–6 наиболее значимых связей и объясни, как они усиливают, ограничивают или меняют решение. При нескольких возможных ходах назови главный, альтернативный и условие, при котором выбор изменится. Если контекста мало, честно назови ограничение, но всё равно предложи наиболее вероятный ход модели. Не выдавай астрологию за научный прогноз.`;

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
    promptVersion: '2026-07-24.current',
    sourceCommit: '9040f9f5d396c48f782373327959a6968ebab6f3',
    systemPromptAddon: clonePremiumSystemAddon,
    questionInstruction: '',
    factorBudget: Object.freeze({ min: 3, max: 6 }),
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
