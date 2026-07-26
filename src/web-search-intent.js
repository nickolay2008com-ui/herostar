const MAX_SEARCH_QUERY_LENGTH = 800;

const UNAMBIGUOUS_WEB_COMMAND =
  /(?:^|[^a-z\u0430-\u044f\u0451])(?:погугл(?:и|ите)|(?:search|look\s+up)\s+(?:online|the\s+web)|google)(?![a-z\u0430-\u044f\u0451])/i;
const SEARCH_COMMAND =
  /(?:^|[^a-z\u0430-\u044f\u0451])(?:найд(?:и|ите)|поищ(?:и|ите)|отыщ(?:и|ите)|проверь(?:те)?|сравни(?:те)?|подбер(?:и|ите)|покаж(?:и|ите)|посмотр(?:и|ите)|search\s+for|check|compare|select|show|look\s+up)(?![a-z\u0430-\u044f\u0451])/i;
const CONTEXTUAL_SEARCH_COMMAND =
  /(?:^|[^a-z\u0430-\u044f\u0451])(?:проверь(?:те)?|сравни(?:те)?|подбер(?:и|ите)|покаж(?:и|ите)|посмотр(?:и|ите)|check|compare|select|show|look\s+up)(?![a-z\u0430-\u044f\u0451])/i;
const NEGATED_SEARCH =
  /(?:не\s+(?:(?:надо|нужно|стоит)\s+)?(?:искать|ищи|ищите|гуглить|гугли|гуглите|проверять|проверь|сравнивать|сравни|подбирать|подбери|показывать|покажи)(?![a-z\u0430-\u044f\u0451])|без\s+(?:веб-?|интернет-?)?поиска(?![a-z\u0430-\u044f\u0451]))/i;

