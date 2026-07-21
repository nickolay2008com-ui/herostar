import OpenAI from 'openai';
import { buildFallbackPortrait } from './narrative.js';

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

// v2.2 core: карта всегда строится детерминированно из проверенных данных.
// GPT не сочиняет карточки и используется только после карты — в консультационном диалоге.
export async function generatePortrait(chart) {
  return { portrait: buildFallbackPortrait(chart), source: 'local-v2.2' };
}

function localConsultation(portrait, question) {
  const lower = question.toLowerCase();
  const related = portrait.cards.find((card) =>
    [card.title, card.position, card.question].some((value) => lower.includes(String(value).toLowerCase().split(' ')[0])),
  ) || portrait.cards[0];
  return `По вашей карте я бы начал с раздела «${related.title}». ${related.key} Ближайший обратимый шаг: ${related.action}`;
}

export async function answerConsultation({ chart, portrait, question, history = [] }) {
  if (!process.env.OPENAI_API_KEY) return localConsultation(portrait, question);

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      input: [
        {
          role: 'system',
          content: `Ты консультант внутри HeroStar. Карта уже рассчитана и собрана локальным ядром; не меняй положения, дома, аспекты и тексты карточек. Отвечай на русском, опираясь только на карту, её редакционную матрицу и ситуацию пользователя. Разделяй: что следует из символической модели, что является практической гипотезой. Не предсказывай неизбежные события, не ставь медицинские или психологические диагнозы. Формат ответа: суть; связь 2–4 элементов карты; один ближайший обратимый шаг; условие, при котором рекомендацию стоит изменить.`,
        },
        {
          role: 'user',
          content: JSON.stringify({ chart: compactChart(chart), portrait, history: history.slice(-6), question }),
        },
      ],
    });
    return response.output_text || localConsultation(portrait, question);
  } catch (error) {
    console.error('OpenAI consultation fallback:', error?.message || error);
    return localConsultation(portrait, question);
  }
}
