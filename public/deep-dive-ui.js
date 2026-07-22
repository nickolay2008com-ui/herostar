function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const TAB_FLOW = [
  { id: 'meaning', label: 'Суть' },
  { id: 'life', label: 'Как проявляется' },
  { id: 'states', label: 'Сила и риск' },
  { id: 'difference', label: 'Не перепутать' },
  { id: 'practice', label: 'Попробовать' },
];

function ensureComponentStyles() {
  if (document.querySelector('#deepDiveClarityStyles')) return;
  const style = document.createElement('style');
  style.id = 'deepDiveClarityStyles';
  style.textContent = `
    .deep-dive-progress{display:grid;grid-template-columns:auto minmax(120px,1fr);gap:14px;align-items:center;padding:10px 20px 14px;border-bottom:1px solid rgba(255,255,255,.06)}
    .deep-dive-progress span{font-size:12px;font-weight:700;color:rgba(238,233,248,.66);white-space:nowrap}
    .deep-dive-progress-track{height:4px;border-radius:999px;background:rgba(255,255,255,.07);overflow:hidden}
    .deep-dive-progress-track i{display:block;height:100%;width:20%;border-radius:inherit;background:linear-gradient(90deg,#f5d38c,#d8b8ff);transition:width .24s ease}
    .deep-purpose.beginner{border-color:rgba(245,211,140,.22);background:linear-gradient(135deg,rgba(245,211,140,.08),rgba(216,184,255,.05))}
    .deep-purpose.beginner>span,.deep-section-intro>span{letter-spacing:.045em}
    .deep-reading-key{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:16px 0}
    .deep-reading-key article{padding:14px 15px;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(255,255,255,.025)}
    .deep-reading-key b{display:block;margin-bottom:6px;font-size:12px;color:#f3d79f}
    .deep-reading-key p{margin:0;font-size:13px;line-height:1.55;color:rgba(238,233,248,.68)}
    .deep-technical{margin-top:16px;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(255,255,255,.02);overflow:hidden}
    .deep-technical summary{cursor:pointer;padding:15px 17px;font-size:13px;font-weight:700;color:rgba(238,233,248,.74);list-style:none}
    .deep-technical summary::-webkit-details-marker{display:none}
    .deep-technical summary::after{content:'+';float:right;color:#f3d79f}
    .deep-technical[open] summary::after{content:'−'}
    .deep-technical-inner{padding:0 15px 15px}
    .deep-step-footer{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,.07)}
    .deep-step-footer button{min-height:42px;border-radius:14px;padding:0 16px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.035);color:#eee9f8;font:inherit;font-weight:700;cursor:pointer}
    .deep-step-footer button.primary{margin-left:auto;border-color:rgba(245,211,140,.32);background:linear-gradient(135deg,#f4d28b,#d9baff);color:#17121c}
    .deep-step-footer button:focus-visible,.deep-dive-tabs button:focus-visible{outline:2px solid #f4d28b;outline-offset:2px}
    .deep-section-intro.compact{margin-bottom:14px}
    .deep-section-intro.compact p{max-width:760px}
    .deep-life-example>span{font-variant-numeric:tabular-nums}
    .deep-difference-simple{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .deep-difference-simple article{padding:15px;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(255,255,255,.025)}
    .deep-difference-simple b{display:block;margin-bottom:7px;color:#f3d79f}
    .deep-difference-simple p{margin:0;color:rgba(238,233,248,.72);line-height:1.55}
    @media (max-width:760px){
      .deep-reading-key,.deep-difference-simple{grid-template-columns:1fr}
      .deep-dive-progress{grid-template-columns:1fr;gap:8px}
      .deep-step-footer{align-items:stretch;flex-direction:column-reverse}
      .deep-step-footer button,.deep-step-footer button.primary{width:100%;margin-left:0}
    }
  `;
  document.head.append(style);
}

