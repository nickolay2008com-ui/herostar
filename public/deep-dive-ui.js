function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function ensureModal() {
  let backdrop = document.querySelector('#deepDiveModal');
  if (backdrop) return backdrop;

  backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop deep-dive-backdrop hidden';
  backdrop.id = 'deepDiveModal';
  backdrop.innerHTML = `
    <section class="deep-dive-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="deepDiveTitle">
      <header class="deep-dive-head">
        <div class="deep-dive-heading">
          <span class="deep-dive-icon" id="deepDiveIcon">✦</span>
          <div>
            <div class="panel-kicker" id="deepDiveKicker">Открыть возможности</div>
            <h2 id="deepDiveTitle">Открыть больше возможностей</h2>
            <p id="deepDivePosition"></p>
          </div>
        </div>
        <button class="modal-close" type="button" data-close-deep aria-label="Закрыть">×</button>
      </header>
      <div class="deep-dive-question" id="deepDiveQuestion"></div>
      <nav class="deep-dive-tabs" aria-label="Разделы подробного разбора">
        <button class="active" type="button" data-deep-tab="meaning">Что открывает</button>
        <button type="button" data-deep-tab="life">Как применить</button>
        <button type="button" data-deep-tab="states">Что помогает и мешает</button>
        <button type="button" data-deep-tab="difference">Не путать</button>
        <button type="button" data-deep-tab="practice">Первый шаг</button>
      </nav>
      <div class="deep-dive-scroll" id="deepDiveContent"></div>
    </section>`;
  document.body.append(backdrop);

  backdrop.querySelector('[data-close-deep]').addEventListener('click', closeDeepDive);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeDeepDive();
  });
  backdrop.querySelector('.deep-dive-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-deep-tab]');
    if (!button) return;
    activateTab(button.dataset.deepTab);
  });
  return backdrop;
}

let activeCard = null;
let activeTab = 'meaning';

function formulaCard(item, className = '') {
  return `<article class="deep-formula-card ${className}"><span>${escapeHtml(item.title)}</span><p>${escapeHtml(item.text)}</p></article>`;
}

function renderMeaning(guide) {
  const primary = ['planet', 'element', 'sign', 'house'].map((key) => formulaCard(guide.formula[key], key)).join('');
  const nuance = ['mode', 'degree', 'motion'].map((key) => formulaCard(guide.formula[key], 'nuance')).join('');
  return `
    <section class="deep-purpose">
      <span>Что это поможет вам открыть</span>
      <p>${escapeHtml(guide.purpose)}</p>
    </section>
    <div class="deep-formula-grid">${primary}</div>
    <div class="deep-nuance-grid">${nuance}</div>`;
}

function renderLife(guide) {
  return `<section class="deep-section-intro"><span>От знания — к дополнительным возможностям</span><p>Здесь показано, что именно можно получить, как применить это в реальной ситуации и что обычно закрывает доступ к преимуществу.</p></section>
    <div class="deep-life-grid">${guide.lifeExamples.map((example, index) => `
    <article class="deep-life-example">
      <span>${String(index + 1).padStart(2, '0')}</span>
      <div><h3>${escapeHtml(example.title)}</h3><p>${escapeHtml(example.text)}</p></div>
    </article>`).join('')}</div>`;
}

function renderStates(guide) {
  return `<div class="deep-state-grid">
    <article class="deep-state resource"><span>Когда возможность открывается</span><p>${escapeHtml(guide.states.resource)}</p></article>
    <article class="deep-state stress"><span>Что сужает возможности</span><p>${escapeHtml(guide.states.stress)}</p></article>
    <article class="deep-state return"><span>Как вернуть доступ</span><p>${escapeHtml(guide.states.return)}</p></article>
  </div>`;
}

function renderDifference(guide) {
  return `
    <section class="deep-section-intro"><span>Одна задача — разные способы её раскрыть</span><p>Стихия показывает общий канал. Ваш канал отмечен, остальные помогают увидеть, почему чужой способ может не давать вам такого же результата.</p></section>
    <div class="element-comparison">${guide.elementComparison.map((item) => `
      <article class="element-option ${item.current ? 'current' : ''}">
        <span>${escapeHtml(item.name)}${item.current ? ' · ваш канал' : ''}</span>
        <p>${escapeHtml(item.text)}</p>
      </article>`).join('')}</div>
    <section class="deep-section-intro second"><span>Не спутать с другой внутренней задачей</span></section>
    <div class="function-difference">${guide.distinguish.map((item) => `
      <article><b>${escapeHtml(item.name)}</b><p>${escapeHtml(item.text)}</p></article>`).join('')}</div>`;
}

function renderPractice(guide) {
  return `
    <section class="deep-practice">
      <div class="deep-practice-mark">→</div>
      <div>
        <span>Примените знание к одной реальной ситуации</span>
        <h3>${escapeHtml(guide.practice.title)}</h3>
      </div>
      <ol>${guide.practice.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
    </section>
    <p class="deep-note">${escapeHtml(guide.note)}</p>`;
}

function activateTab(tab) {
  if (!activeCard?.deepDive) return;
  activeTab = tab;
  const backdrop = ensureModal();
  backdrop.querySelectorAll('[data-deep-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.deepTab === tab);
  });
  const guide = activeCard.deepDive;
  const renderers = {
    meaning: renderMeaning,
    life: renderLife,
    states: renderStates,
    difference: renderDifference,
    practice: renderPractice,
  };
  backdrop.querySelector('#deepDiveContent').innerHTML = (renderers[tab] || renderMeaning)(guide);
  backdrop.querySelector('#deepDiveContent').scrollTop = 0;
}

export function deepDiveButtonMarkup(card) {
  if (!card?.deepDive || card.locked) return '';
  return `<button class="deep-dive-button" type="button" data-open-deep="${escapeHtml(card.id)}">
    <span><b>Открыть возможности</b><small>Что это даёт и как применить в жизни</small></span><i>→</i>
  </button>`;
}

export function openDeepDive(card) {
  if (!card?.deepDive) return;
  activeCard = card;
  activeTab = 'meaning';
  const backdrop = ensureModal();
  backdrop.querySelector('#deepDiveIcon').textContent = card.icon || '✦';
  backdrop.querySelector('#deepDiveKicker').textContent = card.deepDive.journeyRole;
  backdrop.querySelector('#deepDiveTitle').textContent = card.title;
  backdrop.querySelector('#deepDivePosition').textContent = card.position;
  backdrop.querySelector('#deepDiveQuestion').textContent = card.deepDive.headline;
  activateTab('meaning');
  backdrop.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => backdrop.querySelector('[data-close-deep]').focus());
}

export function closeDeepDive() {
  const backdrop = document.querySelector('#deepDiveModal');
  if (!backdrop || backdrop.classList.contains('hidden')) return;
  backdrop.classList.add('hidden');
  document.body.style.overflow = '';
  activeCard = null;
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeDeepDive();
});
