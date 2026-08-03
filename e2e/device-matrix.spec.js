import { test, expect } from '@playwright/test';

const explicitViewports = [
  { name: 'small-android', width: 320, height: 568 },
  { name: 'iphone-se', width: 375, height: 667 },
  { name: 'modern-phone', width: 412, height: 915 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'wide-desktop', width: 1920, height: 1080 },
];

async function expectNoPageOverflow(page) {
  const geometry = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const offenders = [...document.querySelectorAll('body *')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const overflow = Math.max(0, rect.right - viewportWidth, -rect.left);
        const internalOverflow = Math.max(0, element.scrollWidth - element.clientWidth);
        return {
          selector: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${[...element.classList].slice(0, 3).map((name) => `.${name}`).join('')}`,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          overflow: Math.round(overflow),
          internalOverflow,
          position: style.position,
          display: style.display,
          overflowX: style.overflowX,
          visibility: style.visibility,
        };
      })
      .filter((item) => item.overflow > 1 || item.internalOverflow > 1)
      .sort((a, b) => Math.max(b.overflow, b.internalOverflow) - Math.max(a.overflow, a.internalOverflow))
      .slice(0, 12);

    return {
      viewportWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      offenders,
    };
  });

  const message = `Горизонтальное переполнение: ${JSON.stringify(geometry, null, 2)}`;
  expect(geometry.documentWidth, message).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.bodyWidth, message).toBeLessThanOrEqual(geometry.viewportWidth + 1);
}

async function expectElementInsideViewport(locator, page) {
  const [box, viewport] = await Promise.all([
    locator.boundingBox(),
    page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
  ]);

  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function openDemoMap(page) {
  await page.goto('/');
  await page.locator('#demoButton').click();
  await expect(page.locator('#map')).toBeVisible({ timeout: 35_000 });
  await expect(page.locator('.deep-dive-button').first()).toBeVisible({ timeout: 10_000 });
}

test('текущий профиль устройства сохраняет целостность главной', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.locator('.birth-panel')).toBeVisible();
  await expectNoPageOverflow(page);

  const controls = page.locator('.birth-panel .field input, .birth-panel .primary-button');
  const sizes = await controls.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));

  expect(sizes.length).toBeGreaterThan(0);
  expect(sizes.every(({ width, height }) => width > 0 && height >= 44)).toBeTruthy();
});

for (const viewport of explicitViewports) {
  test(`расширенная матрица: ${viewport.name}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Полная размерная матрица запускается один раз в Chromium.');
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await expectNoPageOverflow(page);

    const topbar = page.locator('.topbar');
    const birthPanel = page.locator('.birth-panel');
    await expect(topbar).toBeVisible();
    await expect(birthPanel).toBeVisible();

    const topbarBox = await topbar.boundingBox();
    const panelBox = await birthPanel.boundingBox();
    expect(topbarBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(panelBox.width).toBeLessThanOrEqual(viewport.width + 1);
  });
}

test('полный разбор остаётся управляемым и не выходит за экран', async ({ page }, testInfo) => {
  await openDemoMap(page);
  await page.locator('.deep-dive-button').first().click();

  const backdrop = page.locator('#deepDiveModal');
  const modal = page.locator('.deep-dive-modal');
  const closeButton = page.locator('[data-close-deep]');
  const content = page.locator('#deepDiveContent');

  await expect(backdrop).toBeVisible();
  await expectElementInsideViewport(modal, page);
  await expectNoPageOverflow(page);

  const scrollState = await content.evaluate((element) => ({
    overflowY: getComputedStyle(element).overflowY,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(scrollState.overflowY).toBe('auto');
  expect(scrollState.clientHeight).toBeGreaterThan(0);
  expect(scrollState.scrollHeight).toBeGreaterThanOrEqual(scrollState.clientHeight);

  const closeBox = await closeButton.boundingBox();
  expect(closeBox).not.toBeNull();
  const minimumTarget = testInfo.project.use.isMobile ? 44 : 40;
  expect(closeBox.width).toBeGreaterThanOrEqual(minimumTarget);
  expect(closeBox.height).toBeGreaterThanOrEqual(minimumTarget);

  for (const tab of ['life', 'states', 'difference', 'practice']) {
    const button = page.locator(`[data-deep-tab="${tab}"]`);
    await button.click();
    await expect(button).toHaveAttribute('aria-selected', 'true');
    await expect(content).not.toBeEmpty();
    await expectNoPageOverflow(page);
  }

  await closeButton.click();
  await expect(backdrop).toBeHidden();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

test('полный разбор работает в горизонтальном телефоне', async ({ page }, testInfo) => {
  test.skip(!['android-chromium', 'iphone-webkit'].includes(testInfo.project.name), 'Горизонтальный режим проверяется на мобильных движках.');
  await page.setViewportSize({ width: 844, height: 390 });
  await openDemoMap(page);
  await page.locator('.deep-dive-button').first().click();

  const modal = page.locator('.deep-dive-modal');
  const content = page.locator('#deepDiveContent');
  await expectElementInsideViewport(modal, page);
  await expect(content).toBeVisible();

  const geometry = await content.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(geometry.clientHeight).toBeGreaterThan(40);
  expect(geometry.scrollHeight).toBeGreaterThanOrEqual(geometry.clientHeight);
  await expectNoPageOverflow(page);
});

test('чат карты помещается на телефоне и планшете', async ({ page }) => {
  await openDemoMap(page);

  const panel = page.locator('#consultPanel');
  await panel.evaluate((element) => {
    element.classList.add('open');
    element.setAttribute('aria-hidden', 'false');
  });
  await expect(panel).toHaveClass(/open/);
  await expectElementInsideViewport(panel, page);

  const textarea = panel.locator('textarea');
  const sendButton = panel.locator('button[type="submit"]');
  await expect(textarea).toBeVisible();
  await expect(sendButton).toBeVisible();

  const [textareaBox, sendBox] = await Promise.all([textarea.boundingBox(), sendButton.boundingBox()]);
  expect(textareaBox.height).toBeGreaterThanOrEqual(44);
  expect(sendBox.width).toBeGreaterThanOrEqual(43);
  expect(sendBox.height).toBeGreaterThanOrEqual(43);
  await expectNoPageOverflow(page);
});
