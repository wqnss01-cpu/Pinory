# Бесплатный запуск Pinory как Telegram Mini App

Этот вариант не использует домашний компьютер и не требует платёжной карты. Один постоянно работающий Docker-контейнер в Northflank Sandbox отдаёт Mini App, API и принимает Telegram webhook. База хранится в Neon, фотографии — в Supabase Storage.

## Схема

~~~text
Telegram → https://<публичный-порт>.code.run
                              ├─ Mini App
                              ├─ /api/v1
                              └─ /api/v1/telegram/webhook
                                       ├─ Neon PostgreSQL + PostGIS
                                       └─ Supabase Storage
~~~

Northflank автоматически передаёт контейнеру публичный домен через `NF_HOSTS`. Pinory использует его для Mini App, API, CORS, Telegram webhook и кнопки меню бота. При каждом деплое контейнер применяет новые миграции и заполняет только справочники категорий — тестовые пользователи и контент не создаются.

## Что потребуется

- аккаунт GitHub;
- аккаунт [Northflank](https://northflank.com/);
- аккаунт [Neon](https://neon.com/);
- аккаунт [Supabase](https://supabase.com/);
- Telegram и бот, созданный через [@BotFather](https://t.me/BotFather).

Для старта не нужен собственный домен: Northflank выдаёт публичный `*.code.run` с HTTPS. Выбирайте именно бесплатный план **Sandbox**, а не Pay-as-you-go.

## 1. Поместить проект в GitHub

Создайте пустой приватный репозиторий `pinory` без README. В папке проекта выполните:

~~~powershell
git init
git add .
git commit -m "Prepare Pinory for production"
git branch -M main
git remote add origin https://github.com/YOUR_LOGIN/pinory.git
git push -u origin main
~~~

Файлы `.env` не отправляются в GitHub. Никогда не добавляйте токен Telegram, пароль базы или ключи Supabase Storage в код и коммиты.

## 2. Создать Telegram-бота

1. Откройте `@BotFather` и отправьте `/newbot`.
2. Название: `Pinory`.
3. Username должен заканчиваться на `bot`, например `pinory_map_bot`.
4. Сохраните токен как секрет `TELEGRAM_BOT_TOKEN` для Northflank.
5. Пока не настраивайте URL Mini App — он появится после первого успешного деплоя.

Если токен случайно попал в скриншот, сообщение или GitHub, сразу выполните `/revoke` в BotFather и получите новый.

## 3. Создать PostGIS-базу в Neon

1. В Neon создайте проект `pinory`. Регион выбирайте ближе к региону Northflank, в котором будете создавать проект.
2. Откройте **Connect** и скопируйте pooled connection string.
3. Убедитесь, что строка содержит параметр `sslmode=require`.
4. Сохраните всю строку как секрет `DATABASE_URL`.

Расширения `postgis`, `pgcrypto` и `pg_trgm` создаются миграцией Pinory автоматически. Отдельно выполнять SQL не нужно.

## 4. Создать хранилище фотографий в Supabase Storage

1. В Supabase создайте проект на плане **Free**.
2. Откройте **Storage → New bucket**, назовите bucket `pinory-media` и включите **Public bucket**.
3. Откройте **Storage → Configuration → S3**, включите S3 protocol и создайте пару **Access Key ID / Secret Access Key**. Secret показывается один раз.
4. На этой же странице скопируйте точные значения **Endpoint** и **Region**. Endpoint имеет вид:

~~~text
https://PROJECT_REF.storage.supabase.co/storage/v1/s3
~~~

5. Публичный адрес bucket сформируйте так:

~~~text
https://PROJECT_REF.supabase.co/storage/v1/object/public/pinory-media
~~~

Pinory загружает фотографии только с backend-сервера, поэтому S3-ключи не попадают в Mini App. Bucket создаётся и делается публичным вручную, поэтому используются:

~~~text
S3_AUTO_CREATE_BUCKET=false
S3_SET_PUBLIC_POLICY=false
~~~

## 5. Создать секреты Pinory

В PowerShell выполните команду два раза:

~~~powershell
(New-Guid).Guid.Replace('-', '') + (New-Guid).Guid.Replace('-', '')
~~~

Первое значение используйте как `JWT_SECRET`, второе — как `TELEGRAM_WEBHOOK_SECRET`. Не используйте значения из файлов-примеров.

## 6. Развернуть Northflank

### Создать проект и сервис

1. В Northflank создайте проект `pinory`. Выберите регион, близкий к региону Neon.
2. Нажмите **Create new → Service** и выберите **Combined service**.
3. Название сервиса: `pinory`.
4. Подключите GitHub, выберите репозиторий `pinory` и ветку `main`.
5. В **Build options** выберите **Dockerfile**:
   - Dockerfile path: `/Dockerfile`;
   - build context / work directory: `/`.
6. В **Resources** выберите бесплатный вариант Sandbox и один контейнер. Не включайте платное масштабирование.

### Настроить публичный порт

В разделе **Networking / Ports** добавьте:

| Настройка | Значение |
|---|---|
| Name | `web` |
| Internal port | `4000` |
| Protocol | `HTTP` |
| Public | включено |

Northflank создаст HTTPS-адрес примерно такого вида:

~~~text
https://web--pinory--pinory--YOUR_ACCOUNT.code.run
~~~

Точный адрес копируйте из **Ports & DNS**. Вручную добавлять `NF_HOSTS` не нужно — Northflank передаёт его контейнеру автоматически.

### Настроить healthcheck

Добавьте readiness/HTTP healthcheck:

| Настройка | Значение |
|---|---|
| Port | `4000` |
| Path | `/health` |
| Initial delay | `30` секунд |
| Timeout | `5` секунд |
| Failure threshold | `3` |

### Добавить переменные окружения

В **Environment / Runtime variables** добавьте значения ниже. Пароли и ключи сохраняйте как секретные значения.

| Переменная | Значение |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `DATABASE_URL` | pooled connection string Neon, секрет |
| `DATABASE_SSL` | `true` |
| `DB_POOL_MAX` | `5` |
| `JWT_SECRET` | первый случайный секрет |
| `SESSION_TTL_MINUTES` | `30` |
| `TELEGRAM_BOT_TOKEN` | токен BotFather, секрет |
| `TELEGRAM_WEBHOOK_SECRET` | второй случайный секрет |
| `ALLOW_DEV_TELEGRAM` | `false` |
| `GEOCODING_URL` | `https://nominatim.openstreetmap.org/search` |
| `GEOCODING_USER_AGENT` | `Pinory/1.0 (ваш-настоящий-email)` |
| `S3_ENDPOINT` | Endpoint из Supabase Storage → Configuration → S3 |
| `S3_REGION` | Region с той же страницы Supabase |
| `S3_ACCESS_KEY` | Access Key ID Supabase S3, секрет |
| `S3_SECRET_KEY` | Secret Access Key Supabase S3, секрет |
| `S3_BUCKET` | `pinory-media` |
| `S3_PUBLIC_URL` | `https://PROJECT_REF.supabase.co/storage/v1/object/public/pinory-media` |
| `S3_FORCE_PATH_STYLE` | `true` |
| `S3_AUTO_CREATE_BUCKET` | `false` |
| `S3_SET_PUBLIC_POLICY` | `false` |
| `ADMIN_TELEGRAM_IDS` | ваш числовой Telegram ID, необязательно |
| `ENABLE_API_DOCS` | `false` |

На Northflank не добавляйте `PUBLIC_API_URL`, `TELEGRAM_MINI_APP_URL` и `CORS_ORIGINS`: Pinory автоматически формирует их из `NF_HOSTS`. Они нужны только для другого хостинга или собственного домена.

Сохраните сервис и запустите deployment. Первый build может занять несколько минут. В успешных логах последовательно появятся миграции, заполнение справочников, запуск API и настройка Telegram webhook.

## 7. Проверить деплой

Скопируйте домен из **Ports & DNS** и откройте:

~~~text
https://ВАШ-ДОМЕН.code.run/health
~~~

Ожидаемый ответ содержит `"status":"ok"`. Затем откройте корень домена — должна загрузиться стартовая страница Pinory.

Если контейнер не запускается:

1. Откройте **Logs** и найдите первое сообщение об ошибке.
2. Проверьте `DATABASE_URL` и `DATABASE_SSL=true`.
3. Убедитесь, что порт `4000` опубликован и `NF_HOSTS` присутствует в runtime environment.
4. Если не загружаются фотографии, проверьте публичность bucket, включённый S3 protocol и все `S3_*` значения.
5. Если появляется ошибка нехватки памяти, убедитесь, что выбран максимальный доступный бесплатный Sandbox-план и запущен только один контейнер.

## 8. Привязать Mini App в BotFather

1. Откройте `@BotFather` → `/mybots` → ваш бот.
2. В **Bot Settings** настройте **Menu Button** или выполните `/setmenubutton`.
3. Текст кнопки: `Открыть Pinory`.
4. URL: точный адрес из Northflank **Ports & DNS**, например `https://web--pinory--pinory--YOUR_ACCOUNT.code.run`.
5. В **Configure Mini App / Main Mini App** создайте основное приложение Pinory с тем же URL.
6. Если BotFather просит short name, используйте `pinory` или свободный похожий вариант.
7. Добавьте аватар, описание и скриншоты в профиль бота.

Сервер Pinory также автоматически устанавливает menu button и команды через Bot API. Ручная настройка Main Mini App нужна, чтобы в профиле бота появилась большая кнопка запуска и ссылка вида `t.me/your_bot/short_name`.

Отправьте боту `/start`, нажмите **Открыть Pinory** и проверьте:

- вход без ошибки авторизации;
- определение геопозиции после разрешения;
- создание, редактирование и удаление места;
- загрузку и перелистывание нескольких фотографий;
- создание подборки и загрузку обложки;
- подписку на пользователя и подборку;
- повторное открытие после полного закрытия Telegram.

## Обновления

После изменений достаточно:

~~~powershell
git add .
git commit -m "Update Pinory"
git push
~~~

Combined service автоматически соберёт и развернёт новый Docker-образ. Миграции выполняются перед стартом API и повторно не применяются.

## Бесплатные лимиты и ограничения

- **Northflank Sandbox** — два бесплатных постоянно работающих сервиса, одна бесплатная база и два cron job. Для Pinory нужен один сервис; база остаётся в Neon. Sandbox предназначен для небольших проектов и не имеет SLA.
- **Neon Free** — база при простое может переходить в неактивное состояние, поэтому первый запрос иногда выполняется дольше.
- **Supabase Free** — 1 GB файлов, 5 GB обычного и 5 GB кешированного исходящего трафика; максимальный размер файла 50 MB. Неактивный Free-проект может быть приостановлен после недели без активности. Pinory ограничивает исходные фотографии 15 MB.
- Стандартные тайлы OpenStreetMap и публичный Nominatim не имеют SLA. Pinory показывает атрибуцию, кеширует поиск адресов и ограничивает Nominatim одним запросом в секунду. При росте аудитории замените их через `VITE_MAP_TILE_URL` и `GEOCODING_URL`.

Если Northflank показывает цену, вернитесь в **Resources** и выберите Sandbox/free compute. Не добавляйте карту и не переключайтесь на Pay-as-you-go для этого варианта запуска.

## Перенос на собственный домен

После подключения домена к публичному порту Northflank явно задайте:

~~~text
TELEGRAM_MINI_APP_URL=https://app.example.com
PUBLIC_API_URL=https://app.example.com/api/v1
CORS_ORIGINS=https://app.example.com
~~~

Сохраните переменные и выполните redeploy. Сервер сам переставит webhook и кнопку меню; затем замените URL Main Mini App в BotFather.