const HOSTNAME_PATTERN =
  /(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9\u0430-\u044f\u0451](?:[a-z0-9\u0430-\u044f\u0451-]{0,61}[a-z0-9\u0430-\u044f\u0451])?\.)+(?:[a-z\u0430-\u044f\u0451]{2,63}))(?:[/:?#]|\b)/giu;
const CODE_FILE_HOSTNAMES = new Set([
  'node.js',
  'react.js',
  'vue.js',
  'next.js',
  'nuxt.js',
  'express.js',
  'three.js',
]);

const MARKETPLACES = [
  { pattern: /\b(?:ozon|озон)\b/i, domain: 'ozon.ru' },
  { pattern: /\b(?:wildberries|вайлдберриз|wb)\b/i, domain: 'wildberries.ru' },
  { pattern: /\b(?:яндекс[ -]?маркет|yandex[ -]?market)\b/i, domain: 'market.yandex.ru' },
  { pattern: /\b(?:алиэкспресс|aliexpress)\b/i, domain: 'aliexpress.ru' },
  { pattern: /\b(?:lamoda|ламода)\b/i, domain: 'lamoda.ru' },
  { pattern: /\b(?:avito|авито)\b/i, domain: 'avito.ru' },
  { pattern: /\b(?:мегамаркет|megamarket)\b/i, domain: 'megamarket.ru' },
  { pattern: /\bamazon\b/i, domain: 'amazon.com' },
  { pattern: /\bebay\b/i, domain: 'ebay.com' },
];

const CATEGORY_PATTERNS = [
  {
    category: 'medical',
    pattern:
      /(?:(?:врач|доктор|клиник|болезн|диагноз|симптом|лечени|лекарств|препарат|дозиров|анализ|здоровь|беременн|принимать|ибупрофен|парацетамол|антибиотик|вич|спид|онколог|жар|пульс|medical|doctor|clinic|diagnos|symptom|medicine|treatment|pregnan|ibuprofen|hiv|fever|pulse)[a-zа-яё]*|сбить[\s\S]{0,30}температур|температур[a-zа-яё]*[\s\S]{0,30}(?:реб[её]н|малыш)|(?:давлени|пульс)[a-zа-яё]*\s*(?:1[4-9]\d|2\d{2}))/i,
  },
  {
    category: 'legal',
    pattern:
      /(?:закон|юрист|адвокат|суд|договор|право|лицензи|регуляц|алимент|штраф|иск|уволить|увольн|работодатель|зарплат|не\s+выходить\s+на\s+работ|трудов[a-zа-яё]*\s+договор|legal|lawyer|attorney|court|contract|regulation|alimony|salary|fire\s+an?\s+employee)[a-zа-яё]*/i,
  },
  {
    category: 'financial',
    pattern:
      /(?:инвестиц|акци|облигац|кредит|ипотек|банк|страхов|курс(?:ы)? валют|налог|крипт|финанс|вложить|сбережени|доходност|доллар|евро|валют|деньг|процент|рассроч|вклад|investment|stock|bond|loan|mortgage|bank|insurance|crypto|financial|savings|currency|installment|interest)[a-zа-яё]*/i,
  },
  {
    category: 'commerce',
    pattern:
      /(?:цен[аеуы]|стоимост|купить|заказать|наличи|доставк|товар|магазин|маркетплейс|price|buy|order|availability|delivery|product|shop|store)\w*/i,
  },
  {
    category: 'travel',
    pattern:
      /(?:путешеств|поездк|отел|гостиниц|авиабилет|рейс|виза|маршрут|достопримечательност|travel|trip|tour|hotel|flight|visa|route)[a-zа-яё]*/i,
  },
  {
    category: 'technical',
    pattern:
      /(?:код|программир|разработк|библиотек|фреймворк|api|sdk|github|npm|python|javascript|typescript|node\.?js|ошибк|баг|документац|software|programming|library|framework|documentation|error)\w*/i,
  },
];

const PRIVATE_PERSON_LOOKUP =
  /(?:(?:найд(?:и|ите)|поищ(?:и|ите)|разыщ(?:и|ите)|отыщ(?:и|ите)|пробей(?:те)?|установи(?:те)?|деанонимизируй(?:те)?|вычисли(?:те)?|отследи(?:те)?)[\s\S]{0,90}(?:частн(?:ого|ый)\s+человек|человек(?:а)?|одноклассник|бывш(?:его|ую)|сосед(?:а|ку)?|владелец\s+номер|личност|кто\s+это))|(?:(?:адрес|телефон|почт[ау]|email|паспорт|место\s+жительств|где\s+жив[её]т|геолокаци|личные\s+данные|соцсет[ьи])[\s\S]{0,90}(?:человек|его|е[её]|девушк|парн|мужчин|женщин|владелец))|(?:\b(?:find|locate|track|doxx?|deanonymi[sz]e)\b[\s\S]{0,90}\b(?:private\s+person|person|classmate|ex|neighbor|home\s+address|phone|email|location|identity)\b)/i;
const NAMED_PRIVATE_PERSON_LOOKUP =
  /(?:найд(?:и|ите)|поищ(?:и|ите)|пробей(?:те)?)[\s\S]{0,100}(?:адрес|телефон|почт[ау]|email|паспорт|геолокаци|личные\s+данные|соцсет[ьи])[\s\S]{0,70}[а-яё-]{2,}\s+[а-яё-]{2,}(?:ов(?:а|ой|у)?|ев(?:а|ой|у)?|ин(?:а|ой|у)?|ск(?:ий|ая|ого|ой)|ко|ян|янц)(?![а-яё-])|(?:адрес|телефон|почт[ау]|email|паспорт|геолокаци|личные\s+данные|соцсет[ьи])[\s\S]{0,70}[а-яё-]{2,}\s+[а-яё-]{2,}(?:ов(?:а|ой|у)?|ев(?:а|ой|у)?|ин(?:а|ой|у)?|ск(?:ий|ая|ого|ой)|ко|ян|янц)(?![а-яё-])/i;
const SENSITIVE_LOOKUP =
  /(?:адрес|телефон|номер\s+телефона|почт[ау]|e-?mail|паспорт|геолокаци|личные\s+данные|соцсет[ьи]|social\s+media|address|phone\s+number|location)/i;

const HIGH_RISK_WRONGDOING =
  /(?:(?:взлома?ть|хакнуть|обойти\s+(?:защит|парол|2fa|блокиров)|украсть\s+(?:парол|аккаунт|данные)|фишинг|вредонос|малвар|ransomware|ddos|ботнет|эксплойт)\w*|(?:сделать|собрать|изготовить|купить)[\s\S]{0,70}(?:бомб|взрывчат|огнестрельн|оружи|глушител|яд)\w*|(?:купить|продать|изготовить|синтезировать)[\s\S]{0,70}(?:наркотик|метамфетамин|фентанил|кокаин|героин)\w*|(?:отмыть\s+деньги|подделать\s+(?:документ|паспорт|деньги)|кардинг|обналич|угнать)\w*|\b(?:hack|bypass\s+(?:security|password|2fa)|steal\s+(?:password|account|data)|phishing|malware|ransomware|ddos|botnet|exploit)\w*|\b(?:build|make|buy)\b[\s\S]{0,70}\b(?:bomb|explosive|firearm|weapon|poison)\w*|\b(?:buy|sell|manufacture|synthesize)\b[\s\S]{0,70}\b(?:methamphetamine|fentanyl|cocaine|heroin)\w*)/i;

const ELLIPTICAL_SEARCH =
  /^(?:а\s+)?(?:и\s+)?(?:теперь\s+)?(?:найд(?:и|ите)|поищ(?:и|ите)|погугл(?:и|ите)|проверь(?:те)?|сравни(?:те)?|подбер(?:и|ите)|покаж(?:и|ите))\s+(?:(?:мне|нам)\s+)?(?:это|такое|такие|этот|эту|эти|его|е[её]|их|там|рядом|похож(?:ее|ие|ий|ую)|то\s+же)(?![a-z\u0430-\u044f\u0451])/i;

function normalizedText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\u0451/gi, (letter) => (letter === '\u0401' ? '\u0415' : '\u0435'))
    .trim();
}

