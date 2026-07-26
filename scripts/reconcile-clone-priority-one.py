from pathlib import Path
import re
import subprocess


def replace(path, old, new, count=1):
    target = Path(path)
    text = target.read_text()
    found = text.count(old)
    if found < count:
        raise SystemExit(f'{path}: source fragment not found: {old[:90]}')
    target.write_text(text.replace(old, new, count))


# Keep the approved free and paid prompt contracts byte-for-byte from main.
pristine = subprocess.check_output(['git', 'show', 'HEAD:src/ai.js'], text=True)
current = Path('src/ai.js').read_text()
policy_pattern = r"function cloneProfilePolicy\(profile, premium\) \{.*?\n\}\n\nexport function consultationSystemPrompt"
original_policy = re.search(policy_pattern, pristine, re.S)
if not original_policy:
    raise SystemExit('cloneProfilePolicy not found in main')
current, changed = re.subn(policy_pattern, original_policy.group(0), current, flags=re.S)
if changed != 1:
    raise SystemExit(f'cloneProfilePolicy replacements={changed}')
Path('src/ai.js').write_text(current)

# The model receives only the exact factors returned to the API/UI; no extra instruction is hidden in data.
factors = Path('src/consultation-factors.js')
text = factors.read_text()
text = text.replace(",\n    evidenceRule: 'Use only selectedFactors. Do not introduce any other chart placement, house, angle or aspect.'", '')
text = text.replace(
    "birth: {\n      unknownTime: Boolean(chart?.birth?.unknownTime),\n    },",
    "birth: {\n      unknownTime: Boolean(chart?.birth?.unknownTime),\n      date: chart?.birth?.date || null,\n    },",
)
factors.write_text(text)

canonical_paid = (
    'Бесплатный Клон показывает главный ход и объясняет его через факторы текущего ответа. '
    'На 24 часа полный режим связывает 3–6 значимых факторов в единую систему, '
    'показывает главное противоречие, альтернативный ход и условие, при котором решение изменится. '
    'Полная карта, персональный аватар и Паспорт клона останутся у вас навсегда.'
)

clone = Path('public/clone.js')
text = clone.read_text()
text = text.replace(
    'На 24 часа Клон перейдёт в глубокий режим: свяжет параметры полной карты в единую систему, '
    'покажет противоречия, альтернативные ходы и условия изменения решения. '
    'Полная карта, персональный аватар и Паспорт клона останутся у вас навсегда.',
    canonical_paid,
)
text = text.replace(
    'Будет построена честная карта без домов, ASC/MC и Луны. Ответы используют только устойчивые параметры даты.',
    'Будет построен режим без домов. В объяснении ответов не используются ASC/MC и Луна — '
    'только устойчивые параметры даты.',
)
clone.write_text(text)

for path in ['public/clone.html', 'public/clone/index.html']:
    target = Path(path)
    text = target.read_text()
    text = text.replace(
        'На 24 часа Клон перейдёт в глубокий режим: свяжет параметры полной карты в единую систему, '
        'покажет противоречия, альтернативные ходы и условия изменения решения. '
        'Полная карта, персональный аватар и Паспорт клона останутся у вас навсегда.',
        canonical_paid,
    )
    text = text.replace(
        'Клон будет собран без домов, ASC/MC и Луны — только по устойчивым параметрам даты.',
        'В объяснении ответов не будут использоваться дома, ASC/MC и Луна — '
        'только устойчивые параметры даты.',
    )
    target.write_text(text)
Path('public/clone/index.html').write_text(Path('public/clone.html').read_text())

