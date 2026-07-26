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
  await page.locator('#heroQuestionForm').getByRole('button', { name: /Сохранить вопрос/ }).click();
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

test('вопрос проходит через создание Клона и показывает реальные факторы ответа', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Десктопный контракт');
  await startFromQuestion(page, 'Стоит ли входить в новый проект, если роли и деньги пока не определены?');
  await createClone(page);
  await expect(page.locator('#logicFactors')).toBeVisible();
  expect(await page.locator('#logicFactors .factor').count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('#logicFactors')).toContainText(/дом|Марс|Венера|Сатурн|Солнце/i);
  await expect(page.locator('#logicFactors')).toContainText(/текущ|действ|решен|связ/i);
});

test('режим неизвестного времени честно исключает дома, углы и Луну', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Десктопный контракт');
  await startFromQuestion(page, 'Как ответить партнёру и сохранить ясные договорённости?');
  await createClone(page, { unknownTime: true });
  await expect(page.locator('#cloneStatus')).toContainText('без домов');
  await expect(page.locator('#logicFactors')).toContainText('Время рождения неизвестно');
  const unknownTimeFactors = (await page.locator('#logicFactors .factor').allTextContents()).join(' ');
  expect(unknownTimeFactors).not.toMatch(/дом|Асцендент|ASC|MC|Луна/i);
  await expect(page.locator('#technicalBasis')).toContainText('Карта без домов');
});

test('ответ и его факторный след восстанавливаются после перезагрузки', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Десктопный контракт');
  await startFromQuestion(page, 'Стоит ли входить в новый проект или пока сохранить стабильность?');
  await createClone(page);
  const answer = await page.locator('#messages .message.clone').last().locator('p').innerText();
  const factors = await page.locator('#logicFactors').innerText();
  await page.reload();
  await expect(page.locator('#dialogView')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#messages .message.clone').last().locator('p')).toContainText(answer.slice(0, 35));
  await expect(page.locator('#logicFactors')).toContainText(factors.split('\n').find(Boolean));
});

test('мобильный основной путь сохраняет доступ к полю и факторной панели', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Проверка предназначена для мобильного проекта');
  await startFromQuestion(page, 'Стоит ли рискнуть и начать новый проект сейчас?');
  await createClone(page);
  await expect(page.locator('#question')).toBeVisible();
  await page.locator('#question').fill('Какой шаг проверить первым?');
  await expect(page.locator('#questionForm button[type="submit"]')).toBeEnabled();
  await page.locator('#question').blur();
  await page.locator('button[data-tab="profile"]').click();
  await expect(page.locator('#logicFactors')).toBeVisible();
});
