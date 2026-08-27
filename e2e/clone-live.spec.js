import { test, expect } from '@playwright/test';

async function mockPlaces(page) {
  await page.route('**/api/places?q=*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ name: 'Донецк', label: 'Донецк, Украина', latitude: 48.0159, longitude: 37.8028 }] }),
    });
  });
}

async function startFromQuestion(page, questionText) {
  await mockPlaces(page);
  await page.goto('/clone/live/');
  await page.locator('#heroQuestion').fill(questionText);
  await page.locator('#heroQuestionForm button[type="submit"]').click();
  await expect(page.locator('#createView')).toBeVisible();
}

async function selectPlace(page) {
  await page.locator('#placeQuery').fill('Донецк');
  await page.getByRole('option', { name: /Донецк/ }).click();
}

async function createClone(page, { unknownTime = false } = {}) {
  await page.locator('input[name="name"]').fill('Звёздный Николай');
  await page.locator('input[name="date"]').fill('1987-11-06');
  if (unknownTime) {
    await page.locator('#unknownTime').check();
    await expect(page.locator('#birthTime')).toBeDisabled();
  } else {
    await page.locator('#birthTime').fill('01:15');
  }
  await selectPlace(page);
  await page.locator('input[name="personalDataConsent"]').check();
  expect(await page.locator('#unknownTime').isChecked()).toBe(unknownTime);
  const chartRequestPromise = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/charts'));
  await page.getByRole('button', { name: 'Собрать живую модель' }).click();
  const chartRequest = await chartRequestPromise;
  const chartPayload = chartRequest.postDataJSON();
  expect(chartPayload.unknownTime).toBe(unknownTime);
  expect(chartPayload.time).toBe(unknownTime ? '' : '01:15');
  await expect.poll(async () => {
    if (await page.locator('#dialogView').isVisible()) return 'ready';
    const error = String(await page.locator('#formError').textContent() || '').trim();
    return error ? `error: ${error}` : 'waiting';
  }, { timeout: 30_000 }).toBe('ready');
  await expect(page.locator('#messages .message.user')).toContainText(/проект|партнёр|решить|риск/i, { timeout: 15_000 });
  await expect(page.locator('#messages .message.clone').last()).not.toContainText('Клон готовит ответ', { timeout: 30_000 });
}

test('desktop landing показывает вопрос в первом экране без дублирующего CTA', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Десктопный контракт');
  await page.goto('/clone/live/');

  await expect(page.locator('#heroQuestion')).toBeVisible();
  await expect(page.locator('.live-primary')).toBeHidden();
  await expect(page.locator('#restoreCloneAccess')).toBeVisible();
  await expect(page.locator('.clone-insight-slide')).toHaveCount(3);
  await expect(page.locator('.clone-insight-slide h4')).toHaveText([
    'Отношения',
    'Работа и деньги',
    'Что со мной происходит',
  ]);

  const questionBox = await page.locator('#heroQuestion').boundingBox();
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  expect(questionBox).not.toBeNull();
  expect(questionBox.y).toBeGreaterThanOrEqual(0);
  expect(questionBox.y + questionBox.height).toBeLessThanOrEqual(viewportHeight + 1);
});

test('главная и чат имеют отдельные адреса с явным возвратом', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Десктопный контракт');
  await page.goto('/clone/live/');
  await expect(page).toHaveURL(/\/clone\/live\/$/);
  await expect(page.locator('#intro')).toBeVisible();

  await page.goto('/clone/live/chat');
  await expect(page).toHaveURL(/\/clone\/live\/chat$/);
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.getByRole('link', { name: 'На главную' })).toBeVisible();

  await page.getByRole('link', { name: 'На главную' }).click();
  await expect(page).toHaveURL(/\/clone\/live\/$/);
  await expect(page.locator('#intro')).toBeVisible();
});

