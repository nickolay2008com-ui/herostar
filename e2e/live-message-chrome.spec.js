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
    const userBubble = document.querySelector('#messages .message.user > div');
    const paragraph = bubble?.querySelector('p');
    const messagesStyle = messages ? getComputedStyle(messages) : null;
    const messagesContentWidth = messages
      ? messages.clientWidth
        - parseFloat(messagesStyle?.paddingLeft || '0')
        - parseFloat(messagesStyle?.paddingRight || '0')
      : 0;
    const messagesRect = messages?.getBoundingClientRect();
    const bubbleRect = bubble?.getBoundingClientRect();
    const userRect = userBubble?.getBoundingClientRect();
    const contentLeft = (messagesRect?.left || 0) + parseFloat(messagesStyle?.paddingLeft || '0');
    const contentRight = (messagesRect?.right || 0) - parseFloat(messagesStyle?.paddingRight || '0');
    return {
      bubbleWidth: bubbleRect?.width || 0,
      bubbleLeft: bubbleRect?.left || 0,
      userWidth: userRect?.width || 0,
      userRight: userRect?.right || 0,
      contentLeft,
      contentRight,
      messagesContentWidth,
      paragraphMarginTop: paragraph ? parseFloat(getComputedStyle(paragraph).marginTop) : -1,
    };
  });

  expect(geometry.bubbleWidth).toBeGreaterThan(0);
  expect(geometry.bubbleWidth).toBeLessThanOrEqual((geometry.messagesContentWidth * .92) + 3);
  expect(geometry.bubbleLeft).toBeGreaterThanOrEqual(geometry.contentLeft - 2);
  expect(geometry.bubbleLeft).toBeLessThanOrEqual(geometry.contentLeft + 2);
  expect(geometry.userWidth).toBeGreaterThan(0);
  expect(geometry.userWidth).toBeLessThanOrEqual((geometry.messagesContentWidth * .84) + 3);
  expect(geometry.userRight).toBeGreaterThanOrEqual(geometry.contentRight - 2);
  expect(geometry.userRight).toBeLessThanOrEqual(geometry.contentRight + 2);
  expect(geometry.paragraphMarginTop).toBe(0);
});
