import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'compact', width: 320, height: 568 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'wide-legacy-android', width: 960, height: 1536 },
];

for (const viewport of viewports) {
  test(`главная не переполняется на ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');

    const layout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));

    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);

    const topbar = await page.locator('.topbar').boundingBox();
    expect(topbar).not.toBeNull();
    expect(topbar.width).toBeLessThanOrEqual(viewport.width);
  });
}

test('на телефоне форма идёт раньше вторичного контента', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const panel = await page.locator('.birth-panel').boundingBox();
  const supporting = await page.locator('.hero-supporting').boundingBox();

  expect(panel).not.toBeNull();
  expect(supporting).not.toBeNull();
  expect(panel.y).toBeLessThan(supporting.y);

  const touchTargets = await page.locator('.birth-panel .field input, .birth-panel .primary-button').evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().height),
  );
  expect(touchTargets.every((height) => height >= 44)).toBeTruthy();
});

test('широкий Android viewport не получает двухколоночный desktop hero', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 1536 });
  await page.goto('/');

  const layout = await page.evaluate(() => {
    const hero = document.querySelector('.hero');
    const copy = document.querySelector('.hero-copy');
    const panel = document.querySelector('.birth-panel');
    const supporting = document.querySelector('.hero-supporting');
    const heroRect = hero.getBoundingClientRect();
    const copyRect = copy.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const supportingRect = supporting.getBoundingClientRect();

    return {
      columns: getComputedStyle(hero).gridTemplateColumns,
      heroWidth: heroRect.width,
      copyWidth: copyRect.width,
      copyBottom: copyRect.bottom,
      panelTop: panelRect.top,
      panelBottom: panelRect.bottom,
      panelWidth: panelRect.width,
      supportingTop: supportingRect.top,
    };
  });

  expect(layout.columns.trim().split(/\s+/)).toHaveLength(1);
  expect(layout.copyWidth).toBeGreaterThan(layout.heroWidth * 0.9);
  expect(layout.panelTop).toBeGreaterThanOrEqual(layout.copyBottom - 1);
  expect(layout.supportingTop).toBeGreaterThanOrEqual(layout.panelBottom - 1);
  expect(layout.panelWidth).toBeLessThanOrEqual(620);
});

test('мобильная оплата открывается как прокручиваемая нижняя панель', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#payModal').evaluate((element) => element.classList.remove('hidden'));

  const modal = page.locator('#payModal .modal');
  await expect(modal).toBeVisible();

  const geometry = await modal.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      overflowY: style.overflowY,
    };
  });

  expect(geometry.left).toBe(0);
  expect(geometry.right).toBe(geometry.viewportWidth);
  expect(geometry.bottom).toBe(geometry.viewportHeight);
  expect(geometry.overflowY).toBe('auto');
});
