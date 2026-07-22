import OpenAI from 'openai';
import { buildFallbackPortrait } from './narrative.js';

const REASONING_EFFORTS = new Set(['none', 'low', 'medium', 'high', 'xhigh', 'max']);

function compactChart(chart) {
  return {
    version: chart.version,
    person: chart.person,
    birth: chart.birth,
    system: chart.system,
    houses: chart.houses,
    angles: chart.angles,
    planets: chart.planets.map(({ key, name, sign, oppositeSign, element, mode, degreeLabel, house, houseArea, retrograde }) => ({
      key, name, sign, oppositeSign, element, mode, degreeLabel, house, houseArea, retrograde,
    })),
    northNode: chart.northNode,
    aspects: chart.aspects,
  };
}

function envText(env, name, fallback) {
  return String(env?.[name] || '').trim() || fallback;
}

export function normalizeReasoningEffort(value, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  return REASONING_EFFORTS.has(normalized) ? normalized : fallback;
}

export function resolveConsultationConfig(env = process.env) {
  return {
    dialog: {
      model: envText(env, 'OPENAI_MODEL', 'gpt-5.6-terra'),
      effort: normalizeReasoningEffort(env?.OPENAI_REASONING_DIALOG, 'low'),
      maxOutputTokens: 1000,
    },
    deep: {
      model: envText(env, 'OPENAI_MODEL_DEEP', 'gpt-5.6-sol'),
      effort: normalizeReasoningEffort(env?.OPENAI_REASONING_DEEP, 'medium'),
      maxOutputTokens: 1800,
    },
  };
}

export function consultationMode(history = []) {
  const hasEarlierConversation = history.some((message) => {
    const role = String(message?.role || '').toLowerCase();
    const content = String(message?.content || '').trim();
    return content && (role === 'user' || role === 'assistant');
  });
  return hasEarlierConversation ? 'dialog' : 'deep';
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

function systemPrompt(mode) {
  const shared = `Ты консультант внутри HeroStar. Карта уже рассчитана и собрана локальным ядром. Не меняй положения планет, куспиды, дома, аспекты и тексты карточек. Отвечай на русском языке, опираясь только на переданную карту, её редакционную матрицу, историю диалога и ситуацию пользователя.

Не выдавай символическую модель за доказанный факт. Ясно разделяй: что следует из карты как языка саморефлексии, а что является практической гипотезой. Не предсказывай неизбежные события, не ставь медицинские или психологические диагнозы и не подменяй профессиональную помощь.

Пиши понятным человеческим языком без астрологической энциклопедии. Каждое упоминание элемента карты сразу связывай с жизненным проявлением. Не перечисляй больше четырёх элементов карты за один ответ. Не льсти и не соглашайся автоматически: находи реальное напряжение, ресурс и проверяемое действие.`;

  if (mode === 'deep') {
    return `${shared}

Это первый содержательный ответ человеку. Дай ощущение, что HeroStar понял именно его ситуацию и действительно связал её с картой. Структура:
1. «Что я услышал» — точно и бережно отрази суть ситуации в 2–3 предложениях.
2. «Что включилось в карте» — свяжи 2–4 наиболее релевантных элемента через механику функция → проявление в жизни.
3. «Где теряется сила» — покажи внутренний конфликт или ловушку без драматизации.
4. «На что опереться» — назови конкретный ресурс карты.
5. «Ближайший шаг» — предложи одно небольшое обратимое действие, которое можно проверить в реальности.
6. Заверши одним точным вопросом только тогда, когда ответ на него действительно изменит дальнейший маршрут.

Не пересказывай всю карту. Объём — примерно 350–650 слов, если ситуация не требует короче.`;
  }

  return `${shared}

Это продолжение уже начатого разговора. Не повторяй полный разбор и не начинай заново. Учитывай предыдущие сообщения, отвечай на текущую реплику и развивай уже найденную линию. Формат: короткая суть → связь с 1–3 элементами карты → один следующий обратимый шаг. Задавай не более одного уточняющего вопроса и только при реальной необходимости. Обычно укладывайся в 150–350 слов.`;
}

async function requestConsultation(client, { model, effort, maxOutputTokens, mode, chart, portrait, history, question }) {
  const response = await client.responses.create({
    model,
    reasoning: { effort },
    max_output_tokens: maxOutputTokens,
    text: { verbosity: mode === 'deep' ? 'medium' : 'low' },
    input: [
      {
        role: 'system',
        content: systemPrompt(mode),
      },
      {
        role: 'user',
        content: JSON.stringify({
          mode,
          chart: compactChart(chart),
          portrait,
          history: history.slice(-8),
          question,
        }),
      },
    ],
  });

  const answer = String(response.output_text || '').trim();
  if (!answer) throw new Error('OpenAI returned an empty consultation answer.');
  return answer;
}

export async function answerConsultation({ chart, portrait, question, history = [] }) {
  const mode = consultationMode(history);
  const localAnswer = () => localConsultation(portrait, question);

  if (!process.env.OPENAI_API_KEY) return localAnswer();

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const config = resolveConsultationConfig();
  const primary = config[mode];

  try {
    const answer = await requestConsultation(client, {
      ...primary,
      mode,
      chart,
      portrait,
      history,
      question,
    });
    console.info(`[HeroStar AI] mode=${mode} model=${primary.model} effort=${primary.effort}`);
    return answer;
  } catch (primaryError) {
    const canFallbackToDialog = mode === 'deep'
      && (primary.model !== config.dialog.model || primary.effort !== config.dialog.effort);

    if (canFallbackToDialog) {
      console.warn(`[HeroStar AI] deep model failed; retrying with dialog model: ${primaryError?.message || primaryError}`);
      try {
        const answer = await requestConsultation(client, {
          ...config.dialog,
          mode,
          chart,
          portrait,
          history,
          question,
        });
        console.info(`[HeroStar AI] mode=${mode} model=${config.dialog.model} effort=${config.dialog.effort} fallback=true`);
        return answer;
      } catch (fallbackError) {
        console.error('OpenAI consultation fallback failed:', fallbackError?.message || fallbackError);
      }
    } else {
      console.error('OpenAI consultation failed:', primaryError?.message || primaryError);
    }

    return localAnswer();
  }
}
