# Пространства метрик HeroStar

Один счётчик Яндекс.Метрики может обслуживать оба продукта, но события и цели не должны смешиваться.

## Основной HeroStar — `/`

Внутренние события `/api/events` всегда содержат:

- `metadata.product = "herostar"`
- `metadata.action = "herostar_<eventType>"`

Цели Яндекс.Метрики основной карты сохраняют текущие имена, чтобы не ломать рекламные кампании:

- `landing_to_bot`
- `bot_started`
- `free_key_received`
- `bridge_received`
- `paywall_viewed`
- `payment_started`
- `purchase_success`

Эти цели разрешено отправлять только со страниц `/` и `/index.html`.

## Звёздный клон — `/clone/`

Внутренние события всегда содержат:

- `metadata.product = "clone"`
- `metadata.action = "clone_<действие>"`

Цели Яндекс.Метрики Клона имеют отдельный префикс:

- `clone_start`
- `clone_created`
- `clone_first_answer`
- `clone_third_answer`
- `clone_paywall`
- `clone_payment_start`
- `clone_payment_success`

Клон не должен отправлять `free_key_received`, `payment_started` или другие цели основной карты.

## Правило для новых функций

Каждая новая метрика получает продуктовый маркер и префикс до добавления в интерфейс:

- основная карта: `product=herostar`, `action=herostar_*`;
- Клон: `product=clone`, `action=clone_*`.

В отчётах и админке сначала фильтруем по `metadata.product`, а префикс `metadata.action` используем как дополнительную защиту и понятное имя шага.