function explicitHostnames(question) {
  const withoutEmails = normalizedText(question).replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    ' ',
  );
  const domains = new Set();

  for (const marketplace of MARKETPLACES) {
    if (marketplace.pattern.test(withoutEmails)) domains.add(marketplace.domain);
  }

  for (const match of withoutEmails.matchAll(HOSTNAME_PATTERN)) {
    const hostname = match[1].toLowerCase().replace(/^www\./, '');
    if (
      hostname
      && !hostname.endsWith('.local')
      && !CODE_FILE_HOSTNAMES.has(hostname)
      && !/\.(?:js|ts|py|rb|go|rs|java|css|html|json|md)$/i.test(hostname)
    ) {
      domains.add(hostname);
    }
  }

  return [...domains];
}

function hasExternalSignal(question) {
  const text = normalizedText(question);
  if (explicitHostnames(text).length > 0) return true;
  if (MARKETPLACES.some(({ pattern }) => pattern.test(text))) return true;

  return /(?:(?:интернет|веб|сеть|онлайн|гугл|сайт|маркетплейс|ссылк|источник|ваканси|афиш|расписани|билет|отел|гостиниц|выставк|концерт|товар|новост|погод|кафе|ресторан|магазин|музей|театр|сервис|кед|обув|одежд|пальто|куртк)[a-zа-яё]*|(?:актуальн|свеж|последн|реальн)[a-zа-яё]*[\s\S]{0,25}(?:данн|информац|цен|новост|ссылк|ваканси|расписани)[a-zа-яё]*|(?:сегодня|сейчас)[\s\S]{0,45}(?:цен|наличи|расписани|курс|данн|информац|новост|ваканси|событи)[a-zа-яё]*|(?:цен[аеуы]|стоимост|наличи|где\s+купить|купить|заказать)(?![a-z\u0430-\u044f\u0451])|\b(?:internet|web|online|website|marketplace|link|source|current|latest|today|price|availability|job|vacancy|schedule|ticket|hotel|product|news|weather|cafe|restaurant|store|museum|service|shoes|clothes|where\s+to\s+buy)\b)/i.test(
    text,
  );
}

