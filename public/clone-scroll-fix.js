(() => {
  const root = document.documentElement;
  const body = document.body;
  const dialog = document.getElementById('dialogView');
  const messages = document.getElementById('messages');
  const question = document.getElementById('question');

  if (!dialog || !messages) return;

  let pinnedToBottom = true;

  const isDialogOpen = () => !dialog.classList.contains('hidden');
  const isNearBottom = () => messages.scrollHeight - messages.scrollTop - messages.clientHeight < 96;

  const updateViewportHeight = () => {
    const height = window.visualViewport?.height || window.innerHeight;
    root.style.setProperty('--clone-viewport-height', `${Math.round(height)}px`);
  };

  const scrollToLatest = ({ force = false } = {}) => {
    if (!isDialogOpen() || (!force && !pinnedToBottom)) return;
    requestAnimationFrame(() => {
      messages.scrollTop = messages.scrollHeight;
      pinnedToBottom = true;
    });
  };

  const syncDialogMode = () => {
    const open = isDialogOpen();
    root.classList.toggle('clone-dialog-open', open);
    body.classList.toggle('clone-dialog-open', open);
    updateViewportHeight();
    if (open) scrollToLatest({ force: true });
  };

  messages.addEventListener('scroll', () => {
    pinnedToBottom = isNearBottom();
  }, { passive: true });

  new MutationObserver(syncDialogMode).observe(dialog, {
    attributes: true,
    attributeFilter: ['class'],
  });

  new MutationObserver(() => scrollToLatest()).observe(messages, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  window.addEventListener('resize', updateViewportHeight, { passive: true });
  window.visualViewport?.addEventListener('resize', () => {
    updateViewportHeight();
    scrollToLatest({ force: document.activeElement === question });
  }, { passive: true });
  window.visualViewport?.addEventListener('scroll', updateViewportHeight, { passive: true });

  question?.addEventListener('focus', () => {
    setTimeout(() => scrollToLatest({ force: true }), 120);
  });

  updateViewportHeight();
  syncDialogMode();
})();
