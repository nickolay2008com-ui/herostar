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
  `;
  document.head.append(polish);

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
