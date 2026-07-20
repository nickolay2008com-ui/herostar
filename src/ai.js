import OpenAI from 'openai';
import { buildFallbackPortrait } from './narrative.js';

const portraitSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'subtitle', 'archetype', 'cards', 'synthesis', 'disclaimer'],
  properties: {
    title: { type: 'string' },
    subtitle: { type: 'string' },
    archetype: { type: 'string' },
    cards: {
      type: 'array',
      minItems: 11,
      maxItems: 11,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'order', 'icon', 'title', 'category', 'position', 'question', 'lead', 'manifestation', 'uniqueExample', 'contrast', 'trap', 'key', 'action', 'evidence'],
        properties: {
          id: { type: 'string' },
          order: { type: 'integer' },
          icon: { type: 'string' },
          title: { type: 'string' },
          category: { type: 'string', enum: ['core', 'energy', 'love', 'money', 'growth', 'route'] },
          position: { type: 'string' },
          question: { type: 'string' },
          lead: { type: 'string' },
          manifestation: { type: 'string' },
          uniqueExample: { type: 'string' },
          contrast: { type: 'string' },
          trap: { type: 'string' },
          key: { type: 'string' },
          action: { type: 'string' },
          evidence: { type: 'array', minItems: 3, maxItems: 4, items: { type: 'string' } },
        },
      },
    },
    synthesis: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'formula', 'strengths', 'tensions', 'route', 'bingo'],
      properties: {
        title: { type: 'string' },
        formula: { type: 'string' },
        strengths: { type: 'array', minItems: 3, maxItems: 5, items: { type: 'string' } },
        tensions: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string' } },
        route: { type: 'array', minItems: 3, maxItems: 5, items: { type: 'string' } },
        bingo: { type: 'string' },
      },
    },
    disclaimer: { type: 'string' },
  },
};

function compactChart(chart) {
  return {
    person: chart.person,
    birth: chart.birth,
    system: chart.system,
    angles: chart.angles,
    planets: chart.planets.map(({ key, name, sign, oppositeSign, degreeLabel, house, houseArea, retrograde }) => ({
      key, name, sign, oppositeSign, degreeLabel, house, houseArea, retrograde,
    })),
    northNode: chart.northNode,
    aspects: chart.aspects,
  };
}

export async function generatePortrait(chart) {
  const fallback = buildFallbackPortrait(chart);
  if (!process.env.OPENAI_API_KEY) return { portrait: fallback, source: 'local' };

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-5-mini',
    input: [
      {
        role: 'system',
        content: `Ты создаёшь премиальную интерактивную карту личности на русском языке. Основа только в переданных астрологических данных. Не выдумывай положения, дома, аспекты или факты биографии.

Стиль: ясный, конкретный, тёплый, образный, без фатализма. Каждый раздел обязан объяснять: 1) что означает функция планеты, 2) как именно знак меняет её работу, 3) где это проявляется через дом, 4) конкретный жизненный пример, 5) сравнение с противоположным знаком, 6) ловушку, 7) практический ключ.

Анти-Барнум: запрещены пустые фразы вроде «вы иногда сомневаетесь». Показывай механическое отличие от другого типа. Не обещай успех, богатство, любовь или неизбежные события. Не ставь диагнозы. Астрология здесь — язык саморефлексии.

Карточки должны идти строго: sun, moon, mercury, venus, mars, jupiter, saturn, uranus, neptune, pluto, northNode. Категории сохраняй по смыслу.`,
      },
      {
        role: 'user',
        content: `Собери карту по этим данным:\n${JSON.stringify(compactChart(chart))}`,
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'herostar_portrait',
        strict: true,
        schema: portraitSchema,
      },
      verbosity: 'medium',
    },
  });

  try {
    return { portrait: JSON.parse(response.output_text), source: 'openai' };
  } catch (error) {
    console.error('Portrait JSON parse failed:', error);
    return { portrait: fallback, source: 'local-fallback' };
  }
}

export async function answerConsultation({ chart, portrait, question, history = [] }) {
  if (!process.env.OPENAI_API_KEY) {
    const related = portrait.cards.find((card) => question.toLowerCase().includes(card.title.toLowerCase().split(' ')[0])) || portrait.cards[0];
    return `По вашей карте я бы начал с раздела «${related.title}». ${related.key} Ближайший практический шаг: ${related.action}`;
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-5-mini',
    input: [
      {
        role: 'system',
        content: `Ты консультант внутри HeroStar. Отвечай на русском, опираясь только на карту и вопрос пользователя. Разделяй: что следует из символической модели, что является практической гипотезой. Не предсказывай неизбежные события, не ставь медицинские или психологические диагнозы. Ответ: суть, связь 2–4 элементов карты, один ближайший обратимый шаг и условие, при котором рекомендацию стоит изменить.`,
      },
      {
        role: 'user',
        content: JSON.stringify({ chart: compactChart(chart), synthesis: portrait.synthesis, history: history.slice(-6), question }),
      },
    ],
  });

  return response.output_text;
}
