(() => {
  const polish = document.createElement('style');
  polish.dataset.cloneBirthFormPolish = '';
  polish.textContent = `
    .live-product .birth-form input:focus,
    .live-product .birth-form input:focus-visible {
      outline: 0;
      outline-offset: 0;
      border-color: rgba(167,139,250,.52);
      background: rgba(255,255,255,.055);
      box-shadow: 0 0 0 3px rgba(167,139,250,.075), inset 0 1px rgba(255,255,255,.035);
    }

    .live-product .birth-form input:-webkit-autofill,
    .live-product .birth-form input:-webkit-autofill:hover,
    .live-product .birth-form input:-webkit-autofill:focus {
      -webkit-text-fill-color: #f5f2f8;
      caret-color: #f5f2f8;
      border-color: rgba(167,139,250,.38);
      -webkit-box-shadow: 0 0 0 1000px #181a28 inset;
      box-shadow: 0 0 0 1000px #181a28 inset;
      transition: background-color 9999s ease-out 0s;
    }

    .live-product .birth-form input:-webkit-autofill:focus {
      border-color: rgba(167,139,250,.52);
      -webkit-box-shadow: 0 0 0 1000px #181a28 inset, 0 0 0 3px rgba(167,139,250,.075);
      box-shadow: 0 0 0 1000px #181a28 inset, 0 0 0 3px rgba(167,139,250,.075);
    }

    .live-product .place-results:empty {
      display: none;
    }

    .live-product .message.clone.clone-first-answer {
      border: 0 !important;
      background: linear-gradient(145deg, rgba(91,61,170,.12), rgba(17,20,34,.72)) !important;
      box-shadow: none !important;
    }

    .live-product .message.clone.clone-first-answer > div {
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    .live-product #clonePassport .passport-section,
    .live-product #clonePassport .passport-section:focus,
    .live-product #clonePassport .passport-section:focus-visible,
    .live-product #clonePassport .passport-section:focus-within {
      outline: 0 !important;
      border-color: rgba(255,255,255,.075) !important;
      box-shadow: inset 0 1px rgba(255,255,255,.025) !important;
    }

    .live-product .side nav button:focus-visible {
      outline: 0 !important;
      box-shadow: 0 0 0 2px rgba(167,139,250,.16) !important;
    }

    .live-product #logicFactors .factor-title-aligned {
      display: grid !important;
      grid-template-columns: 12px minmax(0,1fr);
      align-items: start;
      column-gap: 8px;
      margin-bottom: 6px;
    }

    .live-product #logicFactors .factor-title-aligned::before {
      content: none !important;
    }

    .live-product #logicFactors .factor-title-marker {
      display: block;
      width: 12px;
      color: var(--live-gold, #f2d994);
      font-size: 11px;
      line-height: 1.3;
      text-align: center;
      transform: translateY(1px);
    }

    .live-product #logicFactors .factor-title-text {
      min-width: 0;
      line-height: 1.3;
    }
  `;
  document.head.append(polish);

  function alignFactorTitles() {
    document.querySelectorAll('#logicFactors .factor > strong:not(.factor-title-aligned)').forEach((title) => {
      const raw = String(title.textContent || '').trim();
      if (!raw) return;

      const leading = raw.match(/^([^\p{L}\p{N}]+)\s*(.+)$/u);
      const marker = leading?.[1]?.trim() || '•';
      const label = leading?.[2]?.trim() || raw;

      const markerNode = document.createElement('span');
      markerNode.className = 'factor-title-marker';
      markerNode.setAttribute('aria-hidden', 'true');
      markerNode.textContent = marker;

      const textNode = document.createElement('span');
      textNode.className = 'factor-title-text';
      textNode.textContent = label;

      title.textContent = '';
      title.classList.add('factor-title-aligned');
      title.append(markerNode, textNode);
    });
  }

  const factorRoot = document.querySelector('#logicFactors');
  if (factorRoot) {
    alignFactorTitles();
    new MutationObserver(alignFactorTitles).observe(factorRoot, { childList: true, subtree: true });
  }

  const target = document.querySelector('#liveRealStats');
  if (!target) return;

  const formatCount = (value) => new Intl.NumberFormat('ru-RU').format(Math.max(0, Number(value || 0)));

  fetch('/api/public/stats', { headers: { Accept: 'application/json' } })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('stats unavailable')))
    .then((stats) => {
      const total = Math.max(0, Number(stats.totalCharts || 0));
      const recent = Math.max(0, Number(stats.charts7d || 0));
      if (!total && !recent) return;
      const parts = [];
      if (total) parts.push(`создано ${formatCount(total)} карт`);
      if (recent) parts.push(`${formatCount(recent)} за последние 7 дней`);
      target.textContent = `Реальные данные HeroStar: ${parts.join(' · ')}`;
      target.classList.remove('hidden');
    })
    .catch(() => {
      // Недоступная статистика не заменяется выдуманной цифрой.
    });
})();