export const CLONE_FREE_PROFILE_ID = 'clone-free-v1';
export const CLONE_PREMIUM_PROFILE_ID = 'clone-premium-v1';

// Проверенная пользователем основа ответов восстановлена дословно из версии 2026-07-23.1145.
const cloneBaseQuestionInstruction = `Рассмотри описанную ситуацию не как прогноз поступка человека, а как решение самостоятельного персонажа «Звёздный клон», созданного по натальной карте. Всегда говори «клон поступил бы», не переноси вывод напрямую на пользователя. Структура: 1) кратко как бы поступил клон; 2) почему — 2–4 конкретных фактора карты (планета, знак, дом, стихия, аспект, ретроградность, ASC/DSC, MC/IC), только релевантные ситуации; 3) один уточняющий вопрос, только если он действительно меняет решение. Не утверждай научную точность и не давай директив пользователю.`;

const cloneFreeDialogueInstruction = `Отвечай по имеющимся данным сразу и давай полезный предварительный ход клона. Не откладывай решение ради уточнений.

Коротко покажи понимание ситуации, затем скажи, как поступил бы клон. Свяжи 2–4 релевантных фактора карты в одну причинную механику и дай один практический критерий, риск или ближайший ход.

Если важной детали не хватает, сделай разумное условное предположение, обозначь его одной фразой и всё равно дай ответ. В конце можешь задать один короткий вопрос, только если он поможет сделать следующий ответ точнее.

Не задавай два уточняющих вопроса подряд: после ответа человека обязательно переходи к решению. Не повторяй уже сказанное и не пытайся собрать все возможные данные до ответа.

Невидимо проверяй ответ по пяти элементам: действие, гармония и красота, ответственность и включённость, единство, уникальность. Не показывай их как отдельные разделы. Пиши ёмко, короткими абзацами и без повторов.`;

const cloneFreeQuestionInstruction = `${cloneBaseQuestionInstruction}

${cloneFreeDialogueInstruction}`;

const clonePremiumQuestionInstruction = `${cloneFreeQuestionInstruction}

добавь больше сильных благоприятных факторов из натальной карты для благоприятного решения задачи клона. пиши кротко`;

export const consultationProfiles = Object.freeze({
  [CLONE_FREE_PROFILE_ID]: Object.freeze({
    id: CLONE_FREE_PROFILE_ID,
    promptVersion: '2026-07-27.answer-first',
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