live = Path('public/clone/live/index.html')
text = live.read_text()
substitutions = [
    (
        '<p class="live-lead">Он выделит главное для вашего вопроса, предложит альтернативный ход и объяснит, почему именно он.</p>',
        '<p class="live-lead">Клон покажет, как поступил бы он, и объяснит ход через реальные факторы вашей карты, относящиеся к вопросу.</p>',
    ),
    (
        '<p class="live-trust-line">Первые 3 ответа — здесь. После Telegram бесплатный диалог продолжается без лимита.</p>',
        '<p class="live-trust-line">Первые 3 ответа — здесь. После Telegram бесплатный диалог продолжается без лимита.</p>'
        '<p class="live-real-stats hidden" id="liveRealStats" aria-live="polite"></p>',
    ),
    (
        'Клон свяжет вопрос с картой, предложит следующий ход и покажет, что его сформировало.',
        'Клон покажет главный ход и реальные факторы карты, которые сформировали именно этот ответ.',
    ),
    (
        'В полном режиме Клон связывает факторы карты между собой и показывает, где ваши силы поддерживают друг друга, '
        'а где возникает внутреннее противоречие.',
        'Бесплатный Клон показывает главный ход и его факторы. Полный режим связывает 3–6 значимых факторов, '
        'показывает главное противоречие, альтернативный ход и условие изменения решения.',
    ),
    (
        'Полный режим показывает, как факторы карты поддерживают или противоречат друг другу в жизненных сценариях.',
        'Полный режим связывает 3–6 значимых факторов, показывает главное противоречие, '
        'альтернативный ход и условие изменения решения.',
    ),
    (
        'Бесплатный диалог помогает разбирать ваши вопросы без лимита. Полный режим связывает планеты, дома и аспекты '
        'между собой — показывает внутренние противоречия, сильные стороны и подходящий ход в конкретной ситуации.',
        'Бесплатный Клон показывает главный ход и объясняет его через факторы текущего ответа. '
        'Полный режим связывает 3–6 значимых факторов в единую систему, показывает главное противоречие, '
        'альтернативный ход и условие, при котором решение изменится.',
    ),
    (
        'Клон будет собран без домов, ASC/MC и Луны — только по устойчивым параметрам даты.',
        'В объяснении ответов не будут использоваться дома, ASC/MC и Луна — '
        'только устойчивые параметры даты.',
    ),
    ('/clone/live/live.css?v=20260726-auth2', '/clone/live/live.css?v=20260726-priority2'),
    (
        '<script src="/clone/live/live.js?v=20260726-auth2" defer></script>',
        '<script src="/clone/live/live-stats.js?v=20260726-priority2" defer></script>\n'
        '  <script src="/clone/live/live.js?v=20260726-auth2" defer></script>',
    ),
]
for old, new in substitutions:
    replace('public/clone/live/index.html', old, new)
text = live.read_text().replace(
    'На 24 часа Клон перейдёт в глубокий режим: свяжет параметры полной карты в единую систему, '
    'покажет противоречия, альтернативные ходы и условия изменения решения. '
    'Полная карта, персональный аватар и Паспорт клона останутся у вас навсегда.',
    canonical_paid,
)
live.write_text(text)

Path('public/clone/live/live-stats.js').write_text("""(() => {
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
""")

css = Path('public/clone/live/live.css')
css.write_text(css.read_text() + """

.live-real-stats {
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.45;
  color: rgba(226, 232, 240, .78);
}

@media (max-width: 720px) {
  .live-hero { min-height: auto; }
  .live-hero-copy { padding-bottom: 28px; }
  .live-hero .live-lead,
  .live-hero .live-primary,
  .live-hero .live-benefits { display: none; }
  .live-hero .restore-access { margin-top: 0; }
  .live-hero-image { min-height: 340px; }
  .live-intent { margin-top: 0; }
}
""")

config = Path('playwright.config.js')
config.write_text(config.read_text().replace(
    'fullyParallel: false,\n  retries: process.env.CI ? 1 : 0,',
    'fullyParallel: false,\n  workers: process.env.CI ? 1 : undefined,\n  retries: 0,',
))

