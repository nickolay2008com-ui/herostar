(() => {
  const LIVE_INSTRUCTION = `Режим «Живая карта решений Звёздного клона». Это самостоятельная символическая модель по натальной карте, а не прогноз поступков человека. Говори «клон поступил бы», не переноси решение напрямую на пользователя.

Продолжай уже начатую ситуацию с памятью. Учитывай исходный вопрос, прежние выводы, подтверждённые человеком наблюдения, выбранные действия и новые обстоятельства. Различай фактор карты, гипотезу клона и подтверждённое опытом.

Для текущей ситуации выбирай релевантную жизненную сферу и при наличии данных используй знак и точный градус куспида, управителя дома, его знак и дом, планеты внутри дома, точные аспекты, ASC/DSC и MC/IC. Северный узел используй как вектор развития только когда он действительно меняет ход.

Показывай практический смысл, а не список терминов. При уместности добавляй «Преимущество вашего клона» как доступную способность гармоничного аспекта, один короткий индивидуальный контраст и небольшой проверяемый ход. Не обещай удачу и не выдавай астрологию за научный прогноз.`;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    let requestInput = input;
    let requestInit = { ...init };
    try {
      const sourceUrl = input instanceof Request ? input.url : String(input);
      const url = new URL(sourceUrl, location.href);
      if (url.origin === location.origin && url.pathname === '/api/config') {
        url.searchParams.set('product', 'clone_live');
        requestInput = input instanceof Request ? new Request(url, input) : url.toString();
      }

      const method = String(requestInit.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (url.origin === location.origin && url.pathname === '/api/consult' && method === 'POST' && requestInit.body) {
        const body = JSON.parse(String(requestInit.body));
        if (body.experience === 'live') {
          body.question = `${LIVE_INSTRUCTION}\n\nТекущая реплика и сохранённый контекст:\n${String(body.question || '').trim()}`;
          requestInit.body = JSON.stringify(body);
        }
      }
    } catch {
      // Адаптер не должен ломать исходный запрос при неожиданном формате.
    }
    return originalFetch(requestInput, requestInit);
  };
})();
