import { test, expect } from '@playwright/test';

const MOBILE_PROJECTS = new Set(['android-chromium', 'iphone-webkit', 'tablet-webkit']);

test('mobile Live App-shell освобождает 12px сверху и сохраняет 44px touch-target', async ({ page }, testInfo) => {
  test.skip(!MOBILE_PROJECTS.has(testInfo.project.name), 'Мобильный контракт App-shell');

  await page.goto('/clone/live/chat');
  await expect(page.locator('body')).toHaveClass(/live-chat-page/);
  await expect(page.locator('body')).toHaveClass(/live-app-ready/);

  await page.evaluate(() => {
    document.querySelector('#workspace')?.classList.remove('hidden');
    document.querySelector('#createView')?.classList.add('hidden');
    document.querySelector('#buildingView')?.classList.add('hidden');
    document.querySelector('#dialogView')?.classList.remove('hidden');
  });

  const topbar = page.locator('.live-topbar');
  const brand = page.locator('.live-topbar .brand');
  const home = page.locator('#liveHomeLink');
  const conversation = page.locator('#dialogView .conversation');

  await expect(topbar).toBeVisible();
  await expect(brand).toBeVisible();
  await expect(home).toBeVisible();
  await expect(conversation).toBeVisible();

  await expect.poll(async () => page.evaluate(() => ({
    topbarHeight: parseFloat(getComputedStyle(document.querySelector('.live-topbar')).height),
    workspacePaddingTop: parseFloat(getComputedStyle(document.querySelector('#workspace')).paddingTop),
  }))).toEqual({ topbarHeight: 44, workspacePaddingTop: 44 });

  const [brandBox, homeBox, conversationBox] = await Promise.all([
    brand.boundingBox(),
    home.boundingBox(),
    conversation.boundingBox(),
  ]);

  expect(brandBox).not.toBeNull();
  expect(homeBox).not.toBeNull();
  expect(conversationBox).not.toBeNull();
  expect(brandBox.height).toBeGreaterThanOrEqual(44);
  expect(homeBox.height).toBeGreaterThanOrEqual(44);
  expect(conversationBox.y).toBeGreaterThanOrEqual(43);
  expect(conversationBox.y).toBeLessThanOrEqual(45);
});
