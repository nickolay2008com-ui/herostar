(() => {
  const PENDING_KEY = 'starClonePendingQuestion';
  const AUTO_KEY = 'starClonePendingAutoSubmit';
  const RETURN_KEY = 'starCloneReturnPath';
  const heroForm = document.querySelector('#heroQuestionForm');
  const heroQuestion = document.querySelector('#heroQuestion');
  const question = document.querySelector('#question');
  const questionForm = document.querySelector('#questionForm');
  const dialogView = document.querySelector('#dialogView');
  const workspace = document.querySelector('#workspace');
  const sticky = document.querySelector('#liveStickyStart');
  const primaryHeroButton = document.querySelector('.live-hero [data-go-create]');

  localStorage.setItem(RETURN_KEY, '/clone/live/');

  function rememberQuestion(value, autoSubmit = false) {
    const text = String(value || '').trim();
    if (!text) return false;
    localStorage.setItem(PENDING_KEY, text);
    if (autoSubmit) sessionStorage.setItem(AUTO_KEY, '1');
    return true;
  }

  function openCreation() {
    primaryHeroButton?.click();
  }

  heroForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!rememberQuestion(heroQuestion?.value, true)) return;
    try { window.ym?.(110937602, 'reachGoal', 'clone_intent_captured'); } catch {}
    openCreation();
  });

  document.querySelectorAll('.live-question-examples button').forEach((button) => {
    button.addEventListener('click', () => {
      if (!heroQuestion) return;
      heroQuestion.value = button.textContent.trim();
      heroQuestion.focus();
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
      }, 520);
    }
  }

  if (dialogView) {
    new MutationObserver(deliverPendingQuestion).observe(dialogView, { attributes: true, attributeFilter: ['class'] });
  }

  if (workspace) {
    new MutationObserver(() => {
      if (!workspace.classList.contains('hidden')) sticky?.classList.remove('visible');
    }).observe(workspace, { attributes: true, attributeFilter: ['class'] });
  }

  if (sticky && primaryHeroButton && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      const show = !entry.isIntersecting && !document.querySelector('#intro')?.classList.contains('hidden');
      sticky.classList.toggle('visible', show);
      sticky.setAttribute('aria-hidden', show ? 'false' : 'true');
    }, { threshold: .2 });
    observer.observe(primaryHeroButton);
  }

  deliverPendingQuestion();
})();
