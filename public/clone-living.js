(() => {
  const question = document.querySelector('#question');
  const questionForm = document.querySelector('#questionForm');
  const messages = document.querySelector('#messages');
  const dialogView = document.querySelector('#dialogView');
  const paywall = document.querySelector('#clonePaywall');

  function resizeComposer() {
    if (!question) return;
    question.style.height = 'auto';
    question.style.height = `${Math.min(Math.max(question.scrollHeight, 70), 180)}px`;
  }

  function focusCurrentAction() {
    if (!dialogView || dialogView.classList.contains('hidden')) return;
    window.setTimeout(() => question?.focus({ preventScroll: true }), 180);
  }

  if (messages) {
    messages.setAttribute('aria-live', 'polite');
    messages.setAttribute('aria-relevant', 'additions text');
    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(() => {
        messages.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' });
      });
    });
    observer.observe(messages, { childList: true, subtree: true, characterData: true });
  }

  document.querySelector('#formError')?.setAttribute('role', 'alert');
  document.querySelector('#dialogError')?.setAttribute('role', 'alert');

  question?.addEventListener('input', resizeComposer);
  question?.addEventListener('keydown', (event) => {
    if (event.isComposing || event.key !== 'Enter' || event.shiftKey) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    event.preventDefault();
    if (!question.disabled && question.value.trim()) questionForm?.requestSubmit();
  });

  questionForm?.addEventListener('submit', () => {
    window.setTimeout(resizeComposer, 0);
  });

  document.querySelectorAll('[data-go-create]').forEach((button) => {
    button.addEventListener('click', () => {
      window.setTimeout(() => document.querySelector('#birthForm input[name="name"]')?.focus(), 420);
    });
  });

  document.querySelector('#newSituation')?.addEventListener('click', focusCurrentAction);
  document.querySelectorAll('.chips button').forEach((button) => {
    button.addEventListener('click', () => window.setTimeout(resizeComposer, 0));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || paywall?.classList.contains('hidden')) return;
    document.querySelector('#closeClonePaywall')?.click();
  });

  if (dialogView) {
    new MutationObserver(() => focusCurrentAction())
      .observe(dialogView, { attributes: true, attributeFilter: ['class'] });
  }

  resizeComposer();
})();
