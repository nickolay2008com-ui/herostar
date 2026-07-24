# HeroStar: production в Railway

Зафиксировано: 20 июля 2026 года.

## Активная инфраструктура

- Railway service: `herostar`
- Статус на момент фиксации: `Online`
- Публичный адрес: `https://herostar.up.railway.app`
- Публичный порт Railway: `8080`
- Внутренний адрес сервиса: `herostar.railway.internal`
- База данных: Railway PostgreSQL service `Postgres`
- PostgreSQL status на момент фиксации: `Online`
- Persistent volume: `postgres-volume`
- Healthcheck приложения: `/health`
- Источник деплоя: GitHub, ветка `main`

## Production URL

```text
APP_URL=https://herostar.up.railway.app
```

Railway самостоятельно передаёт приложению переменную `PORT`. Не закреплять порт приложения вручную в production Variables, если Railway уже предоставляет его.

## Telegram Login

В BotFather для Telegram-бота нужно закрепить домен:

```text
herostar.up.railway.app
```

Callback приложения:

```text
https://herostar.up.railway.app/auth/telegram/callback
```

## YooKassa

Webhook для события `payment.succeeded`:

```text
https://herostar.up.railway.app/api/payments/webhook
```

## Railway Variables

Значения секретов хранятся только в Railway Variables и не коммитятся в GitHub:

```text
NODE_ENV=production
APP_URL=https://herostar.up.railway.app
SESSION_SECRET=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5-mini
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=...
LEGAL_FULL_NAME=...
LEGAL_OGRNIP=...
LEGAL_INN=...
LEGAL_ADDRESS=...
YOOKASSA_SHOP_ID=...
YOOKASSA_SECRET_KEY=...
FULL_MAP_PRICE=990.00
CLONE_DAY_PRICE=499
CLONE_ALIGNMENT_PRICE=1499
CLONE_ALIGNMENT_UPGRADE_PRICE=1000
PRACTICE_NOTIFICATIONS_ENABLED=true
PRACTICE_NOTIFICATION_HOURS=24
PRACTICE_FIRST_DELAY_MINUTES=30
DATABASE_URL=... # Railway подключает из Postgres service
DEMO_MODE=true
FREE_CARD_COUNT=3
```

## Production-gate оплаты

Перед включением кнопки оплаты сервер проверяет единый набор обязательных условий: HTTPS-адрес приложения, PostgreSQL, сильный `SESSION_SECRET`, Telegram-бот, ключи ЮKassa и опубликованные реквизиты исполнителя. Если хотя бы одного элемента нет, `/api/config` возвращает `paymentsConfigured: false`, а `/api/payments/create` отказывает до устранения причины.

После возврата из ЮKassa клиент проверяет конкретную операцию по одноразовому `payment_ref`; наличие старого доступа больше не считается подтверждением нового платежа.

## Контроль после изменения переменных

1. Деплой имеет статус `Success`.
2. `https://herostar.up.railway.app/health` возвращает успешный ответ.
3. `/api/config` показывает `paymentsConfigured: true`, но не раскрывает секретные значения и реквизиты целиком.
4. При временном удалении одного обязательного реквизита `/api/payments/create` возвращает `PAYMENTS_NOT_READY` и не создаёт заказ в ЮKassa.
5. Создаётся демонстрационная карта.
6. Telegram Login открывает callback на production-домене.
7. Тестовый платёж возвращается на production-домен и подтверждается по конкретным `payment_ref` и `paymentId`.
8. Повторный webhook не продлевает доступ второй раз.

## Монетизация Звёздного клона

Платные программы не продлеваются автоматически:

- `clone_day`: 24 часа глубокого диалога за 499 ₽; полная карта, персональный аватар и Паспорт клона остаются открытыми навсегда.
- `clone_alignment`: 30 дней глубокого диалога и ежедневной Сонастройки в Telegram за 1499 ₽.
- если `clone_alignment` приобретается в течение 24 часов после успешной покупки `clone_day`, система засчитывает 499 ₽ и выставляет 1000 ₽.

После изменения цен проверяются `/api/config`, создание обоих платежей в ЮKassa и идемпотентное применение webhook.
