import { test, expect } from '@playwright/test';

const MOBILE_PROJECTS = new Set(['android-chromium', 'iphone-webkit', 'tablet-webkit']);

test('mobile Live App-shell показывает одну шапку и сохраняет 44px touch-target', async ({ page }, testInfo) => {
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
  const appHeader = page.locator('#dialogView > .conversation-head');
  const home = appHeader.locator('.app-home-link');
  const newSituation = appHeader.locator('#newSituation');
  const conversation = page.locator('#dialogView .conversation');

  await expect(topbar).toBeHidden();
  await expect(appHeader).toBeVisible();
  await expect(home).toBeVisible();
  await expect(newSituation).toBeVisible();
  await expect(conversation).toBeVisible();

  await expect.poll(async () => page.evaluate(() => ({
    appHeaderHeight: parseFloat(getComputedStyle(document.querySelector('#dialogView > .conversation-head')).height),
    workspacePaddingTop: parseFloat(getComputedStyle(document.querySelector('#workspace')).paddingTop),
  }))).toEqual({ appHeaderHeight: 56, workspacePaddingTop: 0 });

  const [appHeaderBox, homeBox, newSituationBox, conversationBox] = await Promise.all([
    appHeader.boundingBox(),
    home.boundingBox(),
    newSituation.boundingBox(),
    conversation.boundingBox(),
  ]);

  expect(appHeaderBox).not.toBeNull();
  expect(homeBox).not.toBeNull();
  expect(newSituationBox).not.toBeNull();
  expect(conversationBox).not.toBeNull();
  expect(homeBox.height).toBeGreaterThanOrEqual(44);
  expect(homeBox.width).toBeGreaterThanOrEqual(44);
  expect(newSituationBox.height).toBeGreaterThanOrEqual(44);
  expect(newSituationBox.width).toBeGreaterThanOrEqual(44);
  expect(appHeaderBox.y).toBe(0);
  expect(conversationBox.y).toBeGreaterThanOrEqual(55);
  expect(conversationBox.y).toBeLessThanOrEqual(57);
});
