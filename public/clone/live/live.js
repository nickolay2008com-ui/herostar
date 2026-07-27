(() => {
  const PENDING_KEY = 'starClonePendingQuestion';
  const AUTO_KEY = 'starClonePendingAutoSubmit';
  const RETURN_KEY = 'starCloneReturnPath';
  const body = document.body;
  const heroForm = document.querySelector('#heroQuestionForm');
  const heroQuestion = document.querySelector('#heroQuestion');
  const question = document.querySelector('#question');
  const questionForm = document.querySelector('#questionForm');
  const dialogView = document.querySelector('#dialogView');
  const workspace = document.querySelector('#workspace');
  const messages = document.querySelector('#messages');
  const sticky = document.querySelector('#liveStickyStart');
  const primaryHeroButton = document.querySelector('.live-hero [data-go-intent]');
  const creationButton = document.querySelector('[data-go-create]');
  const hero = document.querySelector('.live-hero');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  localStorage.setItem(RETURN_KEY, '/clone/live/');

  function rememberQuestion(value, autoSubmit = false) {
    const text = String(value || '').trim();
    if (!text) return false;
    localStorage.setItem(PENDING_KEY, text);
    if (autoSubmit) sessionStorage.setItem(AUTO_KEY, '1');
    return true;
  }

  function openCreation() {
    creationButton?.click();
  }

  function installQuestionMeta() {
    if (!heroForm || !heroQuestion) return null;
    heroQuestion.setAttribute('aria-describedby', 'heroQuestionHint heroQuestionCount');
    const submit = heroForm.querySelector('button[type="submit"]');
    if (submit) submit.innerHTML = 'Узнать, как поступил бы Клон <span aria-hidden="true">→</span>';
    return {
      hint: document.querySelector('#heroQuestionHint'),
      count: document.querySelector('#heroQuestionCount'),
    };
  }

  const questionMeta = installQuestionMeta();

  function resizeHeroQuestion() {
    if (!heroQuestion) return;
    heroQuestion.style.height = 'auto';
    heroQuestion.style.height = `${Math.min(Math.max(heroQuestion.scrollHeight, 84), 180)}px`;
  }

  function syncQuestionState() {
    if (!heroQuestion) return;
    const length = heroQuestion.value.length;
    heroForm?.classList.toggle('has-value', length > 0);
    if (questionMeta?.count) questionMeta.count.textContent = `${length} / ${heroQuestion.maxLength || 1600}`;
    if (questionMeta?.hint?.classList.contains('is-saved')) {
      questionMeta.hint.classList.remove('is-saved');
      questionMeta.hint.textContent = 'Можно описать коротко — Клон ответит по имеющимся данным';
    }
    resizeHeroQuestion();
  }

  heroQuestion?.addEventListener('input', syncQuestionState);
  heroQuestion?.addEventListener('keydown', (event) => {
    if (event.isComposing || event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    heroForm?.requestSubmit();
  });

  heroForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!rememberQuestion(heroQuestion?.value, true)) return;

    const submit = heroForm.querySelector('button[type="submit"]');
    if (submit) {
      submit.disabled = true;
      submit.classList.add('is-busy');
      submit.firstChild.textContent = 'Передаём ситуацию ';
    }
    if (questionMeta?.hint) {
      questionMeta.hint.textContent = 'Вопрос сохранён — вернём его после создания клона';
      questionMeta.hint.classList.add('is-saved');
    }

    try { window.ym?.(110937602, 'reachGoal', 'clone_intent_captured'); } catch {}
    window.setTimeout(openCreation, prefersReducedMotion ? 0 : 220);
  });

  document.querySelectorAll('.live-question-examples button').forEach((button) => {
    button.addEventListener('click', () => {
      if (!heroQuestion) return;
      heroQuestion.value = button.textContent.trim();
      heroQuestion.dispatchEvent(new Event('input', { bubbles: true }));
      heroQuestion.focus({ preventScroll: true });
      heroQuestion.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' });
    });
  });

  document.querySelectorAll('[data-go-intent]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!heroQuestion) return;
      heroQuestion.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' });
      window.setTimeout(() => heroQuestion.focus({ preventScroll: true }), prefersReducedMotion ? 0 : 420);
    });
  });

  function deliverPendingQuestion() {
    if (!dialogView || dialogView.classList.contains('hidden') || !question || !questionForm) return;
    const pending = String(localStorage.getItem(PENDING_KEY) || '').trim();
    if (!pending) return;
    if (!question.value.trim()) question.value = pending;
    question.dispatchEvent(new Event('input', { bubbles: true }));
    if (sessionStorage.getItem(AUTO_KEY) === '1' && !question.disabled) {
      sessionStorage.removeItem(AUTO_KEY);
      window.setTimeout(() => {
        if (!question.disabled && question.value.trim() === pending) questionForm.requestSubmit();
      }, prefersReducedMotion ? 0 : 520);
    }
  }

  function installFirstAnswerStyles() {
    if (document.querySelector('#cloneFirstAnswerStyles')) return;
    const style = document.createElement('style');
    style.id = 'cloneFirstAnswerStyles';
    style.textContent = `
      .message.clone.clone-first-answer{position:relative;margin-top:22px;border:1px solid rgba(167,139,250,.34);background:linear-gradient(145deg,rgba(91,61,170,.18),rgba(17,20,34,.96));box-shadow:0 18px 52px rgba(0,0,0,.22)}
      .clone-first-answer-label{display:flex;align-items:center;gap:8px;margin:0 0 10px;color:#d8c9ff;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
      .clone-first-answer-label span{color:#f2cf78}
    `;
    document.head.append(style);
  }

  function enhanceFirstAnswer() {
    if (!messages || messages.querySelector('.clone-first-answer')) return;
    const items = [...messages.querySelectorAll('.message')];
    const firstUserIndex = items.findIndex((item) => item.classList.contains('user'));
    if (firstUserIndex < 0) return;
    const answer = items.slice(firstUserIndex + 1).find((item) => {
      if (!item.classList.contains('clone')) return false;
      const text = String(item.textContent || '');
      return text.trim() && !/готовит ответ|сопоставляю|думаю над/i.test(text);
    });
    if (!answer) return;

    installFirstAnswerStyles();
    answer.classList.add('clone-first-answer');
    const content = answer.querySelector('div') || answer;
    const title = document.createElement('div');
    title.className = 'clone-first-answer-label';
    title.innerHTML = '<span>✦</span> Первый ответ вашего Клона';
    content.prepend(title);

    try { window.ym?.(110937602, 'reachGoal', 'clone_first_answer_shown'); } catch {}
  }

  if (messages) {
    new MutationObserver(enhanceFirstAnswer).observe(messages, { childList: true, subtree: true, characterData: true });
  }

  if (dialogView) {
    new MutationObserver(deliverPendingQuestion).observe(dialogView, { attributes: true, attributeFilter: ['class'] });
  }

  if (workspace) {
    new MutationObserver(() => {
      if (!workspace.classList.contains('hidden')) sticky?.classList.remove('visible');
    }).observe(workspace, { attributes: true, attributeFilter: ['class'] });
  }

  let primaryActionVisible = true;
  let intentFormVisible = false;

  function syncSticky() {
    if (!sticky) return;
    const scrolledEnough = window.scrollY > window.innerHeight * .6;
    const introVisible = !document.querySelector('#intro')?.classList.contains('hidden');
    const show = scrolledEnough && !primaryActionVisible && !intentFormVisible && introVisible;
    sticky.classList.toggle('visible', show);
    sticky.setAttribute('aria-hidden', show ? 'false' : 'true');
  }

  if (sticky && primaryHeroButton && heroForm && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.target === primaryHeroButton) primaryActionVisible = entry.isIntersecting;
        if (entry.target === heroForm) intentFormVisible = entry.isIntersecting;
      });
      syncSticky();
    }, { threshold: .15 });
    observer.observe(primaryHeroButton);
    observer.observe(heroForm);
  }

  function installRevealMotion() {
    const items = document.querySelectorAll('.live-flow, .live-intent, .live-alternate, .live-steps article');
    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      items.forEach((item) => item.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        currentObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -9% 0px', threshold: .12 });
    items.forEach((item) => {
      item.classList.add('live-reveal');
      observer.observe(item);
    });
  }

  let scrollTicking = false;
  function syncScrollUi() {
    scrollTicking = false;
    const top = window.scrollY || document.documentElement.scrollTop || 0;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    body.classList.toggle('is-scrolled', top > 18);
    body.style.setProperty('--scroll-progress', String(Math.min(1, Math.max(0, top / max))));
    syncSticky();
  }

  window.addEventListener('scroll', () => {
    if (scrollTicking) return;
    scrollTicking = true;
    window.requestAnimationFrame(syncScrollUi);
  }, { passive: true });

  if (hero && finePointer && !prefersReducedMotion) {
    let pointerTicking = false;
    let lastEvent = null;
    hero.addEventListener('pointermove', (event) => {
      lastEvent = event;
      if (pointerTicking) return;
      pointerTicking = true;
      window.requestAnimationFrame(() => {
        pointerTicking = false;
        if (!lastEvent) return;
        const rect = hero.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (lastEvent.clientX - rect.left) / rect.width));
        const y = Math.min(1, Math.max(0, (lastEvent.clientY - rect.top) / rect.height));
        hero.style.setProperty('--pointer-x', `${x * 100}%`);
        hero.style.setProperty('--pointer-y', `${y * 100}%`);
        hero.style.setProperty('--image-x', `${(x - .5) * -7}px`);
        hero.style.setProperty('--image-y', `${(y - .5) * -5}px`);
      });
    });
    hero.addEventListener('pointerleave', () => {
      hero.style.setProperty('--pointer-x', '72%');
      hero.style.setProperty('--pointer-y', '34%');
      hero.style.setProperty('--image-x', '0px');
      hero.style.setProperty('--image-y', '0px');
    });
  }

  installRevealMotion();
  syncQuestionState();
  syncScrollUi();
  deliverPendingQuestion();
  enhanceFirstAnswer();
})();
