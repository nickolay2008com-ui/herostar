import './place-autocomplete.js';

const progress = document.querySelector('#treasureProgress');
const SVG_NS = 'http://www.w3.org/2000/svg';
const WHEEL_CENTER = 160;
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

function rotatePoint(x, y, angle) {
  const dx = x - WHEEL_CENTER;
  const dy = y - WHEEL_CENTER;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: WHEEL_CENTER + dx * cos - dy * sin,
    y: WHEEL_CENTER + dx * sin + dy * cos,
  };
}

function rotateAttributePair(node, xAttribute, yAttribute, angle) {
  const x = Number(node.getAttribute(xAttribute));
  const y = Number(node.getAttribute(yAttribute));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const rotated = rotatePoint(x, y, angle);
  node.setAttribute(xAttribute, rotated.x.toFixed(3));
  node.setAttribute(yAttribute, rotated.y.toFixed(3));
}

function addOppositeAngle(svg, sourceLabel, label) {
  if (!sourceLabel || [...svg.querySelectorAll('.angle-label')].some((node) => node.textContent.trim() === label)) return;
  const sourceX = Number(sourceLabel.getAttribute('x'));
  const sourceY = Number(sourceLabel.getAttribute('y'));
  if (!Number.isFinite(sourceX) || !Number.isFinite(sourceY)) return;

  const x = WHEEL_CENTER * 2 - sourceX;
  const y = WHEEL_CENTER * 2 - sourceY;
  const stroke = sourceLabel.getAttribute('fill') || 'currentColor';
  const group = document.createElementNS(SVG_NS, 'g');
  group.classList.add('opposite-angle');

  const axis = document.createElementNS(SVG_NS, 'line');
  axis.classList.add('angle-axis');
  axis.setAttribute('x1', String(WHEEL_CENTER));
  axis.setAttribute('y1', String(WHEEL_CENTER));
  axis.setAttribute('x2', x.toFixed(3));
  axis.setAttribute('y2', y.toFixed(3));
  axis.setAttribute('stroke', stroke);

  const text = document.createElementNS(SVG_NS, 'text');
  text.classList.add('angle-label');
  text.setAttribute('x', x.toFixed(3));
  text.setAttribute('y', y.toFixed(3));
  text.setAttribute('fill', stroke);
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'middle');
  text.textContent = label;

  group.append(axis, text);
  const firstPlanet = svg.querySelector('[data-card-id]');
  svg.insertBefore(group, firstPlanet || null);
}

function orientWheel() {
  const svg = document.querySelector('#wheelWrap svg.wheel:not([data-asc-left])');
  if (!svg) return;

  const labels = [...svg.querySelectorAll('.angle-label')];
  const ascLabel = labels.find((node) => node.textContent.trim() === 'ASC');
  if (!ascLabel) return;

  const ascX = Number(ascLabel.getAttribute('x'));
  const ascY = Number(ascLabel.getAttribute('y'));
  if (!Number.isFinite(ascX) || !Number.isFinite(ascY)) return;

  svg.dataset.ascLeft = 'true';
  const currentAngle = Math.atan2(ascY - WHEEL_CENTER, ascX - WHEEL_CENTER);
  const rotation = Math.PI - currentAngle;

  svg.querySelectorAll('line').forEach((line) => {
    rotateAttributePair(line, 'x1', 'y1', rotation);
    rotateAttributePair(line, 'x2', 'y2', rotation);
  });
  svg.querySelectorAll('circle').forEach((circle) => rotateAttributePair(circle, 'cx', 'cy', rotation));
  svg.querySelectorAll('text').forEach((text) => rotateAttributePair(text, 'x', 'y', rotation));

  const orientedLabels = [...svg.querySelectorAll('.angle-label')];
  addOppositeAngle(svg, orientedLabels.find((node) => node.textContent.trim() === 'ASC'), 'DSC');
  addOppositeAngle(svg, orientedLabels.find((node) => node.textContent.trim() === 'MC'), 'IC');
  svg.setAttribute('aria-label', `${svg.getAttribute('aria-label') || 'Натальная карта'}. Асцендент расположен слева, десцендент справа.`);
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
  orientWheel();
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