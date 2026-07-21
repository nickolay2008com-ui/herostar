const activityNode = document.querySelector('#heroActivity');
const carousel = document.querySelector('[data-value-carousel]');
const purchaseVisual = document.querySelector('[data-purchase-visual]');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const activities = [
  'В карте: эмоциональная опора по Луне',
  'В карте: сильный способ действия по Марсу',
  'В карте: ресурс отношений по Венере',
  'В карте: маршрут роста по Северному узлу',
  'Сначала 3 открытия бесплатно, затем полная карта',
];

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

if (activityNode) {
  let activityIndex = 0;
  const activityRotator = createRotator({
    interval: 3600,
    onStep: () => {
      activityIndex = (activityIndex + 1) % activities.length;
      activityNode.animate(
        [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-4px)' }],
        { duration: 160, easing: 'ease', fill: 'forwards' },
      ).finished.then(() => {
        activityNode.textContent = activities[activityIndex];
        activityNode.animate(
          [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 220, easing: 'ease', fill: 'forwards' },
        );
      }).catch(() => {});
    },
  });
  activityRotator.start();
  document.addEventListener('visibilitychange', activityRotator.start);
}

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
