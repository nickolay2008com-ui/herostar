import test from 'node:test';
import assert from 'node:assert/strict';

const baseUrl = 'https://herostar.up.railway.app';
const runSmoke = process.env.RUN_TYPOGRAPHY_SMOKE === '1';

async function text(path) {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(20_000) });
  const body = await response.text();
  assert.equal(response.status, 200, `${path} должен отдаваться`);
  return body;
}

test('HeroStar typography production smoke', { timeout: 70_000, skip: !runSmoke }, async () => {
  const [home, styles, typography, admin, adminTypography] = await Promise.all([
    text('/'),
    text('/styles.css'),
    text('/typography.css'),
    text('/admin.html'),
    text('/admin-typography.css'),
  ]);

  assert.match(home, /href="\/styles\.css"/);
  assert.match(styles, /typography\.css/);
  assert.match(typography, /Segoe UI Variable Display/);
  assert.match(typography, /font-variant-numeric:\s*tabular-nums/);
  assert.doesNotMatch(typography, /https?:\/\//);

  assert.match(admin, /admin-typography\.css/);
  assert.match(adminTypography, /--font-display/);
  assert.match(adminTypography, /text-wrap:\s*balance/);
  assert.doesNotMatch(adminTypography, /https?:\/\//);
});
