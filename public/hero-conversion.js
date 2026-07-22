const activityNode = document.querySelector('#heroActivity');
const socialProofKicker = document.querySelector('.social-proof-kicker');
const socialProofMessage = document.querySelector('.social-proof-copy strong');
const carousel = document.querySelector('[data-value-carousel]');
const purchaseVisual = document.querySelector('[data-purchase-visual]');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const numberFormat = new Intl.NumberFormat('ru-RU');

const purchaseStages = [
  { label: 'Сначала', value: 'вы видите качество разбора бесплатно' },
  { label: 'Затем', value: 'одной покупкой открываются все 11 ресурсов' },
  { label: 'В итоге', value: 'карта собирается в личный маршрут действий' },
];

function createRotator({ interval, onStep }) {
  let timer = null;
  let paused = false;

  const stop = () => {
    if (timer) window.clearInterval(timer);
    timer = null;
  };

  const start = () => {
    stop();
    if (reducedMotion || paused || document.hidden) return;
    timer = window.setInterval(onStep, interval);
  };

  return {
    start,
    stop,
    setPaused(value) {
      paused = value;
      if (paused) stop(); else start();
    },
  };
}

function wordForm(value, forms) {
  const number = Math.abs(Number(value)) % 100;
  const last = number % 10;
  if (number > 10 && number < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

function renderSocialProof(stats) {
  const totalCharts = Math.max(0, Number(stats?.totalCharts || 0));
  const charts7d = Math.max(0, Number(stats?.charts7d || 0));
  const charts24h = Math.max(0, Number(stats?.charts24h || 0));

  if (socialProofKicker) {
    socialProofKicker.textContent = totalCharts > 0
      ? `${numberFormat.format(totalCharts)} ${wordForm(totalCharts, ['персональная карта создана', 'персональные карты созданы', 'персональных карт создано'])}`
      : 'Персональный формат без общих гороскопов';
  }

  if (socialProofMessage) {
    socialProofMessage.textContent = 'Каждая карта рассчитывается отдельно по данным рождения и превращается в понятный маршрут: ресурс, блок, ключ и действие.';
  }

  if (!activityNode) return;

  if (charts24h > 0) {
    activityNode.textContent = `${numberFormat.format(charts24h)} ${wordForm(charts24h, ['новая карта', 'новые карты', 'новых карт'])} за последние 24 часа`;
  } else if (charts7d > 0) {
    activityNode.textContent = `${numberFormat.format(charts7d)} ${wordForm(charts7d, ['новая карта', 'новые карты', 'новых карт'])} за последние 7 дней`;
  } else {
    activityNode.textContent = 'Статистика обновляется автоматически по созданным картам';
  }
}

async function loadSocialProof() {
  try {
    const response = await fetch('/api/public/stats', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Public stats unavailable');
    renderSocialProof(await response.json());
  } catch {
    renderSocialProof(null);
  }
}

renderSocialProof(null);
loadSocialProof();

if (carousel) {
  const slides = [...carousel.querySelectorAll('[data-value-slide]')];
  const dots = [...carousel.querySelectorAll('.value-carousel-dots i')];
  const previousButton = carousel.querySelector('[data-value-prev]');
  const nextButton = carousel.querySelector('[data-value-next]');
  let index = 0;

  const show = (nextIndex) => {
    index = (nextIndex + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => slide.classList.toggle('active', slideIndex === index));
    dots.forEach((dot, dotIndex) => dot.classList.toggle('active', dotIndex === index));
  };

  const rotator = createRotator({ interval: 5200, onStep: () => show(index + 1) });
  previousButton?.addEventListener('click', () => { show(index - 1); rotator.start(); });
  nextButton?.addEventListener('click', () => { show(index + 1); rotator.start(); });
  carousel.addEventListener('mouseenter', () => rotator.setPaused(true));
  carousel.addEventListener('mouseleave', () => rotator.setPaused(false));
  carousel.addEventListener('focusin', () => rotator.setPaused(true));
  carousel.addEventListener('focusout', () => rotator.setPaused(false));
  document.addEventListener('visibilitychange', rotator.start);
  show(0);
  rotator.start();
}

if (purchaseVisual) {
  const cards = [...purchaseVisual.querySelectorAll('[data-purchase-card]')];
  const points = [...purchaseVisual.querySelectorAll('.purchase-flow i')];
  const labelNode = purchaseVisual.querySelector('#purchaseStageLabel');
  const valueNode = purchaseVisual.querySelector('#purchaseStageValue');
  let stage = 0;

  const showStage = (nextStage) => {
    stage = nextStage % purchaseStages.length;
    purchaseVisual.dataset.stage = String(stage);
    cards.forEach((card, cardIndex) => card.classList.toggle('active', cardIndex === stage));
    points.forEach((point, pointIndex) => point.classList.toggle('active', pointIndex <= stage));
    if (labelNode) labelNode.textContent = purchaseStages[stage].label;
    if (valueNode) valueNode.textContent = purchaseStages[stage].value;
  };

  const rotator = createRotator({ interval: 2800, onStep: () => showStage(stage + 1) });
  purchaseVisual.addEventListener('mouseenter', () => rotator.setPaused(true));
  purchaseVisual.addEventListener('mouseleave', () => rotator.setPaused(false));
  document.addEventListener('visibilitychange', rotator.start);
  showStage(0);
  rotator.start();
}
