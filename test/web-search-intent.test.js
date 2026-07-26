import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSanitizedSearchRequest,
  classifySearchPolicy,
  explicitWebSearchIntent,
} from '../src/web-search-intent.js';

test('явные внешние команды включают web search', () => {
  assert.equal(explicitWebSearchIntent('Найди хорошие кеды рядом'), true);
  assert.equal(explicitWebSearchIntent('Поищи реальные цены на Ozon'), true);
  assert.equal(explicitWebSearchIntent('Погугли свежую документацию Node.js'), true);
  assert.equal(explicitWebSearchIntent('А теперь найди это в интернете'), true);
  assert.equal(explicitWebSearchIntent('А теперь найди это рядом'), true);
  assert.equal(explicitWebSearchIntent('Дай реальные ссылки на вакансии'), true);
  assert.equal(explicitWebSearchIntent('Какие сейчас есть вакансии Node.js'), true);
  assert.equal(explicitWebSearchIntent('Посмотри актуальное расписание'), true);
  assert.equal(explicitWebSearchIntent('Найди новости про OpenAI'), true);
  assert.equal(explicitWebSearchIntent('Найди погоду в Казани'), true);
});

test('контекстные команды требуют внешнего сигнала', () => {
  assert.equal(explicitWebSearchIntent('Проверь актуальные цены в интернете'), true);
  assert.equal(explicitWebSearchIntent('Сравни наличие на ozon.ru и wildberries.ru'), true);
  assert.equal(explicitWebSearchIntent('Подбери варианты со ссылками'), true);
  assert.equal(explicitWebSearchIntent('Покажи, где купить рядом'), true);

  assert.equal(explicitWebSearchIntent('Какой стиль мне подходит?'), false);
  assert.equal(explicitWebSearchIntent('Подбери образ по карте'), false);
  assert.equal(explicitWebSearchIntent('Сравни эти два образа'), false);
  assert.equal(explicitWebSearchIntent('Проверь мой вывод'), false);
  assert.equal(explicitWebSearchIntent('Найди главное противоречие в моей карте'), false);
  assert.equal(explicitWebSearchIntent('Поищи причину в моём поведении'), false);
  assert.equal(explicitWebSearchIntent('Покажи, что рядом с моим Асцендентом'), false);
  assert.equal(explicitWebSearchIntent('Покажи, кто рядом со мной'), false);
});

test('отрицание не превращается в запрос поиска', () => {
  assert.equal(explicitWebSearchIntent('Не ищи это в интернете'), false);
  assert.equal(explicitWebSearchIntent('Ответь без веб-поиска'), false);
});

test('эллиптический запрос получает только последнюю user-реплику', () => {
  const request = buildSanitizedSearchRequest('А теперь найди это в интернете', [
    { role: 'user', content: 'Мне нужны фиолетовые кеды 39 размера' },
    { role: 'assistant', content: 'Секрет ассистента, который нельзя передавать' },
    { role: 'user', content: 'Лучше без высокой платформы' },
    { role: 'assistant', content: 'Ещё один закрытый ответ' },
  ]);

  assert.match(request.query, /Контекст: Лучше без высокой платформы/);
  assert.match(request.query, /Запрос: А теперь найди это в интернете/);
  assert.doesNotMatch(request.query, /фиолетовые кеды/i);
  assert.doesNotMatch(request.query, /секрет ассистента|закрытый ответ/i);
});

test('самодостаточный запрос не получает историю', () => {
  const request = buildSanitizedSearchRequest('Найди билеты Москва — Казань', [
    { role: 'user', content: 'Мой прошлый приватный вопрос' },
  ]);

  assert.equal(request.query, 'Найди билеты Москва — Казань');
});