function ensureModal() {
  let backdrop = document.querySelector('#deepDiveModal');
  if (backdrop) return backdrop;

  ensureComponentStyles();
  backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop deep-dive-backdrop hidden';
  backdrop.id = 'deepDiveModal';
  backdrop.innerHTML = `
    <section class="deep-dive-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="deepDiveTitle">
      <header class="deep-dive-head">
        <div class="deep-dive-heading">
          <span class="deep-dive-icon" id="deepDiveIcon">✦</span>
          <div>
            <div class="panel-kicker" id="deepDiveKicker">Разобраться в себе</div>
            <h2 id="deepDiveTitle">Полный разбор</h2>
            <p id="deepDivePosition"></p>
          </div>
        </div>
        <button class="modal-close" type="button" data-close-deep aria-label="Закрыть">×</button>
      </header>
      <div class="deep-dive-question" id="deepDiveQuestion"></div>
      <nav class="deep-dive-tabs" aria-label="Разделы подробного разбора">
        ${TAB_FLOW.map((tab, index) => `<button class="${index === 0 ? 'active' : ''}" type="button" data-deep-tab="${tab.id}">${tab.label}</button>`).join('')}
      </nav>
      <div class="deep-dive-progress" aria-live="polite">
        <span id="deepDiveProgressLabel">Раздел 1 из 5 · Суть</span>
        <div class="deep-dive-progress-track" aria-hidden="true"><i id="deepDiveProgressBar"></i></div>
      </div>
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
  backdrop.querySelector('#deepDiveContent').addEventListener('click', (event) => {
    const next = event.target.closest('[data-deep-next]');
    const previous = event.target.closest('[data-deep-previous]');
    const done = event.target.closest('[data-deep-done]');
    if (next) activateTab(next.dataset.deepNext);
    if (previous) activateTab(previous.dataset.deepPrevious);
    if (done) closeDeepDive();
  });
  return backdrop;
}

let activeCard = null;
let activeTab = 'meaning';

function formulaCard(item, className = '', title = '') {
  return `<article class="deep-formula-card ${className}"><span>${escapeHtml(title || item.title)}</span><p>${escapeHtml(item.text)}</p></article>`;
}

function renderMeaning(guide) {
  return `
    <section class="deep-purpose beginner">
      <span>Суть простыми словами</span>
      <p>${escapeHtml(guide.purpose)}</p>
    </section>
    <section class="deep-section-intro compact">
      <span>Как читать именно этот разбор</span>
      <p>Сначала смотрим, за какую внутреннюю задачу отвечает планета. Затем — каким способом она работает у вас и в какой сфере жизни заметна сильнее.</p>
    </section>
    <div class="deep-reading-key">
      <article><b>Планета</b><p>Что внутри вас выполняет эту задачу.</p></article>
      <article><b>Знак</b><p>Как именно вы естественно решаете её.</p></article>
      <article><b>Дом</b><p>Где эта механика чаще встречается в жизни.</p></article>
    </div>
    <div class="deep-formula-grid">
      ${formulaCard(guide.formula.planet, 'planet', 'Что это за внутренняя задача')}
      ${formulaCard(guide.formula.sign, 'sign', 'Как она работает именно у вас')}
      ${formulaCard(guide.formula.house, 'house', 'Где это особенно заметно')}
    </div>
    <details class="deep-technical">
      <summary>Астрологические детали для более глубокого изучения</summary>
      <div class="deep-technical-inner">
        <div class="deep-formula-grid">${formulaCard(guide.formula.element, 'element', 'Через какой канал включается')}</div>
        <div class="deep-nuance-grid">
          ${formulaCard(guide.formula.mode, 'nuance')}
          ${formulaCard(guide.formula.degree, 'nuance')}
          ${formulaCard(guide.formula.motion, 'nuance')}
        </div>
      </div>
    </details>`;
}

function renderLife(guide) {
  const simpleTitles = ['В чём ваша возможность', 'Где и как это применять', 'Что обычно мешает'];
  return `
    <section class="deep-section-intro">
      <span>Узнайте это в реальной жизни</span>
      <p>Не нужно запоминать теорию. Смотрите, в каких ситуациях описание действительно помогает вам лучше понимать себя и выбирать действие.</p>
    </section>
    <div class="deep-life-grid">${guide.lifeExamples.map((example, index) => `
      <article class="deep-life-example">
        <span>${String(index + 1).padStart(2, '0')}</span>
        <div><h3>${escapeHtml(simpleTitles[index] || example.title)}</h3><p>${escapeHtml(example.text)}</p></div>
      </article>`).join('')}</div>`;
}

function renderStates(guide) {
  return `
    <section class="deep-section-intro compact">
      <span>Одна и та же сила работает по-разному</span>
      <p>Здесь нет «хорошего» и «плохого» характера. Важно заметить состояние, в котором ваша особенность помогает, и момент, когда она начинает управлять вами автоматически.</p>
    </section>
    <div class="deep-state-grid">
      <article class="deep-state resource"><span>Когда вы в ресурсе</span><p>${escapeHtml(guide.states.resource)}</p></article>
      <article class="deep-state stress"><span>Когда вы перегружены</span><p>${escapeHtml(guide.states.stress)}</p></article>
      <article class="deep-state return"><span>Как вернуть рабочее состояние</span><p>${escapeHtml(guide.states.return)}</p></article>
    </div>`;
}

function renderDifference(guide) {
  return `
    <section class="deep-section-intro compact">
      <span>Не приписывайте этой части карты чужую работу</span>
      <p>В натальной карте несколько механизмов могут проявляться одновременно. Эти сравнения помогают понять, за что отвечает именно текущий раздел.</p>
    </section>
    <div class="deep-difference-simple">${guide.distinguish.map((item) => `
      <article><b>Не ${escapeHtml(item.name)}</b><p>${escapeHtml(item.text)}</p></article>`).join('')}</div>
    <details class="deep-technical">
      <summary>Сравнить с другими стихиями</summary>
      <div class="deep-technical-inner">
        <section class="deep-section-intro second"><span>Одна задача — разные способы её решать</span><p>Ваш способ отмечен. Остальные нужны не для оценки, а чтобы увидеть, почему чужой подход может ощущаться неестественно.</p></section>
        <div class="element-comparison">${guide.elementComparison.map((item) => `
          <article class="element-option ${item.current ? 'current' : ''}">
            <span>${escapeHtml(item.name)}${item.current ? ' · ваш способ' : ''}</span>
            <p>${escapeHtml(item.text)}</p>
          </article>`).join('')}</div>
      </div>
    </details>`;
}

function renderPractice(guide) {
  return `
    <section class="deep-section-intro compact">
      <span>Маленький эксперимент вместо веры на слово</span>
      <p>Проверьте описание на одной ситуации. Хороший разбор должен дать наблюдаемый результат, а не просто показаться красивым.</p>
    </section>
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

function renderStepFooter(tab) {
  const index = TAB_FLOW.findIndex((item) => item.id === tab);
  const previous = TAB_FLOW[index - 1];
  const next = TAB_FLOW[index + 1];
  return `<div class="deep-step-footer">
    ${previous ? `<button type="button" data-deep-previous="${previous.id}">← ${escapeHtml(previous.label)}</button>` : '<span></span>'}
    ${next
      ? `<button class="primary" type="button" data-deep-next="${next.id}">Дальше: ${escapeHtml(next.label)} →</button>`
      : '<button class="primary" type="button" data-deep-done>Готово · вернуться к карте</button>'}
  </div>`;
}

function activateTab(tab) {
  if (!activeCard?.deepDive) return;
  activeTab = TAB_FLOW.some((item) => item.id === tab) ? tab : 'meaning';
  const backdrop = ensureModal();
  backdrop.querySelectorAll('[data-deep-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.deepTab === activeTab);
  });
  const guide = activeCard.deepDive;
  const renderers = {
    meaning: renderMeaning,
    life: renderLife,
    states: renderStates,
    difference: renderDifference,
    practice: renderPractice,
  };
  const index = TAB_FLOW.findIndex((item) => item.id === activeTab);
  const current = TAB_FLOW[index];
  backdrop.querySelector('#deepDiveProgressLabel').textContent = `Раздел ${index + 1} из ${TAB_FLOW.length} · ${current.label}`;
  backdrop.querySelector('#deepDiveProgressBar').style.width = `${((index + 1) / TAB_FLOW.length) * 100}%`;
  backdrop.querySelector('#deepDiveContent').innerHTML = `${(renderers[activeTab] || renderMeaning)(guide)}${renderStepFooter(activeTab)}`;
  backdrop.querySelector('#deepDiveContent').scrollTop = 0;
}

export function deepDiveButtonMarkup(card) {
  if (!card?.deepDive || card.locked) return '';
  return `<button class="deep-dive-button" type="button" data-open-deep="${escapeHtml(card.id)}">
    <span><b>Разобраться глубже</b><small>Суть, проявления, риски и один практический эксперимент</small></span><i>→</i>
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
