import { test, expect } from '@playwright/test';

const CHART_ID = 'chart-support-e2e';

async function mountThreeCompletedAnswers(page) {
  await expect(page.locator('body')).toHaveClass(/live-app-ready/);
  await page.evaluate((chartId) => {
    localStorage.setItem('starClone', JSON.stringify({ chartId }));
    document.querySelector('#workspace')?.classList.remove('hidden');
    document.querySelector('#createView')?.classList.add('hidden');
    document.querySelector('#buildingView')?.classList.add('hidden');
    document.querySelector('#dialogView')?.classList.remove('hidden');
    const messages = document.querySelector('#messages');
    messages.innerHTML = '';
    for (let index = 1; index <= 3; index += 1) {
      const user = document.createElement('article');
      user.className = 'message user';
      user.textContent = `Вопрос ${index}`;
      const clone = document.createElement('article');
      clone.className = 'message clone';
      clone.textContent = `Полезный завершённый ответ ${index}`;
      messages.append(user, clone);
    }
  }, CHART_ID);
}

async function mockSupportConfig(page) {
  await page.route('**/api/config**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('chartId') !== CHART_ID) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        paymentsConfigured: true,
        user: {
          telegram_id: '42',
          cloneAccessActive: false,
          mapUnlocked: false,
          clonePassportUnlocked: false,
        },
        cloneOffers: {
          support: {
            code: 'clone_support',
            product: 'clone',
            title: 'Поддержать HeroStar',
            minAmount: 100,
            maxAmount: 10000,
            suggestedAmounts: [199, 499, 999],
            codePrefix: 'clone_support_',
            voluntary: true,
          },
        },
      }),
    });
  });
}

test('добровольная поддержка не блокирует Live и отправляет только проверяемый offerCode', async ({ page }, testInfo) => {
  await mockSupportConfig(page);
  await page.route('**/api/payments/create', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        paymentId: 'support-payment-e2e',
        paymentRef: 'support-ref-e2e',
        confirmationUrl: '/clone/live/chat?checkout=mock',
      }),
    });
  });

  await page.goto('/clone/live/chat');
  await mountThreeCompletedAnswers(page);

  const supportCard = page.locator('.live-support-card');
  await expect(supportCard).toBeVisible();
  await expect(supportCard).toContainText('Это добровольно');
  await expect(supportCard).toContainText('бесплатный диалог продолжит работать');
  await expect(page.locator('#fullModeOffer')).toBeHidden();
  await expect(page.locator('#alignmentOffer')).toBeHidden();
  await expect(page.locator('#questionForm')).toBeVisible();

  await supportCard.getByRole('button', { name: 'Поддержать HeroStar' }).click();
  const modal = page.locator('#liveHeartSupportModal');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Бесплатный диалог останется доступен независимо от оплаты');
  await expect(modal).toContainText('глубокий режим включится на 24 часа');
  await expect(modal.locator('[data-support-amount]')).toHaveText(['199 ₽', '499 ₽', '999 ₽']);
  await expect(modal.locator('[data-support-amount][aria-pressed="true"]')).toHaveCount(0);
  await expect(modal.locator('.live-support-submit')).toBeDisabled();

  const modalBox = await modal.locator('.live-support-modal-card').boundingBox();
  const viewport = page.viewportSize();
  expect(modalBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(modalBox.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(modalBox.height).toBeLessThanOrEqual(viewport.height + 1);
  if (['android-chromium', 'iphone-webkit'].includes(testInfo.project.name)) {
    const closeBox = await modal.getByRole('button', { name: 'Закрыть' }).boundingBox();
    expect(closeBox.width).toBeGreaterThanOrEqual(44);
    expect(closeBox.height).toBeGreaterThanOrEqual(44);
  }

  await modal.getByRole('button', { name: 'Закрыть' }).click();
  await expect(modal).toBeHidden();
  await expect(page.locator('#questionForm')).toBeVisible();
  await expect(supportCard).toBeVisible();

  await supportCard.getByRole('button', { name: 'Поддержать HeroStar' }).click();
  await modal.locator('#liveSupportCustomAmount').fill('350');
  await modal.locator('#liveSupportReceiptContact').fill('test@example.com');
  await expect(modal.locator('.live-support-submit')).toBeEnabled();
  await expect(modal.locator('.live-support-submit')).toHaveText('Поддержать на 350 ₽');

  const paymentRequestPromise = page.waitForRequest((request) => (
    request.method() === 'POST' && request.url().endsWith('/api/payments/create')
  ));
  await modal.locator('.live-support-submit').click();
  const paymentRequest = await paymentRequestPromise;
  const paymentPayload = paymentRequest.postDataJSON();

  expect(paymentPayload).toEqual({
    chartId: CHART_ID,
    receiptContact: 'test@example.com',
    product: 'clone',
    offerCode: 'clone_support_350',
  });
  expect('amount' in paymentPayload).toBe(false);

  await expect(page).toHaveURL(/checkout=mock/);
  const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('starClonePendingPayment') || 'null'));
  expect(pending.offerCode).toBe('clone_support_350');
  expect(pending.amount).toBe(350);
});