function targetsInternalConversation(question) {
  return /(?:(?:в|из|по|на)\s+(?:мо(?:ей|ём|ем|ю)|эт(?:ой|ом|от|у)|текущ(?:ей|ем))?\s*(?:натальн[a-zа-яё]*\s+)?(?:карт[a-zа-яё]*|диалог[a-zа-яё]*|ответ[a-zа-яё]*|текст[a-zа-яё]*|сообщени[a-zа-яё]*|ситуаци[a-zа-яё]*|поведени[a-zа-яё]*)|(?:мо(?:ю|ей)|эт(?:у|ой))\s+(?:карт[a-zа-яё]*|ситуаци[a-zа-яё]*|поведени[a-zа-яё]*)|(?:рядом|поблизости)\s+с\s+(?:мо(?:им|ей)|эт(?:им|ой))?\s*(?:асцендент[a-zа-яё]*|планет[a-zа-яё]*|дом[a-zа-яё]*|аспект[a-zа-яё]*))/i.test(
    normalizedText(question),
  );
}

export function explicitWebSearchIntent(question) {
  const text = normalizedText(question);
  if (!text || NEGATED_SEARCH.test(text)) return false;
  if (UNAMBIGUOUS_WEB_COMMAND.test(text)) return true;
  if (ELLIPTICAL_SEARCH.test(text) && /(?:рядом|поблизости|там|онлайн|в\s+интернете)/i.test(text)) {
    return true;
  }
  if (targetsInternalConversation(text)) return false;
  if (SEARCH_COMMAND.test(text) && hasExternalSignal(text)) return true;
  if (CONTEXTUAL_SEARCH_COMMAND.test(text) && hasExternalSignal(text)) return true;
  return /(?:дай|пришли|покажи|подбери)\s+(?:мне\s+)?(?:реальн[a-zа-яё]*\s+|актуальн[a-zа-яё]*\s+)?(?:ссылк|источник)[a-zа-яё]*/i.test(text)
    || /(?:какие|что|где)\s+(?:сейчас|сегодня)(?![a-zа-яё])[\s\S]{0,70}(?:ваканси|событи|цен|расписани|наличи)[a-zа-яё]*/i.test(text);
}

export function classifySearchPolicy(question) {
  const text = normalizedText(question);
  let reason = null;

  if (
    (SEARCH_COMMAND.test(text) || UNAMBIGUOUS_WEB_COMMAND.test(text))
    && SENSITIVE_LOOKUP.test(text)
  ) {
    reason = 'private_person_lookup';
  } else if (PRIVATE_PERSON_LOOKUP.test(text) || NAMED_PRIVATE_PERSON_LOOKUP.test(text)) {
    reason = 'private_person_lookup';
  }
  const category =
    CATEGORY_PATTERNS.find(({ pattern }) => pattern.test(text))?.category || 'general';
  if (!reason && HIGH_RISK_WRONGDOING.test(text)) reason = 'high_risk_wrongdoing';
  if (!reason && ['medical', 'legal', 'financial'].includes(category)) {
    reason = 'high_stakes_search';
  }

  return {
    allowed: reason === null,
    reason,
    category,
    allowedDomains: explicitHostnames(text),
  };
}

