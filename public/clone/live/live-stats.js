(() => {
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
