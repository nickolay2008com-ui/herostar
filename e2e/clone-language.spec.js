import { test, expect } from '@playwright/test';

test('RU, EN and IT switch on both routes and persist across navigation', async ({ page }) => {
  await page.goto('/clone/live/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  const homeLanguage = page.locator('.live-topbar .clone-language');
  await homeLanguage.selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#liveTitle')).toContainText('When you are unsure');
  await expect(page.locator('#heroQuestion')).toHaveAttribute('placeholder', /For example/);
  await page.goto('/clone/live/chat');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#birthForm button[type="submit"]')).toHaveText('Create my Clone');
  const chatLanguage = page.locator('.conversation-head .clone-language');
  await expect(chatLanguage).toBeVisible();
  await chatLanguage.selectOption('it');
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await expect(page.locator('#birthForm button[type="submit"]')).toHaveText('Crea il mio Clone');
  await expect(page.locator('#question')).toHaveAttribute('placeholder', 'Descrivi cosa sta succedendo…');
  await page.goto('/clone/live/');
  await expect(page.locator('#liveTitle')).toContainText('Quando non sai');
  await expect(homeLanguage).toHaveValue('it');
  await homeLanguage.selectOption('ru');
  await expect(page.locator('#liveTitle')).toContainText('Когда неясно');
});

test('selected language changes the suggestion sent to the question flow', async ({ page }) => {
  await page.goto('/clone/live/?lang=en');
  await expect(page.locator('#cloneInsightSlider [data-clone-prompt]').first()).toHaveAttribute('data-clone-prompt', /How can I tell/);
  await page.locator('#cloneInsightSlider [data-insight-cta]').first().click();
  await expect(page).toHaveURL(/\/clone\/live\/chat/);
  await expect(page.locator('#createView')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('starClonePendingQuestion'))).toMatch(/How can I tell/);
});