test('поисковый запрос очищается от идентификаторов и URL query', () => {
  const request = buildSanitizedSearchRequest(
    'Найди на https://ozon.ru/search/?text=ботинки&utm_source=secret для user@example.com, ' +
      '@private_user, +7 (999) 123-45-67, chartToken=secret-token-12345, ' +
      '550e8400-e29b-41d4-a716-446655440000 и 999 123 45 67',
  );

  assert.match(request.query, /https:\/\/ozon\.ru\/search\//);
  assert.doesNotMatch(request.query, /text=|utm_source|example\.com|private_user/);
  assert.doesNotMatch(request.query, /999|secret-token|550e8400/i);
  assert.deepEqual(request.allowedDomains, ['ozon.ru']);
});

test('контекст эллиптического поиска удаляет персональные и медицинские данные', () => {
  const request = buildSanitizedSearchRequest('А теперь найди это в интернете', [
    {
      role: 'user',
      content: 'Меня зовут Анна Петрова. Дата рождения 12.03.1991. Живу: улица Ленина, дом 10. Диагноз — редкая болезнь. Ищу выставку в Казани.',
    },
  ]);

  assert.match(request.query, /выставку в Казани/i);
  assert.doesNotMatch(request.query, /Анна Петрова|12\.03\.1991|Ленина|дом 10|диагноз|болезнь/i);
});

test('прямой и англоязычный контекст не передают самопредставление, адрес и здоровье', () => {
  const direct = buildSanitizedSearchRequest(
    'Найди кафе рядом. Меня зовут Иван Иванов, живу на улице Ленина 20. У меня ВИЧ.',
  );
  assert.match(direct.query, /Найди кафе рядом/);
  assert.doesNotMatch(direct.query, /Иван|Ленина|ВИЧ/i);

  const elliptical = buildSanitizedSearchRequest('А теперь найди это в интернете', [
    {
      role: 'user',
      content: 'My name is Nikolai Ivanov. I live at 123 Main Street. I have HIV. I need a cafe in Kazan.',
    },
  ]);
  assert.match(elliptical.query, /cafe in Kazan/i);
  assert.doesNotMatch(elliptical.query, /Nikolai|Main Street|HIV/i);

  const directIntroductions = [
    buildSanitizedSearchRequest('Я — Иван Иванов. Найди кафе рядом с моим домом.').query,
    buildSanitizedSearchRequest('Я Иван Иванов. Найди кафе рядом с моим домом.').query,
    buildSanitizedSearchRequest("I'm Nikolai Ivanov. Search for a cafe nearby.").query,
    buildSanitizedSearchRequest('I’m Nikolai Ivanov. Search for a cafe nearby.').query,
  ];
  assert.doesNotMatch(directIntroductions.join(' '), /Иван Иванов|Nikolai Ivanov/i);
  assert.match(
    buildSanitizedSearchRequest('Я хочу купить пальто. Найди варианты на Ozon.').query,
    /Я хочу купить пальто/,
  );
});

test('итоговый query ограничен 800 символами и сохраняет текущий эллипсис', () => {
  const request = buildSanitizedSearchRequest('А теперь найди это в интернете', [
    { role: 'user', content: `Футболка ${'очень '.repeat(300)}` },
  ]);

  assert.equal(request.query.length, 800);
  assert.match(request.query, /\nЗапрос: А теперь найди это в интернете$/);
});

test('policy блокирует поиск частного лица и опасное злоупотребление', () => {
  assert.deepEqual(
    classifySearchPolicy('Найди адрес частного человека по его фотографии'),
    {
      allowed: false,
      reason: 'private_person_lookup',
      category: 'general',
      allowedDomains: [],
    },
  );
  assert.equal(
    classifySearchPolicy('Поищи инструкцию, как обойти 2FA чужого аккаунта').reason,
    'high_risk_wrongdoing',
  );
  assert.equal(
    classifySearchPolicy('Найди соцсети Анны Петровой').reason,
    'private_person_lookup',
  );
  assert.equal(
    classifySearchPolicy('найди соцсети анны петровой').reason,
    'private_person_lookup',
  );
  assert.equal(
    classifySearchPolicy('найди адрес ивана иванова').reason,
    'private_person_lookup',
  );
  assert.equal(
    classifySearchPolicy('Поищи соцсети анны ким в интернете').reason,
    'private_person_lookup',
  );
  assert.equal(
    classifySearchPolicy('Найди телефон маши в интернете').reason,
    'private_person_lookup',
  );
  assert.equal(
    classifySearchPolicy("Search for Alice Smith's address online").reason,
    'private_person_lookup',
  );
  assert.equal(
    classifySearchPolicy('Найди адрес магазина Ozon').allowed,
    false,
  );
  assert.equal(
    classifySearchPolicy('Поищи телефон анны ким, она работает в компании Ромашка, в интернете').allowed,
    false,
  );
  assert.equal(
    classifySearchPolicy("Search for Alice Smith's phone number at company Acme online").allowed,
    false,
  );
  assert.equal(
    classifySearchPolicy('Найди адрес маши рядом с магазином Ozon в интернете').allowed,
    false,
  );
});

test('policy классифицирует предметную область', () => {
  const examples = [
    ['Найди клинику рядом', 'medical'],
    ['Поищи актуальный закон об аренде', 'legal'],
    ['Сравни ставки по ипотеке онлайн', 'financial'],
    ['Покажи цену и наличие на Ozon', 'commerce'],
    ['Найди отель в Казани', 'travel'],
    ['Погугли документацию OpenAI SDK', 'technical'],
    ['Найди выставки рядом', 'general'],
  ];

  for (const [question, category] of examples) {
    assert.equal(classifySearchPolicy(question).category, category, question);
  }
  assert.equal(classifySearchPolicy('Найди клинику рядом').allowed, false);
  assert.equal(classifySearchPolicy('Поищи актуальный закон об аренде').allowed, false);
  assert.equal(classifySearchPolicy('Сравни ставки по ипотеке онлайн').allowed, false);
  assert.equal(classifySearchPolicy('Погугли, можно ли мне принимать ибупрофен при беременности').allowed, false);
  assert.equal(classifySearchPolicy('Погугли, можно ли не платить алименты').allowed, false);
  assert.equal(classifySearchPolicy('Погугли, куда вложить сбережения').allowed, false);
  assert.equal(classifySearchPolicy('Погугли, чем сбить температуру ребёнку').allowed, false);
  assert.equal(classifySearchPolicy('Погугли, что делать при давлении 180').allowed, false);
  assert.equal(classifySearchPolicy('Погугли, можно ли уволить сотрудника без предупреждения').allowed, false);
  assert.equal(classifySearchPolicy('Погугли, стоит ли купить доллары сейчас').allowed, false);
  assert.equal(classifySearchPolicy('Погугли, чем сбить жар ребёнку').allowed, false);
  assert.equal(classifySearchPolicy('Погугли, что делать если пульс 180').allowed, false);
  assert.equal(classifySearchPolicy('Погугли, можно ли не выходить на работу, если не заплатили зарплату').allowed, false);
  assert.equal(classifySearchPolicy('Погугли, куда положить деньги под проценты').allowed, false);
  assert.equal(classifySearchPolicy('Погугли, стоит ли брать рассрочку').allowed, false);
});

test('policy извлекает явные hostnames и известные маркетплейсы', () => {
  assert.deepEqual(
    classifySearchPolicy(
      'Сравни на Ozon, Wildberries и https://shop.example.com/catalog?q=1',
    ).allowedDomains,
    ['ozon.ru', 'wildberries.ru', 'shop.example.com'],
  );
  assert.deepEqual(
    classifySearchPolicy('Какие сейчас вакансии Node.js').allowedDomains,
    [],
  );
});
