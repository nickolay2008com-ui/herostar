const progress = document.querySelector('#treasureProgress');
let lastTotal = 0;
let lastUnlocked = 0;
let scheduled = false;

const loadingCopy = new Map([
  ['Определяем небесную схему', 'Рассчитываем положения'],
  ['Планеты считаются отдельно. ИИ не получает права сочинять космос, к счастью.', 'Определяем точные координаты карты.'],
  ['Строим оси и дома', 'Определяем сферы жизни'],
  ['Место и исторический часовой пояс превращаются в конкретную геометрию карты.', 'Показываем, где проявляется каждый ресурс.'],
  ['Ищем контрасты', 'Проверяем контрасты'],
  ['Каждое качество сравнивается с противоположным типом, чтобы убрать универсальную кашу.', 'Сравниваем противоположные проявления, чтобы убрать общие формулировки.'],
  ['Соединяем внутренние механизмы', 'Соединяем элементы'],
  ['Планеты перестают быть списком и начинают объяснять, как части личности работают вместе.', 'Собираем ресурсы и противоречия в цельную картину.'],
  ['Собираем маршрут', 'Формируем маршрут'],
  ['Ловушки переводятся в конкретные ключи и обратимые действия.', 'Переводим выводы в конкретные действия.'],
]);

const stepCopy = new Map([
  ['Точные положения', 'Положения'],
  ['Сферы проявления', 'Сферы'],
  ['Анти-Барнум', 'Контрасты'],
  ['Синтез', 'Синтез'],
  ['Практический путь', 'Маршрут'],
]);

const toastCopy = new Map([
  ['Сначала привяжем карту к Telegram. Без паролей и почтового фольклора.', 'Сохраните карту через Telegram, чтобы открыть полный доступ.'],
  ['Войдите через Telegram, чтобы консультант мог продолжать разговор.', 'Войдите через Telegram, чтобы продолжить разбор.'],
  ['Профиль привязан. Осталось открыть полную карту.', 'Карта сохранена. Полный доступ пока закрыт.'],
  ['Описание и ссылка скопированы.', 'Ссылка скопирована.'],
  ['Telegram подключён. Карта сохранена.', 'Карта сохранена.'],
  ['Платёж ещё подтверждается. Обновите карту чуть позже.', 'Оплата подтверждается. Обновите карту позже.'],
]);

function setText(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

function decorateCards() {
  const cards = [...document.querySelectorAll('.treasure-card')];
  if (!cards.length) return;

  cards.forEach((card) => {
    const number = card.querySelector('.card-title small');
    if (number) setText(number, number.textContent.replace(/^Ключ\s+/u, 'Сокровище '));

    card.querySelectorAll('.insight span').forEach((label) => {
      const replacements = {
        'Уникальный пример': 'Ваш ресурс',
        'Как бывает иначе': 'Как проявляется иначе',
        'Главная ловушка': 'Что блокирует',
        'Личный ключ': 'Что помогает',
      };
      if (replacements[label.textContent]) setText(label, replacements[label.textContent]);
    });

    const actionLabel = card.querySelector('.action-box b');
    if (actionLabel) setText(actionLabel, 'Первый ход');

    const unlockTitle = card.querySelector('.unlock-box b');
    const unlockText = card.querySelector('.unlock-box p');
    const unlockButton = card.querySelector('.unlock-box button');
    if (unlockTitle) setText(unlockTitle, 'Сокровище закрыто');
    if (unlockText) setText(unlockText, 'Внутри — ресурс, блок, ключ и действие.');
    if (unlockButton) setText(unlockButton, 'Открыть все 11');
  });

  const allModeActive = document.querySelector('.mode-tabs button[data-category="all"]')?.classList.contains('active');
  const unlocked = cards.filter((card) => !card.classList.contains('locked-card')).length;
  if (allModeActive || cards.length > lastTotal) {
    lastTotal = cards.length;
    lastUnlocked = unlocked;
  } else if (cards.length === lastTotal) {
    lastUnlocked = unlocked;
  }

  if (progress && lastTotal) {
    const percentage = Math.round((lastUnlocked / lastTotal) * 100);
    const markup = `<div class="treasure-progress-copy"><span>Прогресс</span><strong>Открыто ${lastUnlocked} из ${lastTotal}</strong></div><div class="treasure-progress-track" aria-hidden="true"><i style="width:${percentage}%"></i></div><small>Ресурс → блок → ключ → действие</small>`;
    if (progress.innerHTML !== markup) progress.innerHTML = markup;
  }
}

function decorateSynthesis() {
  const synthesis = document.querySelector('#synthesis');
  if (!synthesis?.children.length) return;

  const kicker = synthesis.querySelector('.panel-kicker');
  if (kicker) setText(kicker, 'Итог карты');

  synthesis.querySelectorAll('.synthesis-block h4').forEach((heading) => {
    const replacements = {
      'Сильные опоры': 'Ваши опоры',
      'Внутренние узлы': 'Что мешает',
      'Маршрут': 'Что делать',
    };
    if (replacements[heading.textContent]) setText(heading, replacements[heading.textContent]);
  });

  const button = synthesis.querySelector('.bingo [data-open-pay]');
  if (button) setText(button, 'Открыть итог →');
}

function decorateLoading() {
  const title = document.querySelector('#loadingTitle');
  const text = document.querySelector('#loadingText');
  if (title && loadingCopy.has(title.textContent)) setText(title, loadingCopy.get(title.textContent));
  if (text && loadingCopy.has(text.textContent)) setText(text, loadingCopy.get(text.textContent));
  document.querySelectorAll('#loadingSteps span').forEach((step) => {
    if (stepCopy.has(step.textContent)) setText(step, stepCopy.get(step.textContent));
  });
}

function decorateMessages() {
  document.querySelectorAll('.message.ai').forEach((message) => {
    if (message.textContent === 'Выберите готовый вопрос или опишите ситуацию. Я свяжу её с конкретными элементами вашей карты и предложу один проверяемый шаг.') {
      setText(message, 'Опишите ситуацию. Я покажу, на какой ресурс опереться и какой шаг сделать.');
    }
    if (message.textContent === 'Собираю связи карты…') setText(message, 'Сверяю вопрос с картой…');
  });
}

function decorateSystemCopy() {
  const toast = document.querySelector('#toast');
  if (toast && toastCopy.has(toast.textContent)) setText(toast, toastCopy.get(toast.textContent));

  const accuracy = document.querySelector('#accuracyNote');
  if (accuracy?.textContent) {
    const refined = accuracy.textContent
      .replace('Текст: персональный AI-синтез', 'Интерпретация: персональный разбор')
      .replace('Текст: локальная интерпретация', 'Интерпретация: HeroStar');
    setText(accuracy, refined);
  }
}

function decorateInterface() {
  decorateCards();
  decorateSynthesis();
  decorateLoading();
  decorateMessages();
  decorateSystemCopy();
}

function scheduleDecoration() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    decorateInterface();
  });
}

new MutationObserver(scheduleDecoration).observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
});

decorateInterface();