test('вопрос проходит через создание Клона и показывает факторы у конкретного ответа', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Десктопный контракт');
  await startFromQuestion(page, 'Стоит ли входить в новый проект, если роли и деньги пока не определены?');
  await createClone(page);

  const latestAnswer = page.locator('#messages .message.clone').last();
  const visibleAnswer = latestAnswer.locator(':scope > div > p').first();
  const evidenceTrigger = latestAnswer.locator('.answer-evidence-trigger');
  const evidencePopover = latestAnswer.locator('.answer-evidence-popover');
  await expect(visibleAnswer).not.toContainText(/Куспид|орбис|тригон|секстил|ретроград|\d+(?:[.,]\d+)?°/i);
  await expect(evidenceTrigger).toBeVisible();
  await expect(evidenceTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(evidencePopover).toBeHidden();
  await evidenceTrigger.click();
  await expect(evidenceTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect(evidencePopover).toBeVisible();
  await expect(evidencePopover).toContainText(/дом|Марс|Венера|Сатурн|Солнце/i);
  await expect(evidencePopover).toContainText(/текущ|действ|решен|связ/i);

  await page.locator('button[data-tab="profile"]').click();
  await expect(page.locator('#logicPanel')).toBeVisible();
  await expect(page.locator('#logicFactors')).toBeVisible();
  expect(await page.locator('#logicFactors .factor').count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('#dialogView .conversation')).toBeHidden();

  await page.locator('button[data-tab="dialog"]').click();
  await expect(page.locator('#dialogView .conversation')).toBeVisible();
  await expect(page.locator('#logicPanel')).toBeHidden();
});

test('режим неизвестного времени честно исключает дома, углы и Луну', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Десктопный контракт');
  await startFromQuestion(page, 'Как ответить партнёру и сохранить ясные договорённости?');
  await createClone(page, { unknownTime: true });
  await expect(page.locator('#cloneStatus')).toContainText('без домов');

  const latestAnswer = page.locator('#messages .message.clone').last();
  const evidenceTrigger = latestAnswer.locator('.answer-evidence-trigger');
  const evidencePopover = latestAnswer.locator('.answer-evidence-popover');
  await expect(evidenceTrigger).toBeVisible();
  await evidenceTrigger.click();
  await expect(evidencePopover).toContainText('Время рождения неизвестно');
  const unknownTimeFactors = (await evidencePopover.locator('.answer-factor-item').allTextContents()).join(' ');
  expect(unknownTimeFactors).not.toMatch(/дом|Асцендент|ASC|MC|Луна/i);

  await page.locator('button[data-tab="profile"]').click();
  await expect(page.locator('#technicalBasis')).toContainText('Карта без домов');
});

test('ответ и его факторный след восстанавливаются после перезагрузки', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Десктопный контракт');
  await startFromQuestion(page, 'Стоит ли входить в новый проект или пока сохранить стабильность?');
  await createClone(page);
  const answerParagraph = page.locator('#messages .message.clone').last().locator('p').first();
  const answer = await answerParagraph.innerText();
  const latestAnswer = page.locator('#messages .message.clone').last();
  const evidenceTrigger = latestAnswer.locator('.answer-evidence-trigger');
  const evidencePopover = latestAnswer.locator('.answer-evidence-popover');
  await expect(evidenceTrigger).toBeVisible();
  await evidenceTrigger.click();
  const factorText = String(await evidencePopover.locator('.answer-factor-item').first().innerText()).trim();

  await page.reload();
  await expect(page.locator('#dialogView')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#messages .message.clone').last().locator('p').first()).toContainText(answer.slice(0, 35));
  const restoredAnswer = page.locator('#messages .message.clone').last();
  const restoredTrigger = restoredAnswer.locator('.answer-evidence-trigger');
  const restoredPopover = restoredAnswer.locator('.answer-evidence-popover');
  await expect(restoredTrigger).toBeVisible();
  await restoredTrigger.click();
  await expect(restoredPopover).toContainText(factorText.split('\n').find(Boolean));
});

