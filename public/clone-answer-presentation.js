(() => {
  const PLANET = '(?:Солнц(?:е|а|у|ем)|Лун(?:а|ы|е|у|ой)|Меркури(?:й|я|ю|ем)|Венер(?:а|ы|е|у|ой)|Марс(?:а|у|ом)?|Юпитер(?:а|у|ом)?|Сатурн(?:а|у|ом)?|Уран(?:а|у|ом)?|Нептун(?:а|у|ом)?|Плутон(?:а|у|ом)?)';
  const SIGN = '(?:Овн|Тельц|Близнец|Рак|Льв|Дев|Вес|Скорпион|Стрельц|Козерог|Водол|Рыб)[а-яё]*';
  const ORDINAL_HOUSE = '(?:перв|втор|треть|четв[её]рт|пят|шест|седьм|восьм|девят|десят|одиннадцат|двенадцат)[а-яё]*';
  const TECHNICAL_TOKEN = new RegExp([
    'куспид[а-яё]*',
    'орбис[а-яё]*',
    'тригон[а-яё]*',
    'секстил[а-яё]*',
    'квадратур[а-яё]*',
    'оппозиц[а-яё]*',
    `${PLANET}\\s+ретроград[а-яё]*`,
    `ретроград[а-яё]*(?:\\s+${PLANET})?`,
    'асцендент[а-яё]*',
    'десцендент[а-яё]*',
    '\\b(?:ASC|DSC|MC|IC)\\b',
    `аспект(?:ы|а|ов|е|ом)?(?=[^.!?]{0,40}${PLANET})`,
    '\\d{1,3}(?:[.,]\\d+)?\\s*(?:°|градус(?:а|ов|е|у|ом)?|град\\.)',
    `(?:^|\\s)(?:в\\s+)?(?:[1-9]|1[0-2])(?:-(?:й|я|е|м|го|му|ом))?\\s+дом(?:а|е|ом|у)?(?=$|[\\s,;.!?])`,
    `(?:^|\\s)(?:в\\s+)?${ORDINAL_HOUSE}\\s+дом(?:а|е|ом|у)?(?=$|[\\s,;.!?])`,
    `${PLANET}\\s+(?:находи[а-яё]*\\s+)?(?:в|на)\\s+${SIGN}(?![а-яё])`,
    `соединени[а-яё]*(?=[^.!?]{0,32}(?:${PLANET}|аспект))`,
    `${PLANET}[^.!?]{0,24}соединени[а-яё]*`,
  ].join('|'), 'giu');
  const TECHNICAL_HEADING = /^(?:#{1,4}\s*)?(?:\d+[.)]\s*)?(?:почему|техническое объяснение|факторы карты)\s*[:—-]/iu;
  const CONCLUSION_HEADING = /^(?:#{1,4}\s*)?(?:итог модели|итог|вывод)\s*[:—-]\s*/iu;
  const SAFE_FALLBACK = 'Клон выбрал бы самый ясный и проверяемый ход — тот, который можно подтвердить реальным результатом, а затем спокойно скорректировать без лишнего риска.';

  function technicalTokenCount(value) {
    return (String(value || '').match(TECHNICAL_TOKEN) || []).length;
  }

  function isTechnicalBlock(value) {
    const block = String(value || '').trim();
    if (!block) return false;
    const count = technicalTokenCount(block);
    return count >= 2 || (count >= 1 && TECHNICAL_HEADING.test(block));
  }

  function normalize(value) {
    return String(value || '')
      .replace(/\r\n?/g, '\n')
      .trim()
      .replace(/\n(?=(?:#{1,4}\s*)?(?:\d+[.)]\s*)?(?:почему|техническое объяснение|факторы карты|итог модели|итог|вывод)\s*[:—-])/giu, '\n\n');
  }

  function cleanFragment(value, terminal = '') {
    let fragment = String(value || '')
      .trim()
      .replace(/^[,;:—–\s]+/u, '')
      .replace(/[,;:—–\s]+$/u, '')
      .replace(/\s{2,}/gu, ' ')
      .trim();
    if (!fragment || /^[.!?…]+$/u.test(fragment)) return '';
    fragment = fragment.replace(/^(?:и\s+)?(?:поэтому|значит|в результате)\s+/iu, '');
    fragment = fragment.replace(/^(.)/u, (letter) => letter.toLocaleUpperCase('ru-RU'));
    return terminal && !/[.!?…]$/u.test(fragment) ? `${fragment}${terminal}` : fragment;
  }

  function meaningfulFragment(value) {
    const fragment = String(value || '').trim();
    const words = fragment.match(/[\p{L}\p{N}]+/gu) || [];
    return words.length >= 3 && /(клон|выбра|поступ|сдела|реши|действ|сначала|провери|уточни|подож|отлож|спроси)/iu.test(fragment);
  }

  function technicalMatches(value) {
    return [...String(value || '').matchAll(TECHNICAL_TOKEN)];
  }

  function withoutTechnicalSentence(value) {
    const sentence = String(value || '').trim();
    const matches = technicalMatches(sentence);
    if (!matches.length) return sentence;

    const terminal = sentence.match(/[.!?…]$/u)?.[0] || '';
    const clauses = sentence.split(/(?<=[,;:—–])\s+/u);
    if (clauses.length > 1) {
      const safe = clauses.filter((clause) => !technicalTokenCount(clause) && !TECHNICAL_HEADING.test(clause));
      if (safe.length) return cleanFragment(safe.join(' '), terminal);
    }

    const first = matches[0];
    const last = matches.at(-1);
    const rawPrefix = sentence.slice(0, first.index);
    const prefixWithoutCause = rawPrefix
      .replace(/(?:потому что|так как|поскольку|из-за|благодаря|учитывая|с уч[её]том)\s*$/iu, '');
    const rawSuffix = sentence.slice((last.index || 0) + last[0].length);
    const suffix = cleanFragment(rawSuffix
      .replace(/^(?:,|;|:|—|–)?\s*(?:и\s+)?(?:поэтому|значит|подсказывает,?\s+что|показывает,?\s+что)\s*/iu, ''), terminal);
    if (prefixWithoutCause !== rawPrefix) {
      const joinedSuffix = prefixWithoutCause.trim()
        ? suffix.replace(/^(.)/u, (letter) => letter.toLocaleLowerCase('ru-RU'))
        : suffix;
      const combined = cleanFragment(`${prefixWithoutCause} ${joinedSuffix}`, terminal);
      if (meaningfulFragment(combined)) return combined;
    }
    if (!rawPrefix.trim() && meaningfulFragment(suffix)) return suffix;

    let cursor = 0;
    let neutral = '';
    matches.forEach((match) => {
      neutral += sentence.slice(cursor, match.index);
      neutral += ' это ';
      cursor = (match.index || 0) + match[0].length;
    });
    neutral += sentence.slice(cursor);
    neutral = neutral
      .replace(/(?:\s+это){2,}/giu, ' это')
      .replace(/\s+([,;:.!?])/gu, '$1')
      .replace(/\s{2,}/gu, ' ');
    const redacted = cleanFragment(neutral, terminal);
    return meaningfulFragment(redacted) && !technicalTokenCount(redacted) ? redacted : '';
  }

  function withoutTechnicalSentences(value) {
    const block = String(value || '').trim();
    if (!block) return '';
    if (!technicalTokenCount(block)) return block;
    const sentences = block.split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z0-9«"“])/u);
    return sentences
      .map(withoutTechnicalSentence)
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  function displayCloneAnswer(value) {
    const raw = normalize(value);
    if (!raw) return '';

    const visible = raw
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map(withoutTechnicalSentences)
      .filter(Boolean)
      .map((block) => block.replace(CONCLUSION_HEADING, '').trim())
      .filter(Boolean);

    return visible.join('\n\n') || SAFE_FALLBACK;
  }

  function technicalCloneDetails(value) {
    const raw = normalize(value);
    if (!raw) return '';
    return raw
      .split(/\n{2,}/)
      .flatMap((block) => {
        const clean = block.trim();
        if (!clean || !technicalTokenCount(clean)) return [];
        if (TECHNICAL_HEADING.test(clean) || isTechnicalBlock(clean)) return [clean];
        return clean.split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z0-9«"“])/u)
          .filter((sentence) => technicalTokenCount(sentence));
      })
      .filter(Boolean)
      .join('\n\n');
  }

  globalThis.HeroStarAnswerPresentation = Object.freeze({
    displayCloneAnswer,
    isTechnicalBlock,
    technicalCloneDetails,
  });
})();
