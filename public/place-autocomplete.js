const placeInput = document.querySelector('input[name="place"]');
const field = placeInput?.closest('.field');
const form = placeInput?.form;

if (placeInput && field && form) {
  const style = document.createElement('style');
  style.textContent = `
    .treasure-entry { overflow: visible; }
    .place-field-wrap { position: relative; z-index: 12; margin-bottom: 15px; }
    .place-field-wrap > .field { margin-bottom: 0; }
    .place-autocomplete { position: absolute; z-index: 80; left: 0; right: 0; top: calc(100% + 7px); overflow: hidden; border: 1px solid rgba(196,176,255,.24); border-radius: 17px; background: rgba(10,11,21,.98); box-shadow: 0 24px 70px rgba(0,0,0,.55); backdrop-filter: blur(24px); }
    .place-autocomplete[hidden] { display: none; }
    .place-option { width: 100%; display: grid; grid-template-columns: 31px minmax(0,1fr) 18px; align-items: center; gap: 10px; padding: 11px 13px; border: 0; border-bottom: 1px solid rgba(255,255,255,.055); text-align: left; background: transparent; cursor: pointer; }
    .place-option:last-of-type { border-bottom: 0; }
    .place-option:hover, .place-option.active { background: rgba(169,137,255,.11); }
    .place-option-icon { display: grid; place-items: center; width: 31px; height: 31px; border-radius: 10px; color: #c4b0ff; background: rgba(169,137,255,.09); font-size: 14px; }
    .place-option-copy { min-width: 0; }
    .place-option-copy strong, .place-option-copy span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .place-option-copy strong { color: #f4f1ff; font-size: 12px; }
    .place-option-copy span { margin-top: 3px; color: #858191; font-size: 10px; }
    .place-option-mark { color: #87e8dc; opacity: 0; }
    .place-option[aria-selected="true"] .place-option-mark { opacity: 1; }
    .place-attribution { padding: 8px 13px; color: #656170; font-size: 9px; border-top: 1px solid rgba(255,255,255,.055); }
    .place-attribution a { color: #898393; text-decoration: none; }
    .place-status { min-height: 15px; margin-top: 7px; font-size: 10px; line-height: 1.45; }
    .place-status:empty { display: none; }
    .place-status.searching { color: #8e899b; }
    .place-status.success { color: #8bdccb; }
    .place-status.warning { color: #e7c782; }
    .place-status.error { color: #ff9caa; }
    .place-field-wrap.recognized input { border-color: rgba(135,232,220,.44); box-shadow: 0 0 0 3px rgba(135,232,220,.055); }
    @media (max-width: 660px) {
      .place-autocomplete { position: fixed; left: 12px; right: 12px; top: auto; bottom: 12px; max-height: min(430px,70vh); overflow-y: auto; border-radius: 20px; }
      .place-option { padding: 13px; }
    }
  `;
  document.head.append(style);

  const wrap = document.createElement('div');
  wrap.className = 'place-field-wrap';
  field.parentNode.insertBefore(wrap, field);
  wrap.append(field);

  const helper = field.querySelector('small');
  if (helper) helper.textContent = 'Начните вводить город и выберите точный вариант.';

  const status = document.createElement('div');
  status.className = 'place-status';
  status.id = 'placeStatus';
  status.setAttribute('aria-live', 'polite');
  field.append(status);

  const list = document.createElement('div');
  list.className = 'place-autocomplete';
  list.id = 'placeSuggestions';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  wrap.append(list);

  placeInput.autocomplete = 'off';
  placeInput.setAttribute('role', 'combobox');
  placeInput.setAttribute('aria-autocomplete', 'list');
  placeInput.setAttribute('aria-controls', list.id);
  placeInput.setAttribute('aria-expanded', 'false');
  placeInput.setAttribute('aria-describedby', status.id);

  let selected = null;
  let items = [];
  let activeIndex = -1;
  let timer = null;
  let controller = null;
  let manualFallback = false;
  let requestVersion = 0;

  function setStatus(kind, text) {
    status.className = `place-status${kind ? ` ${kind}` : ''}`;
    status.textContent = text;
  }

  function closeList() {
    list.hidden = true;
    placeInput.setAttribute('aria-expanded', 'false');
    placeInput.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  }

  function updateActive(nextIndex) {
    if (!items.length) return;
    activeIndex = (nextIndex + items.length) % items.length;
    list.querySelectorAll('.place-option').forEach((option, index) => {
      option.classList.toggle('active', index === activeIndex);
    });
    const active = list.querySelector(`.place-option[data-index="${activeIndex}"]`);
    if (active) {
      placeInput.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  function choose(item) {
    selected = item;
    manualFallback = false;
    placeInput.value = item.label;
    placeInput.setCustomValidity('');
    wrap.classList.add('recognized');
    setStatus('success', `✓ Распознано: ${item.label} · координаты подтверждены`);
    closeList();
  }

  function renderOptions() {
    list.replaceChildren();
    items.forEach((item, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'place-option';
      option.id = `placeOption${index}`;
      option.dataset.index = String(index);
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(selected?.id === item.id));

      const icon = document.createElement('span');
      icon.className = 'place-option-icon';
      icon.textContent = '◎';

      const copy = document.createElement('span');
      copy.className = 'place-option-copy';
      const primary = document.createElement('strong');
      primary.textContent = item.primary;
      const secondary = document.createElement('span');
      secondary.textContent = item.secondary || 'Город';
      copy.append(primary, secondary);

      const mark = document.createElement('span');
      mark.className = 'place-option-mark';
      mark.textContent = '✓';
      option.append(icon, copy, mark);
      option.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        choose(item);
      });
      list.append(option);
    });

    const attribution = document.createElement('div');
    attribution.className = 'place-attribution';
    attribution.append('Поиск Photon · данные ');
    const link = document.createElement('a');
    link.href = 'https://www.openstreetmap.org/copyright';
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = '© OpenStreetMap';
    attribution.append(link);
    list.append(attribution);

    list.hidden = !items.length;
    placeInput.setAttribute('aria-expanded', String(Boolean(items.length)));
  }

  async function loadOptions(query) {
    const version = ++requestVersion;
    controller?.abort();
    controller = new AbortController();
    setStatus('searching', 'Ищем точный город…');
    placeInput.setAttribute('aria-busy', 'true');

    try {
      const response = await fetch(`/api/places?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Поиск недоступен');
      if (version !== requestVersion) return;

      items = Array.isArray(payload.items) ? payload.items : [];
      activeIndex = -1;
      if (!items.length) {
        manualFallback = true;
        closeList();
        setStatus('warning', 'Не нашли вариант. Добавьте страну или продолжите — место проверим при расчёте.');
        return;
      }

      manualFallback = false;
      setStatus('searching', 'Выберите точный город из списка.');
      renderOptions();
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (version !== requestVersion) return;
      items = [];
      manualFallback = true;
      closeList();
      setStatus('warning', 'Подсказки временно недоступны — место проверим при расчёте.');
    } finally {
      if (version === requestVersion) placeInput.removeAttribute('aria-busy');
    }
  }

  function scheduleSearch() {
    clearTimeout(timer);
    controller?.abort();
    const query = placeInput.value.trim();

    if (selected && query !== selected.label) selected = null;
    wrap.classList.toggle('recognized', Boolean(selected));
    placeInput.setCustomValidity('');
    items = [];
    closeList();

    if (query.length < 2) {
      manualFallback = false;
      setStatus('', query ? 'Введите ещё хотя бы один символ.' : '');
      return;
    }

    setStatus('searching', 'Ищем варианты…');
    timer = setTimeout(() => loadOptions(query), 380);
  }

  placeInput.addEventListener('input', scheduleSearch);
  placeInput.addEventListener('focus', () => {
    if (items.length && !selected) renderOptions();
  });
  placeInput.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && items.length) {
      event.preventDefault();
      updateActive(activeIndex + 1);
    } else if (event.key === 'ArrowUp' && items.length) {
      event.preventDefault();
      updateActive(activeIndex - 1);
    } else if (event.key === 'Enter' && !list.hidden && items.length) {
      event.preventDefault();
      choose(items[activeIndex >= 0 ? activeIndex : 0]);
    } else if (event.key === 'Escape') {
      closeList();
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (!wrap.contains(event.target)) closeList();
  });

  form.addEventListener('submit', (event) => {
    const value = placeInput.value.trim();
    if (selected && value === selected.label) {
      const visibleValue = placeInput.value;
      placeInput.value = `${selected.label}\u001f${selected.latitude}\u001f${selected.longitude}`;
      queueMicrotask(() => { placeInput.value = visibleValue; });
      return;
    }

    if (manualFallback) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    placeInput.setCustomValidity('Выберите точный город из списка.');
    placeInput.reportValidity();
    setStatus('error', 'Выберите город из списка — так координаты и часовой пояс будут точными.');
    if (items.length) renderOptions();
    else if (value.length >= 2) loadOptions(value);
    placeInput.focus();
  }, true);
}
