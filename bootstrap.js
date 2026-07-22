await import('./server.js');

const { startPracticeNotifications } = await import('./src/practice-notifications.js');
void startPracticeNotifications().catch((error) => {
  console.error('Не удалось запустить практические Telegram-уведомления:', error);
});
