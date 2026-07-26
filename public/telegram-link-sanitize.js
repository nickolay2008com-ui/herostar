(() => {
  const parameter = 'telegram_link';
  const storageKey = 'herostarTelegramLinkReturn';
  let url;
  let token;

  try {
    url = new URL(location.href);
    token = url.searchParams.get(parameter);
  } catch {
    return;
  }
  if (!token) return;

  window.__herostarTelegramLinkReturn = token;
  try {
    sessionStorage.setItem(storageKey, token);
  } catch {
    // Временная переменная сохраняет token до загрузки основного клиента.
  }

  try {
    url.searchParams.delete(parameter);
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Основной клиент повторит очистку до любых сетевых действий.
  }
})();
