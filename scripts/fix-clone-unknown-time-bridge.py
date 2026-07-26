from pathlib import Path


def replace(path, old, new, count=1):
    target = Path(path)
    text = target.read_text()
    if text.count(old) < count:
        raise SystemExit(f'{path}: source fragment not found: {old[:110]}')
    target.write_text(text.replace(old, new, count))


# The compatibility layer must reuse the control already rendered by the page.
# Previously it returned null when the control existed and its fetch wrapper then
# overwrote a correct unknownTime=true payload with false.
replace(
    'public/clone-ui-gears.js',
    """    const form = document.querySelector('#birthForm');
    const timeInput = form?.querySelector('input[name="time"]');
    const grid = timeInput?.closest('.grid');
    if (!form || !timeInput || !grid || form.querySelector('#unknownTime')) return null;

    timeInput.id = 'birthTime';
""",
    """    const form = document.querySelector('#birthForm');
    const timeInput = form?.querySelector('input[name="time"]');
    const grid = timeInput?.closest('.grid');
    if (!form || !timeInput || !grid) return null;
    const existingControl = form.querySelector('#unknownTime');
    if (existingControl) return existingControl;

    timeInput.id = 'birthTime';
""",
)

# This asset is immutable in production, so the changed bridge needs a new URL.
for path in ['public/clone.html', 'public/clone/index.html', 'public/clone/live/index.html']:
    replace(
        path,
        '/clone-ui-gears.js?v=20260726-auth2',
        '/clone-ui-gears.js?v=20260726-priority1',
    )

# Playwright strict mode cannot apply one matcher to several factor cards. Check
# the combined text while preserving the same product assertion.
replace(
    'e2e/clone-live.spec.js',
    "  await expect(page.locator('#logicFactors .factor')).not.toContainText(/дом|Асцендент|ASC|MC|Луна/i);",
    "  const unknownTimeFactors = (await page.locator('#logicFactors .factor').allTextContents()).join(' ');\n"
    "  expect(unknownTimeFactors).not.toMatch(/дом|Асцендент|ASC|MC|Луна/i);",
)

Path('test/clone-unknown-time-bridge.test.js').write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('защитный слой использует существующий переключатель неизвестного времени', async () => {
  const source = await read('public/clone-ui-gears.js');
  assert.match(source, /const existingControl = form\.querySelector\('#unknownTime'\)/);
  assert.match(source, /if \(existingControl\) return existingControl/);
  assert.match(source, /payload\.unknownTime = Boolean\(unknownTime\?\.checked\)/);
});

test('обновлённый защитный слой не остаётся в immutable-кэше', async () => {
  const pages = await Promise.all([
    read('public/clone.html'),
    read('public/clone/index.html'),
    read('public/clone/live/index.html'),
  ]);
  assert.ok(pages.every((html) => html.includes('/clone-ui-gears.js?v=20260726-priority1')));
});
""")
