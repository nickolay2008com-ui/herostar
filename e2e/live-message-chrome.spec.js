import { test, expect } from '@playwright/test';

const MOBILE_PROJECTS = new Set(['android-chromium', 'iphone-webkit', 'tablet-webkit']);

test('mobile Live скрывает повторный chrome Клона, сохраняя текст ответа без изменений', async ({ page }, testInfo) => {
  test.skip(!MOBILE_PROJECTS.has(testInfo.project.name), 'Мобильный контракт message chrome');

  await page.goto('/clone/live/chat');
  await expect(page.locator('body')).toHaveClass(/live-app-ready/);

  const answer = 'Точный тестовый ответ: строка 1.\nСтрока 2 — без изменений <и без преобразования>.';

  await page.evaluate((text) => {
    document.querySelector('#workspace')?.classList.remove('hidden');
    document.querySelector('#createView')?.classList.add('hidden');
    document.querySelector('#buildingView')?.classList.add('hidden');
    document.querySelector('#dialogView')?.classList.remove('hidden');

    const conversation = document.querySelector('#dialogView .conversation');
    const messages = document.querySelector('#messages');
    conversation?.classList.add('conversation-started');
    if (!messages) return;

    messages.replaceChildren();

    const user = document.createElement('article');
    user.className = 'message user';
    user.innerHTML = '<div><b>Вы</b><p>Тестовый вопрос</p></div>';

    const clone = document.createElement('article');
    clone.className = 'message clone';
    clone.innerHTML = '<span class="mini-avatar">✦</span><div><b>Звёздный клон</b><p></p></div>';
    clone.querySelector('p').textContent = text;

    messages.append(user, clone);
  }, answer);

  const cloneMessage = page.locator('#messages .message.clone');
  const paragraph = cloneMessage.locator('p').first();
  const avatar = cloneMessage.locator('.mini-avatar');
  const label = cloneMessage.locator(':scope > div > b');

  await expect(cloneMessage).toBeVisible();
  await expect(paragraph).toHaveText(answer, { useInnerText: false });
  await expect(avatar).toBeHidden();
  await expect(label).toBeHidden();

  const geometry = await page.evaluate(() => {
    const messages = document.querySelector('#messages');
    const bubble = document.querySelector('#messages .message.clone > div');
    const paragraph = bubble?.querySelector('p');
    return {
      bubbleWidth: bubble?.getBoundingClientRect().width || 0,
      messagesWidth: messages?.getBoundingClientRect().width || 0,
      paragraphMarginTop: paragraph ? parseFloat(getComputedStyle(paragraph).marginTop) : -1,
    };
  });

  expect(geometry.bubbleWidth).toBeGreaterThan(0);
  expect(geometry.bubbleWidth).toBeGreaterThanOrEqual(geometry.messagesWidth - 2);
  expect(geometry.paragraphMarginTop).toBe(0);
});
