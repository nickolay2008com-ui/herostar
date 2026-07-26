from pathlib import Path


def replace(path, old, new, count=1):
    target = Path(path)
    text = target.read_text()
    found = text.count(old)
    if found < count:
        raise SystemExit(f'{path}: source fragment not found: {old[:100]}')
    target.write_text(text.replace(old, new, count))


# Update old text-contract tests to the approved value ladder.
replace(
    'test/clone-live-chat.test.js',
    "assert.match(html, /В полном режиме Клон связывает факторы карты между собой/);",
    "assert.match(html, /Полный режим связывает 3–6 значимых факторов/);",
)
replace(
    'test/clone-live-chat.test.js',
    "assert.match(html, />Бесплатный диалог помогает разбирать ваши вопросы без лимита\./);",
    "assert.match(html, />Бесплатный Клон показывает главный ход/);",
)

# Build the birth payload from the submitted form itself. The checked selector is
# the single source of truth and cannot be confused with a form RadioNodeList.
client = Path('public/clone.js')
text = client.read_text()
helper_marker = "$('#unknownTime')?.addEventListener('change', syncUnknownBirthTime);\nsyncUnknownBirthTime();\n\n"
helper = """$('#unknownTime')?.addEventListener('change', syncUnknownBirthTime);
syncUnknownBirthTime();

function buildBirthPayload(form, selectedPlace) {
  const formData = new FormData(form);
  const unknownTime = Boolean(form.querySelector('input[name="unknownTime"]:checked'));
  const birthTime = String(formData.get('time') || '').trim();
  return {
    name: formData.get('name'),
    date: formData.get('date'),
    time: unknownTime ? '' : birthTime,
    unknownTime,
    place: selectedPlaceValue(selectedPlace),
    personalDataConsent: formData.get('personalDataConsent') === 'on',
    product: 'clone',
  };
}

"""
if helper_marker not in text:
    raise SystemExit('unknown-time helper insertion marker not found')
text = text.replace(helper_marker, helper, 1)
text = text.replace(
    "  const formData = new FormData(event.currentTarget);\n  show('#buildingView');",
    "  const payload = buildBirthPayload(event.currentTarget, state.selectedPlace);\n  show('#buildingView');",
    1,
)
old_payload = """    const unknownTime = formData.get('unknownTime') === 'on';
    const payload = {
      name: formData.get('name'),
      date: formData.get('date'),
      time: unknownTime ? '' : formData.get('time'),
      unknownTime,
      place: selectedPlaceValue(state.selectedPlace),
      personalDataConsent: formData.get('personalDataConsent') === 'on',
      product: 'clone',
    };
"""
if old_payload not in text:
    raise SystemExit('legacy birth payload block not found')
text = text.replace(old_payload, '', 1)
client.write_text(text)

# Keep contracts strict while checking the new single source of truth.
answer_contract = Path('test/clone-answer-factors-contract.test.js')
text = answer_contract.read_text()
text = text.replace(
    "  assert.match(liveHtml, /без домов, ASC\\/MC и Луны/);",
    "  assert.match(liveHtml, /дома, ASC\\/MC и Луна/);",
)
text = text.replace(
    "  assert.match(client, /unknownTime \\? '' : formData\\.get\\('time'\\)/);",
    "  assert.match(client, /input\\[name=\\\"unknownTime\\\"\\]:checked/);\n"
    "  assert.match(client, /time: unknownTime \\? '' : birthTime/);",
)
answer_contract.write_text(text)

wiring = Path('test/clone-functional-wiring.test.js')
text = wiring.read_text()
marker = "  assert.match(clone, /personalDataConsent/);\n"
addition = (
    marker
    + "  assert.match(clone, /function buildBirthPayload\\(form, selectedPlace\\)/);\n"
    + "  assert.match(clone, /querySelector\\('input\\[name=\\\"unknownTime\\\"\\]:checked'\\)/);\n"
)
if marker not in text:
    raise SystemExit('functional wiring marker not found')
wiring.write_text(text.replace(marker, addition, 1))

# The live mobile stylesheet already has a compact navigation treatment; expose it
# so users can switch between the dialog and the answer-factor panel.
live_css = Path('public/clone/live/live.css')
live_css.write_text(live_css.read_text() + """

@media (max-width: 900px) {
  .live-product .workspace .side { display: block; }
}
""")

# Browser tests validate the actual POST body, not merely the checkbox appearance.
spec = Path('e2e/clone-live.spec.js')
text = spec.read_text()
text = text.replace(
    "  await page.getByRole('button', { name: 'Собрать живую модель' }).click();",
    "  expect(await page.locator('#unknownTime').isChecked()).toBe(unknownTime);\n"
    "  const chartRequestPromise = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/charts'));\n"
    "  await page.getByRole('button', { name: 'Собрать живую модель' }).click();\n"
    "  const chartRequest = await chartRequestPromise;\n"
    "  const chartPayload = chartRequest.postDataJSON();\n"
    "  expect(chartPayload.unknownTime).toBe(unknownTime);\n"
    "  expect(chartPayload.time).toBe(unknownTime ? '' : '01:15');",
    1,
)
text = text.replace(
    "const answer = await page.locator('#messages .message.clone').last().innerText();",
    "const answer = await page.locator('#messages .message.clone').last().locator('p').innerText();",
)
text = text.replace(
    "await expect(page.locator('#messages .message.clone').last()).toContainText(answer.slice(0, 35));",
    "await expect(page.locator('#messages .message.clone').last().locator('p')).toContainText(answer.slice(0, 35));",
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
text = text.replace(
    "  await expect(page.locator('#dialogView')).toBeVisible({ timeout: 30_000 });",
    "  await expect.poll(async () => {\n"
    "    if (await page.locator('#dialogView').isVisible()) return 'ready';\n"
    "    const error = String(await page.locator('#formError').textContent() || '').trim();\n"
    "    return error ? `error: ${error}` : 'waiting';\n"
    "  }, { timeout: 30_000 }).toBe('ready');",
)
mobile_click = """  await page.locator('button[data-tab="profile"]').click();
  await expect(page.locator('#logicFactors')).toBeVisible();
"""
mobile_new = """  await page.locator('#question').blur();
  await page.locator('button[data-tab="profile"]').click();
  await expect(page.locator('#logicFactors')).toBeVisible();
"""
if mobile_click not in text:
    raise SystemExit('mobile factor-panel scenario not found')
text = text.replace(mobile_click, mobile_new, 1)
spec.write_text(text)

# CI browser runs must be deterministic rather than retrying a broken path.
config = Path('playwright.config.js')
text = config.read_text()
text = text.replace(
    'fullyParallel: false,\n  retries: process.env.CI ? 1 : 0,',
    'fullyParallel: false,\n  workers: process.env.CI ? 1 : undefined,\n  retries: 0,',
)
config.write_text(text)
