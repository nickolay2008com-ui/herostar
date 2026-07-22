# Практические уведомления HeroStar

Механика связывает существующий Telegram Login Widget с уже открытыми карточками карты.

## Сценарий

1. Через 5 минут после открытия карты незарегистрированный пользователь видит мягкое предложение начать применять карту.
2. Telegram Login Widget запрашивает право бота отправлять сообщения (`request_access=write`).
3. После привязки карты пользователь получает приветственное сообщение.
4. Затем HeroStar отправляет одну небольшую практику по уже открытым карточкам. По умолчанию — не чаще одного раза в 24 часа.
5. Уведомления отключаются кнопкой под сообщением или командой `/stop`; включаются командой `/start`.

## Переменные Railway

Обязательные переменные уже используются проектом:

- `DATABASE_URL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`

Дополнительные настройки:

- `PRACTICE_NOTIFICATIONS_ENABLED=true`
- `PRACTICE_NOTIFICATION_HOURS=24`
- `PRACTICE_FIRST_DELAY_MINUTES=15`
- `PRACTICE_CYCLE_INTERVAL_MS=60000`
- `PRACTICE_BATCH_SIZE=20`
- `APP_BASE_URL=https://your-domain.example` — необязательно, если Railway передаёт `RAILWAY_PUBLIC_DOMAIN`.

Таблицы `practice_subscriptions` и `practice_runtime` создаются автоматически и не изменяют существующие таблицы карты, пользователей или оплат.
