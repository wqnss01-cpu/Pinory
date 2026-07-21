# Бесплатный запуск Pinory как Telegram Mini App

Этот вариант не использует домашний компьютер. Один контейнер на Koyeb отдаёт сайт Pinory, API и принимает Telegram webhook. База хранится в Neon, фотографии — в Cloudflare R2.

## Схема

```text
Telegram → https://<ваш-сервис>.koyeb.app
                         ├─ Mini App
                         ├─ /api/v1
                         └─ /api/v1/telegram/webhook
                                  ├─ Neon PostgreSQL + PostGIS
                                  └─ Cloudflare R2
```

Контейнер при каждом деплое сам применяет новые миграции, заполняет только справочники категорий и настраивает webhook, команды и кнопку меню Telegram.

## Что потребуется

- аккаунт GitHub;
- аккаунт [Koyeb](https://www.koyeb.com/);
- аккаунт [Neon](https://neon.com/);
- аккаунт [Cloudflare](https://dash.cloudflare.com/);
- Telegram и бот, созданный через [@BotFather](https://t.me/BotFather).

Не покупайте домен на старте: адрес `*.koyeb.app` уже публичный, бесплатный и работает по HTTPS.

## 1. Поместить проект в GitHub

Создайте пустой приватный репозиторий `pinory` без README. В папке проекта выполните:

```powershell
git init
git add .
git commit -m "Prepare Pinory for production"
git branch -M main
git remote add origin https://github.com/YOUR_LOGIN/pinory.git
git push -u origin main
```

Файлы `.env` не отправляются в GitHub. Никогда не добавляйте токен Telegram, пароль базы или ключи R2 в код и коммиты.

## 2. Создать Telegram-бота

1. Откройте `@BotFather` и отправьте `/newbot`.
2. Название: `Pinory`.
3. Username должен заканчиваться на `bot`, например `pinory_map_bot`.
4. Сохраните полученный токен. Он понадобится только как секрет `TELEGRAM_BOT_TOKEN` в Koyeb.
5. Пока не настраивайте URL Mini App — он появится после первого деплоя.

Если токен случайно попал в скриншот, сообщение или GitHub, сразу выполните `/revoke` в BotFather и получите новый.

## 3. Создать PostGIS-базу в Neon

1. В Neon создайте проект `pinory`, регион выбирайте ближе к Koyeb Frankfurt.
2. Откройте **Connect** и скопируйте pooled connection string.
3. Убедитесь, что строка заканчивается параметром `sslmode=require`.
4. Сохраните её как секрет `DATABASE_URL`.

Расширения `postgis`, `pgcrypto` и `pg_trgm` создаются миграцией Pinory автоматически. Отдельно выполнять SQL не нужно.

## 4. Создать хранилище фотографий в Cloudflare R2

1. В Cloudflare откройте **Storage & databases → R2**.
2. Создайте bucket `pinory-media` со Standard storage class.
3. В настройках bucket включите **Public Development URL** или подключите свой публичный домен.
4. Скопируйте публичный адрес вида `https://pub-....r2.dev` — это `S3_PUBLIC_URL`.
5. Откройте **Manage R2 API Tokens** и создайте токен с правами **Object Read & Write**, ограниченный bucket `pinory-media`.
6. Сохраните Access Key ID и Secret Access Key. Secret показывается один раз.
7. Скопируйте Account ID. Endpoint получится таким:

```text
https://ACCOUNT_ID.r2.cloudflarestorage.com
```

В production bucket создаётся вручную, поэтому для R2 обязательно используются:

```text
S3_AUTO_CREATE_BUCKET=false
S3_SET_PUBLIC_POLICY=false
```

## 5. Создать секреты

В PowerShell выполните два раза:

```powershell
(New-Guid).Guid.Replace('-', '') + (New-Guid).Guid.Replace('-', '')
```

Первое значение используйте как `JWT_SECRET`, второе — как `TELEGRAM_WEBHOOK_SECRET`. Не используйте значения из файлов-примеров.

## 6. Развернуть Koyeb

1. В Koyeb выберите **Create Web Service → GitHub**.
2. Подключите репозиторий `pinory`, ветка `main`.
3. Builder: **Dockerfile**. Путь: `Dockerfile`.
4. Service type: **Web Service**.
5. Instance: обязательно **Free**, регион Frankfurt.
6. Exposed port: `4000`, protocol HTTP, route `/`.
7. Health check: HTTP, path `/health`, port `4000`.
8. Добавьте переменные окружения из таблицы ниже. Значения с пометкой «секрет» храните как Koyeb Secret.

| Переменная | Значение |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | pooled connection string Neon, секрет |
| `DATABASE_SSL` | `true` |
| `DB_POOL_MAX` | `5` |
| `JWT_SECRET` | первый случайный секрет |
| `TELEGRAM_BOT_TOKEN` | токен BotFather, секрет |
| `TELEGRAM_WEBHOOK_SECRET` | второй случайный секрет |
| `ALLOW_DEV_TELEGRAM` | `false` |
| `GEOCODING_USER_AGENT` | `Pinory/1.0 (ваш-настоящий-email)` |
| `S3_ENDPOINT` | `https://ACCOUNT_ID.r2.cloudflarestorage.com` |
| `S3_REGION` | `auto` |
| `S3_ACCESS_KEY` | Access Key ID R2, секрет |
| `S3_SECRET_KEY` | Secret Access Key R2, секрет |
| `S3_BUCKET` | `pinory-media` |
| `S3_PUBLIC_URL` | публичный URL bucket без `/` в конце |
| `S3_FORCE_PATH_STYLE` | `true` |
| `S3_AUTO_CREATE_BUCKET` | `false` |
| `S3_SET_PUBLIC_POLICY` | `false` |
| `ENABLE_API_DOCS` | `false` |

Koyeb автоматически передаёт контейнеру `PORT` и `KOYEB_PUBLIC_DOMAIN`. Pinory сам получает из домена адрес Mini App, API, CORS и webhook. Переменные `PUBLIC_API_URL`, `TELEGRAM_MINI_APP_URL` и `CORS_ORIGINS` нужны только при собственном домене или другом хостинге.

Нажмите **Deploy**. Первый build может занять несколько минут. Успешный лог заканчивается сообщениями о миграциях, запуске сервера и настройке Telegram webhook.

## 7. Проверить деплой

Откройте:

```text
https://YOUR-SERVICE.koyeb.app/health
```

Ожидаемый ответ содержит `"status":"ok"`. Затем откройте корень домена — должна загрузиться стартовая страница Pinory.

Если healthcheck не проходит, сначала проверьте `DATABASE_URL`, `DATABASE_SSL=true` и логи Koyeb. Если сайт работает, но фотографии не загружаются, проверьте публичность R2 bucket и все пять `S3_*` значений.

## 8. Привязать Mini App в BotFather

1. Откройте `@BotFather` → `/mybots` → ваш бот.
2. В **Bot Settings** настройте **Menu Button** или выполните `/setmenubutton`.
3. Текст кнопки: `Открыть Pinory`.
4. URL: полный адрес `https://YOUR-SERVICE.koyeb.app`.
5. В разделе **Configure Mini App / Main Mini App** создайте основное приложение Pinory с тем же URL. Если BotFather просит short name, используйте `pinory` или свободный похожий вариант.
6. Добавьте аватар, описание и короткий ролик/скриншоты в профиле бота.

Сервер Pinory также автоматически устанавливает menu button и команды через Bot API. Ручная настройка Main Mini App нужна, чтобы в профиле бота появилась большая кнопка запуска и ссылка вида `t.me/your_bot/short_name`.

Теперь отправьте боту `/start`, нажмите **Открыть Pinory** и проверьте:

- вход без ошибки авторизации;
- определение геопозиции после разрешения;
- создание места и загрузку фотографии;
- создание подборки;
- открытие приложения после полного закрытия Telegram.

## Обновления

После изменений достаточно:

```powershell
git add .
git commit -m "Update Pinory"
git push
```

Koyeb автоматически соберёт новый Docker-образ. Миграции выполняются перед стартом API и повторно не применяются.

## Бесплатные лимиты и честные ограничения

- Koyeb Free — один web service, 512 MB RAM и 0.1 vCPU. После часа без трафика сервис засыпает, поэтому первое открытие может занять несколько секунд. Для первых пользователей этого достаточно; следующий разумный шаг — Eco Nano примерно за несколько долларов в месяц.
- Neon Free — 0.5 GB данных и 100 CU-hours в месяц на проект, база засыпает при простое.
- Cloudflare R2 — бесплатный месячный объём включает 10 GB хранения, 1 млн операций записи и 10 млн чтений; исходящий трафик R2 бесплатный. Cloudflare может попросить платёжный метод для активации R2.
- Стандартные тайлы OpenStreetMap и публичный Nominatim не имеют SLA. Pinory показывает атрибуцию, кеширует поиск адресов и ограничивает Nominatim одним запросом в секунду. При заметном росте аудитории замените их на коммерческого OSM-провайдера через `VITE_MAP_TILE_URL` и `GEOCODING_URL`.

Не выбирайте в Koyeb платный `nano`: бесплатный тип называется именно `free`. Следите за Usage/Billing во всех сервисах и не включайте автоматическое платное масштабирование.

## Перенос на собственный домен

После подключения домена к Koyeb задайте явно:

```text
TELEGRAM_MINI_APP_URL=https://app.example.com
PUBLIC_API_URL=https://app.example.com/api/v1
CORS_ORIGINS=https://app.example.com
```

После redeploy сервер сам переставит webhook. Затем замените URL в BotFather.