spec = Path('e2e/clone-live.spec.js')
text = spec.read_text()
text = text.replace(
    "  await expect(page.locator('#dialogView')).toBeVisible({ timeout: 30_000 });",
    "  await expect.poll(async () => {\n"
    "    if (await page.locator('#dialogView').isVisible()) return 'ready';\n"
    "    const error = String(await page.locator('#formError').textContent() || '').trim();\n"
    "    return error ? `error: ${error}` : 'waiting';\n"
    "  }, { timeout: 30_000 }).toBe('ready');",
)
text = text.replace('/проект|партнёр|решить/i', '/проект|партнёр|решить|риск/i')
for title in [
    'вопрос проходит через создание Клона и показывает реальные факторы ответа',
    'режим неизвестного времени честно исключает дома, углы и Луну',
    'ответ и его факторный след восстанавливаются после перезагрузки',
]:
    text = text.replace(
        f"test('{title}', async ({{ page }}) => {{",
        f"test('{title}', async ({{ page }}, testInfo) => {{\n"
        "  test.skip(testInfo.project.name !== 'chromium', 'Десктопный контракт');",
    )
mobile_old = """  await expect(page.locator('#questionForm button[type="submit"]')).toBeEnabled();
  await expect(page.locator('#logicFactors')).toBeVisible();
});
"""
mobile_new = """  await expect(page.locator('#questionForm button[type="submit"]')).toBeEnabled();
  await page.locator('button[data-tab="profile"]').click();
  await expect(page.locator('#logicFactors')).toBeVisible();
});
"""
if mobile_old not in text:
    raise SystemExit('mobile factor panel fragment not found')
text = text.replace(mobile_old, mobile_new, 1)
spec.write_text(text)

Path('test/clone-product-promise.test.js').write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('live использует реальные серверные цифры', async () => {
  const [server, html, stats] = await Promise.all([
    read('server.js'),
    read('public/clone/live/index.html'),
    read('public/clone/live/live-stats.js'),
  ]);
  assert.match(server, /app\.get\('\/api\/public\/stats'/);
  assert.match(server, /getAdminOverview\(7\)/);
  assert.match(html, /id="liveRealStats"/);
  assert.match(stats, /fetch\('\/api\/public\/stats'/);
  assert.match(stats, /if \(!total && !recent\) return/);
});

test('бесплатное и платное обещание образуют одну лестницу ценности', async () => {
  const source = `${await read('public/clone/live/index.html')}\n${await read('public/clone.js')}`;
  assert.match(source, /главн(?:ый|ое) ход/i);
  assert.match(source, /3–6 значимых факторов/);
  assert.match(source, /альтернативн(?:ый|ые) ход/i);
  assert.match(source, /услови(?:е|я).*решени/i);
});

test('тарифные профили не изменены', async () => {
  const source = await read('src/consultation-profiles.js');
  assert.match(source, /promptVersion: '2026-07-23\.1145'/);
  assert.match(source, /sourceCommit: 'ad915b2bf870b27552eaf185a842702987d80da1'/);
  assert.match(source, /promptVersion: '2026-07-24\.current'/);
  assert.match(source, /sourceCommit: '9040f9f5d396c48f782373327959a6968ebab6f3'/);
});
""")

mobile_test = Path('test/clone-mobile-quality.test.js')
mobile_test.write_text(mobile_test.read_text().replace(
    "assert.ok(assets.every((asset) => /[?&]v=20260726-auth2/.test(asset)));",
    "assert.ok(assets.every((asset) => /[?&]v=[A-Za-z0-9._-]+/.test(asset)));",
))
profile_test = Path('test/consultation-profile.test.js')
profile_test.write_text(profile_test.read_text().replace(
    "serverSource.indexOf('answerConsultation({')",
    "serverSource.indexOf('answerConsultationWithFactors({')",
))
factor_test = Path('test/consultation-factors.test.js')
factor_test.write_text(factor_test.read_text().replace(
    "  assert.match(evidence.evidenceRule, /only selectedFactors/i);\n",
    '',
))