function sanitizeSearchText(value) {
  return normalizedText(value)
    .replace(
      /(?:^|[.!?]\s*)[яЯ]\s*[-—:]\s*[А-ЯЁ][а-яё-]{2,}\s+[А-ЯЁ][а-яё-]{2,}[.!?]?/g,
      ' ',
    )
    .replace(
      /(?:^|[.!?]\s*)[яЯ]\s+[А-ЯЁ][а-яё-]{2,}\s+[А-ЯЁ][а-яё-]{2,}[.!?]?/g,
      ' ',
    )
    .replace(
      /(?:^|[.!?]\s*)[iI](?:['’][mM]|\s+[aA]m)\s+[A-Z][a-z-]{2,}\s+[A-Z][a-z-]{2,}[.!?]?/g,
      ' ',
    )
    .replace(
      /(?:меня\s+зовут|мо[её]\s+имя|my\s+name\s+is)\s+[^.!?\n]{2,100}[.!?]?/gi,
      ' ',
    )
    .replace(
      /(?:я\s+живу|живу|i\s+live)\s+(?:по\s+адресу|на|at|in)?\s*[^.!?\n]{2,140}[.!?]?/gi,
      ' ',
    )
    .replace(
      /(?:у\s+меня|мне\s+диагностировали|я\s+болею|i\s+have|i\s+was\s+diagnosed\s+with)\s+[^.!?\n]*(?:вич|спид|диагноз|болезн|синдром|рак|онколог|hiv|aids|diagnos|disease|syndrome|cancer)[^.!?\n]*[.!?]?/gi,
      ' ',
    )
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      ' ',
    )
    .replace(
      /(^|[\s([])@[A-Z0-9_]{3,32}\b/gi,
      '$1 ',
    )
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      ' ',
    )
    .replace(
      /\b(?:telegram|tg|chart|clone)[ _-]?(?:id|token|key)\s*[:=]\s*["']?[A-Z0-9._~-]{4,}["']?/gi,
      ' ',
    )
    .replace(
      /\b(?:chart|telegram|clone)[_-](?:token|id|key)[=:][A-Z0-9._~-]{4,}\b/gi,
      ' ',
    )
    .replace(
      /\beyJ[A-Z0-9_-]{10,}\.[A-Z0-9_-]{10,}(?:\.[A-Z0-9_-]{10,})?\b/gi,
      ' ',
    )
    .replace(
      /\b[A-Z0-9_-]{40,}\b/gi,
      ' ',
    )
    .replace(
      /(?:\+?\d[\s().-]*){9,14}\d/g,
      ' ',
    )
    .replace(
      /(?:^|[\s,;(])(?:дата\s+рождения|родил(?:ся|ась))\s*[:=-]?\s*\d{1,4}[./-]\d{1,2}[./-]\d{1,4}(?!\d)/gi,
      ' ',
    )
    .replace(
      /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g,
      ' ',
    )
    .replace(
      /(?:^|[\s,;(])(?:адрес|улиц[аеуы]|ул\.|проспект[аеуы]?|пр-т|переулок[аеуы]?|дом|д\.|квартир[аеуы]|кв\.|street|avenue|road|boulevard|lane)\s*[:=-]?\s*[^,.;!?\n]{2,100}/gi,
      ' ',
    )
    .replace(
      /https?:\/\/[^\s<>"']+/gi,
      (url) => url.replace(/[?#].*$/, '').replace(/[),.;:!?]+$/, ''),
    )
    .replace(
      /\b((?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,63}(?:\/[^\s?#]*)?)[?#][^\s<>"']*/gi,
      '$1',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizePreviousUserContext(value) {
  return sanitizeSearchText(value)
    .replace(
      /[^.!?\n]*(?:диагноз|болею|болезн|симптом|лекарств|препарат|здоровь|медицин|вич|спид|diagnos|disease|symptom|medicine|health|medical|hiv|aids)[^.!?\n]*/gi,
      ' ',
    )
    .replace(/(?:^|[\s,;(])[А-ЯЁ][а-яё-]{2,}\s+[А-ЯЁ][а-яё-]{2,}(?![а-яё-])/g, ' ')
    .replace(/(?:^|[\s,;(])[A-Z][a-z-]{2,}\s+[A-Z][a-z-]{2,}(?![a-z-])/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lastUserContext(question, history) {
  const current = normalizedText(question);
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role !== 'user') continue;
    const content = normalizedText(message.content);
    if (!content || content === current) continue;
    return sanitizePreviousUserContext(content);
  }
  return '';
}

function boundedSearchQuery(question, history) {
  const current = sanitizeSearchText(question);
  if (!ELLIPTICAL_SEARCH.test(normalizedText(question))) {
    return current.slice(0, MAX_SEARCH_QUERY_LENGTH);
  }

  const context = lastUserContext(question, Array.isArray(history) ? history : []);
  if (!context) return current.slice(0, MAX_SEARCH_QUERY_LENGTH);

  const requestLabel = 'Запрос: ';
  const contextLabel = 'Контекст: ';
  const boundedCurrent = current.slice(
    0,
    MAX_SEARCH_QUERY_LENGTH - requestLabel.length,
  );
  const remaining =
    MAX_SEARCH_QUERY_LENGTH -
    requestLabel.length -
    boundedCurrent.length -
    contextLabel.length -
    1;

  if (remaining <= 0) return `${requestLabel}${boundedCurrent}`;
  return `${contextLabel}${context.slice(0, remaining)}\n${requestLabel}${boundedCurrent}`;
}

export function buildSanitizedSearchRequest(question, history = []) {
  return {
    query: boundedSearchQuery(question, history),
    ...classifySearchPolicy(question),
  };
}
