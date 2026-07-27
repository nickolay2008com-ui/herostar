export const CLONE_FREE_PROFILE_ID = 'clone-free-v1';
export const CLONE_PREMIUM_PROFILE_ID = 'clone-premium-v1';

// Проверенная пользователем основа ответов восстановлена дословно из версии 2026-07-23.1145.
const cloneBaseQuestionInstruction = `Рассмотри описанную ситуацию не как прогноз поступка человека, а как решение самостоятельного персонажа «Звёздный клон», созданного по натальной карте. Всегда говори «клон поступил бы», не переноси вывод напрямую на пользователя. Структура: 1) кратко как бы поступил клон; 2) почему — 2–4 конкретных фактора карты (планета, знак, дом, стихия, аспект, ретроградность, ASC/DSC, MC/IC), только релевантные ситуации; 3) один уточняющий вопрос, только если он действительно меняет решение. Не утверждай научную точность и не давай директив пользователю.`;

const cloneFiveElementsInstruction = `Невидимо проверь решение клона по пяти элементам:
— действие: есть ли ясный ход;
— гармония и красота: подходит ли ход природе и ритму клона;
— ответственность и включённость: остаётся ли у человека авторство выбора;
— единство: складываются ли факторы карты в одну цельную механику;
— уникальность: понятно ли, почему это решение относится именно к этой карте и ситуации.
Не называй эти пять элементов пользователю и не превращай их в отдельные разделы.`;

const cloneFreeQuestionInstruction = `${cloneBaseQuestionInstruction}

${cloneFiveElementsInstruction}`;

const clonePremiumQuestionInstruction = `${cloneFreeQuestionInstruction.replace(
  '2–4 конкретных фактора карты',
  '3–6 конкретных факторов карты',
)}

В полном режиме собери полную картину одного решения. Ответ должен дать:
— ясный ход клона;
— единую причинную механику из 3–6 наиболее значимых факторов карты;
— главное внутреннее противоречие, которое влияет на выбор;
— один жизнеспособный альтернативный ход;
— конкретное условие, при котором решение изменится;
— один первый проверяемый шаг в реальности.

Пиши ёмко и цельно. Не повторяй одну мысль разными словами и не разбирай фактор, если он не меняет решение. Уточняющий вопрос задавай только тогда, когда без него нельзя различить два реальных маршрута.`;

export const consultationProfiles = Object.freeze({
  [CLONE_FREE_PROFILE_ID]: Object.freeze({
    id: CLONE_FREE_PROFILE_ID,
    promptVersion: '2026-07-23.1145-five',
    sourceCommit: 'ad915b2bf870b27552eaf185a842702987d80da1',
    derivedFromPromptVersion: '2026-07-23.1145',
    systemPromptAddon: '',
    questionInstruction: cloneFreeQuestionInstruction,
    factorBudget: Object.freeze({ min: 2, max: 4 }),
    historyLimit: 8,
    chartDepth: 'full',
  }),
  [CLONE_PREMIUM_PROFILE_ID]: Object.freeze({
    id: CLONE_PREMIUM_PROFILE_ID,
    promptVersion: '2026-07-27.full-decision-v1',
    sourceCommit: '7c49541e31f1165ded05318c025a3f6b47ed418b',
    derivedFromPromptVersion: '2026-07-23.1145-five',
    systemPromptAddon: '',
    questionInstruction: clonePremiumQuestionInstruction,
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
