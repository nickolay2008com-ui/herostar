const progress = document.querySelector('#treasureProgress');
let lastTotal = 0;
let lastUnlocked = 0;
let scheduled = false;

const loadingCopy = new Map([
  ['Определяем небесную схему', 'Наносим координаты на карту'],
  ['Планеты считаются отдельно. ИИ не получает права сочинять космос, к счастью.', 'Сначала отмечаем точные положения — без догадок и случайных обещаний.'],
  ['Строим оси и дома', 'Отмечаем жизненные тайники'],
  ['Место и исторический часовой пояс превращаются в конкретную геометрию карты.', 'Каждая сфера жизни получает своё место на вашей карте сокровищ.'],
  ['Ищем контрасты', 'Проверяем, что запирает ресурсы'],
  ['Каждое качество сравнивается с противоположным типом, чтобы убрать универсальную кашу.', 'Сравниваем противоположные проявления, чтобы отличить ваш ресурс от приятного общего текста.'],
  ['Соединяем внутренние механизмы', 'Собираем найденное в один клад'],
  ['Планеты перестают быть списком и начинают объяснять, как части личности работают вместе.', 'Отдельные находки соединяются в цельную картину вашей личности.'],
  ['Собираем маршрут', 'Прокладываем маршрут применения'],
  ['Ловушки переводятся в конкретные ключи и обратимые действия.', 'Для каждого замка находим ключ и первый проверяемый ход.'],
]);

const stepCopy = new Map([
  ['Точные положения', 'Координаты'],
  ['Сферы проявления', 'Тайники'],
  ['Анти-Барнум', 'Проверка точности'],
  ['Синтез', 'Сокровищница'],
  ['Практический путь', 'Маршрут'],
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
        'Уникальный пример': 'Что хранится внутри',
        'Как бывает иначе': 'Как устроено иначе',
        'Главная ловушка': 'Замок: что прячет ресурс',
        'Личный ключ': 'Ключ от тайника',
      };
      if (replacements[label.textContent]) setText(label, replacements[label.textContent]);
    });

    const actionLabel = card.querySelector('.action-box b');
    if (actionLabel) setText(actionLabel, 'Первый ход');

    const unlockTitle = card.querySelector('.unlock-box b');
    const unlockText = card.querySelector('.unlock-box p');
    const unlockButton = card.querySelector('.unlock-box button');
    if (unlockTitle) setText(unlockTitle, 'Тайник закрыт');
    if (unlockText) setText(unlockText, 'Внутри — ваш ресурс, замок, ключ и первый практический ход.');
    if (unlockButton) setText(unlockButton, 'Открыть весь клад');
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
    const markup = `<div class="treasure-progress-copy"><span>Ваш путь по карте</span><strong>${lastUnlocked} из ${lastTotal} сокровищ открыто</strong></div><div class="treasure-progress-track" aria-hidden="true"><i style="width:${percentage}%"></i></div><small>Каждая находка: ресурс → замок → ключ → действие в реальной жизни</small>`;
    if (progress.innerHTML !== markup) progress.innerHTML = markup;
  }
}

function decorateSynthesis() {
  const synthesis = document.querySelector('#synthesis');
  if (!synthesis?.children.length) return;

  const kicker = synthesis.querySelector('.panel-kicker');
  if (kicker) setText(kicker, 'Весь найденный клад');

  synthesis.querySelectorAll('.synthesis-block h4').forEach((heading) => {
    const replacements = {
      'Сильные опоры': 'Главные сокровища',
      'Внутренние узлы': 'Замки и скрытые проходы',
      'Маршрут': 'Маршрут применения',
    };
    if (replacements[heading.textContent]) setText(heading, replacements[heading.textContent]);
  });

  const button = synthesis.querySelector('.bingo [data-open-pay]');
  if (button) setText(button, 'Открыть весь клад →');
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
      setText(message, 'Выберите вопрос или опишите ситуацию. Я покажу, какое найденное сокровище здесь поможет, что его запирает и какой первый ход можно проверить.');
    }
    if (message.textContent === 'Собираю связи карты…') setText(message, 'Ищу нужный тайник и подходящий ключ…');
  });
}

function decorateInterface() {
  decorateCards();
  decorateSynthesis();
  decorateLoading();
  decorateMessages();
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