test('два восстановленных ответа получают собственные popover, включая старую историю', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Десктопный контракт истории');
  await startFromQuestion(page, 'Стоит ли входить в новый проект или пока сохранить стабильность?');
  await createClone(page);

  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('starClone') || 'null');
    saved.questionCount = 2;
    saved.messages = [
      { role: 'user', content: 'Первый вопрос' },
      {
        role: 'clone',
        content: 'Клон сначала проверил бы договорённости.\n\nПочему: Венера в Тельце 12° и 7-й дом поддерживают этот ход.',
        factors: [{ title: 'Венера', position: 'Венера в Тельце 12°', role: 'помогает проверить устойчивость договорённостей' }],
      },
      { role: 'user', content: 'Второй вопрос' },
      {
        role: 'clone',
        content: 'Клон выбрал бы обратимый шаг.\n\nПочему: Куспид 5°15′ и тригон с орбисом 2.1° поддерживают проверку.',
      },
    ];
    localStorage.setItem('starClone', JSON.stringify(saved));
  });

  await page.reload();
  await expect(page.locator('#dialogView')).toBeVisible({ timeout: 20_000 });
  const answers = page.locator('#messages .message.clone');
  await expect(answers).toHaveCount(2);
  await expect(answers.locator('.answer-evidence-trigger')).toHaveCount(2);
  const visibleTexts = (await answers.locator(':scope > div > p').allTextContents()).join(' ');
  expect(visibleTexts).not.toMatch(/Куспид|тригон|орбис|12°|7-й дом/i);

  const firstTrigger = answers.nth(0).locator('.answer-evidence-trigger');
  const secondTrigger = answers.nth(1).locator('.answer-evidence-trigger');
  await firstTrigger.click();
  await expect(answers.nth(0).locator('.answer-evidence-popover')).toContainText('Венера в Тельце 12°');
  await secondTrigger.click();
  await expect(firstTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(answers.nth(1).locator('.answer-evidence-popover')).toContainText(/Куспид 5°15′.*орбис 2.1°/s);
});

test('мобильный основной путь сохраняет компактный чат, поле ввода и отдельный доступ к карте', async ({ page }, testInfo) => {
  test.skip(!['android-chromium', 'iphone-webkit'].includes(testInfo.project.name), 'Проверка предназначена для мобильных движков');
  await startFromQuestion(page, 'Стоит ли рискнуть и начать новый проект сейчас?');
  await createClone(page);

  await expect(page.locator('#question')).toBeVisible();
  await expect(page.locator('.app-chat-title')).toContainText('Звёздный клон');
  await expect(page.locator('.app-chat-title')).toContainText('по вашей натальной карте');
  const headerBox = await page.locator('#dialogView .conversation-head').boundingBox();
  const composerBox = await page.locator('#questionForm').boundingBox();
  const sendBox = await page.locator('#questionForm button[type="submit"]').boundingBox();
  expect(headerBox).not.toBeNull();
  expect(composerBox).not.toBeNull();
  expect(sendBox).not.toBeNull();
  expect(headerBox.height).toBeLessThanOrEqual(60);
  expect(sendBox.width).toBeGreaterThanOrEqual(44);
  expect(sendBox.height).toBeGreaterThanOrEqual(44);
  expect(composerBox.width).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  expect(await page.locator('#questionForm').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 252, 248)');

  const evidenceTrigger = page.locator('#messages .message.clone').last().locator('.answer-evidence-trigger');
  await expect(evidenceTrigger).toBeVisible();
  const evidenceBox = await evidenceTrigger.boundingBox();
  expect(evidenceBox).not.toBeNull();
  expect(evidenceBox.width).toBeGreaterThanOrEqual(44);
  expect(evidenceBox.height).toBeGreaterThanOrEqual(44);
  await page.locator('#question').fill('Какой шаг проверить первым?');
  await expect(page.locator('#questionForm button[type="submit"]')).toBeEnabled();
  await page.locator('#question').blur();
  await page.locator('button[data-tab="profile"]').click();
  await expect(page.locator('#logicPanel')).toBeVisible();
  await expect(page.locator('#logicFactors')).toBeVisible();
  await expect(page.locator('#questionForm')).toBeHidden();
  await page.locator('button[data-tab="dialog"]').click();
  await expect(page.locator('#questionForm')).toBeVisible();
});
