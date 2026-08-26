import { test, expect } from '@playwright/test';

test('стартовое сообщение освобождает историю после первого вопроса', async ({ page }) => {
  await page.goto('/clone/live/chat');

  await page.evaluate(() => {
    document.querySelector('#workspace')?.classList.remove('hidden');
    document.querySelector('#createView')?.classList.add('hidden');
    document.querySelector('#buildingView')?.classList.add('hidden');
    document.querySelector('#dialogView')?.classList.remove('hidden');
  });

  const starter = page.locator('[data-conversation-onboarding]');
  await expect(starter).toBeVisible();
  await expect(starter).toHaveAttribute('aria-hidden', 'false');

  await page.evaluate(() => {
    const messages = document.querySelector('#messages');
    const user = document.createElement('article');
    user.className = 'message user';
    user.innerHTML = '<div><b>Вы</b><p>Какие отношения мне подходят</p></div>';
    messages.append(user);

    const answer = document.createElement('article');
    answer.className = 'message clone';
    answer.dataset.testRealAnswer = '1';
    answer.innerHTML = '<span class="mini-avatar">✦</span><div><b>Звёздный клон</b><p>Тестовый ответ без изменения prompt pipeline.</p></div>';
    messages.append(answer);
  });

  await expect(starter).toBeHidden();
  await expect(starter).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('[data-test-real-answer="1"]')).toBeVisible();
  await expect(page.locator('#questionForm')).toBeVisible();
  await expect(page.locator('#conversationSuggestions')).toBeHidden();
});
