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

let activeCard = null;
let activeTab = 'meaning';
let lastFocusedElement = null;
let previousBodyOverflow = '';

function ensureModal() {
  let backdrop = document.querySelector('#deepDiveModal');
  if (backdrop) return backdrop;

  backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop deep-dive-backdrop hidden';
  backdrop.id = 'deepDiveModal';
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.innerHTML = `
    <section class="deep-dive-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="deepDiveTitle" aria-describedby="deepDiveQuestion">
      <header class="deep-dive-head">
        <div class="deep-dive-heading">
          <span class="deep-dive-icon" id="deepDiveIcon" aria-hidden="true">✦</span>
          <div>
            <div class="panel-kicker" id="deepDiveKicker">Разобраться в себе</div>
            <h2 id="deepDiveTitle">Полный разбор</h2>
            <p id="deepDivePosition"></p>
          </div>
        </div>
        <button class="modal-close" type="button" data-close-deep aria-label="Закрыть полный разбор">×</button>
      </header>
      <div class="deep-dive-question" id="deepDiveQuestion"></div>
      <nav class="deep-dive-tabs" role="tablist" aria-label="Разделы подробного разбора">
        ${TAB_FLOW.map((tab, index) => `<button class="${index === 0 ? 'active' : ''}" type="button" role="tab" id="deepDiveTab-${tab.id}" aria-controls="deepDiveContent" aria-selected="${index === 0 ? 'true' : 'false'}" tabindex="${index === 0 ? '0' : '-1'}" data-deep-tab="${tab.id}">${tab.label}</button>`).join('')}
      </nav>
      <div class="deep-dive-progress" aria-live="polite">
        <span id="deepDiveProgressLabel">Раздел 1 из 5 · Суть</span>
        <div class="deep-dive-progress-track" aria-hidden="true"><i id="deepDiveProgressBar"></i></div>
      </div>
      <div class="deep-dive-scroll" id="deepDiveContent" role="tabpanel" aria-labelledby="deepDiveTab-meaning" tabindex="0"></div>
    </section>`;
  document.body.append(backdrop);

  backdrop.querySelector('[data-close-deep]').addEventListener('click', closeDeepDive);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeDeepDive();
  });

  const tabs = backdrop.querySelector('.deep-dive-tabs');
  tabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-deep-tab]');
    if (!button) return;
    activateTab(button.dataset.deepTab);
  });
  tabs.addEventListener('keydown', (event) => {
    const currentIndex = TAB_FLOW.findIndex((item) => item.id === activeTab);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % TAB_FLOW.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + TAB_FLOW.length) % TAB_FLOW.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = TAB_FLOW.length - 1;
    else return;

    event.preventDefault();
    activateTab(TAB_FLOW[nextIndex].id);
    backdrop.querySelector(`[data-deep-tab="${TAB_FLOW[nextIndex].id}"]`)?.focus();
  });

  backdrop.querySelector('#deepDiveContent').addEventListener('click', (event) => {
    const next = event.target.closest('[data-deep-next]');
    const previous = event.target.closest('[data-deep-previous]');
    const done = event.target.closest('[data-deep-done]');
    if (next) {
      activateTab(next.dataset.deepNext);
      requestAnimationFrame(() => backdrop.querySelector('#deepDiveContent')?.focus({ preventScroll: true }));
    }
    if (previous) {
      activateTab(previous.dataset.deepPrevious);
      requestAnimationFrame(() => backdrop.querySelector('#deepDiveContent')?.focus({ preventScroll: true }));
    }
    if (done) closeDeepDive();
  });
  return backdrop;
}

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
    <div class="deep-formula-grid primary">
      ${formulaCard(guide.formula.planet, 'planet', 'Что это за внутренняя задача')}
      ${formulaCard(guide.formula.sign, 'sign', 'Как она работает именно у вас')}
      ${formulaCard(guide.formula.house, 'house', 'Где это особенно заметно')}
    </div>
    <details class="deep-technical">
      <summary>Астрологические детали для более глубокого изучения</summary>
      <div class="deep-technical-inner">
        <div class="deep-formula-grid technical-grid">${formulaCard(guide.formula.element, 'element', 'Через какой канал включается')}</div>
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
  const activeButton = backdrop.querySelector(`[data-deep-tab="${activeTab}"]`);

  backdrop.querySelectorAll('[data-deep-tab]').forEach((button) => {
    const selected = button.dataset.deepTab === activeTab;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
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
  const content = backdrop.querySelector('#deepDiveContent');
  backdrop.querySelector('#deepDiveProgressLabel').textContent = `Раздел ${index + 1} из ${TAB_FLOW.length} · ${current.label}`;
  backdrop.querySelector('#deepDiveProgressBar').style.width = `${((index + 1) / TAB_FLOW.length) * 100}%`;
  content.setAttribute('aria-labelledby', `deepDiveTab-${activeTab}`);
  content.innerHTML = `<div class="deep-dive-content-inner">${(renderers[activeTab] || renderMeaning)(guide)}${renderStepFooter(activeTab)}</div>`;
  content.scrollTop = 0;

  const tabs = backdrop.querySelector('.deep-dive-tabs');
  if (activeButton && tabs.scrollWidth > tabs.clientWidth) {
    activeButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}

function trapFocus(event, backdrop) {
  if (event.key !== 'Tab') return;
  const focusable = [...backdrop.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), details > summary, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => element.offsetParent !== null);
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
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
  lastFocusedElement = document.activeElement;
  previousBodyOverflow = document.body.style.overflow;

  const backdrop = ensureModal();
  backdrop.querySelector('#deepDiveIcon').textContent = card.icon || '✦';
  backdrop.querySelector('#deepDiveKicker').textContent = card.deepDive.journeyRole;
  backdrop.querySelector('#deepDiveTitle').textContent = card.title;
  backdrop.querySelector('#deepDivePosition').textContent = card.position;
  backdrop.querySelector('#deepDiveQuestion').textContent = card.deepDive.headline;
  backdrop.classList.remove('hidden');
  backdrop.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  activateTab('meaning');
  requestAnimationFrame(() => backdrop.querySelector('[data-close-deep]')?.focus());
}

export function closeDeepDive() {
  const backdrop = document.querySelector('#deepDiveModal');
  if (!backdrop || backdrop.classList.contains('hidden')) return;
  backdrop.classList.add('hidden');
  backdrop.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = previousBodyOverflow;
  activeCard = null;
  requestAnimationFrame(() => lastFocusedElement?.focus?.());
}

document.addEventListener('keydown', (event) => {
  const backdrop = document.querySelector('#deepDiveModal');
  if (!backdrop || backdrop.classList.contains('hidden')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeDeepDive();
    return;
  }
  trapFocus(event, backdrop);
});
