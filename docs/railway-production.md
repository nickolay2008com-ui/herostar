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
YOOKASSA_SHOP_ID=...
YOOKASSA_SECRET_KEY=...
FULL_MAP_PRICE=990.00
DATABASE_URL=... # Railway подключает из Postgres service
DEMO_MODE=true
FREE_CARD_COUNT=3
```

## Контроль после изменения переменных

1. Деплой имеет статус `Success`.
2. `https://herostar.up.railway.app/health` возвращает успешный ответ.
3. Создаётся демонстрационная карта.
4. Telegram Login открывает callback на production-домене.
5. Тестовый платёж возвращается на production-домен и подтверждается webhook.
