# Бесплатный деплой Pinory на Render

Этот вариант не требует домашнего компьютера и позволяет запустить Pinory на бесплатном Web Service без добавления платёжной карты. Приложение, API и Telegram webhook работают в одном Docker-контейнере на HTTPS-домене `*.onrender.com`.

## Схема

```text
Telegram → https://pinory.onrender.com
                         ├─ Mini App
                         ├─ /api/v1
                         └─ /api/v1/telegram/webhook
                                  ├─ Neon PostgreSQL + PostGIS
                                  └─ Supabase Storage
```

Render автоматически передаёт приложению адрес через `RENDER_EXTERNAL_URL`. Pinory использует его для API, CORS, Telegram webhook и кнопки меню бота.

## 1. Подготовить внешние сервисы

Перед деплоем должны быть готовы:

- репозиторий Pinory в GitHub, ветка `main`;
- pooled connection string из Neon с `sslmode=require`;
- Telegram-бот и его токен от BotFather;
- публичный bucket `pinory-media` в Supabase Storage;
- S3 Endpoint, Region, Access Key ID и Secret Access Key из Supabase;
- два случайных секрета длиной не менее 32 символов для JWT и Telegram webhook.

Создать секрет в PowerShell можно командой:

```powershell
(New-Guid).Guid.Replace('-', '') + (New-Guid).Guid.Replace('-', '')
```

Выполните её два раза. Не публикуйте токены, пароль базы и S3-ключи в GitHub.

## 2. Создать сервис Render

1. Откройте [Render Dashboard](https://dashboard.render.com/) и войдите через GitHub.
2. Нажмите **New → Blueprint**.
3. Подключите репозиторий `wqnss01-cpu/Pinory` и ветку `main`.
4. Render найдёт файл `render.yaml` и предложит создать сервис `pinory`.
5. Проверьте, что выбран тип **Web Service**, runtime **Docker**, instance type **Free**.
6. Заполните секретные переменные из следующего раздела.

Если Blueprint не видит репозиторий, разрешите Render GitHub App доступ к `Pinory`. Для публичного репозитория можно вместо GitHub-интеграции выбрать **New → Web Service → Public Git Repository** и вставить URL репозитория.

## 3. Заполнить переменные

Постоянные безопасные значения уже находятся в `render.yaml`. В форме Blueprint нужно заполнить поля со значением **sync: false**:

| Переменная | Значение |
|---|---|
| `DATABASE_URL` | pooled connection string Neon |
| `JWT_SECRET` | первый случайный секрет |
| `TELEGRAM_BOT_TOKEN` | токен BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | второй случайный секрет |
| `GEOCODING_USER_AGENT` | `Pinory/1.0 (ваш-настоящий-email)` |
| `S3_ENDPOINT` | Endpoint из Supabase Storage → S3 |
| `S3_REGION` | Region со страницы Supabase S3 |
| `S3_ACCESS_KEY` | Access Key ID Supabase S3 |
| `S3_SECRET_KEY` | Secret Access Key Supabase S3 |
| `S3_PUBLIC_URL` | `https://PROJECT_REF.supabase.co/storage/v1/object/public/pinory-media` |

Не используйте Supabase Publishable Key вместо S3-ключей: это разные типы доступа.

Для текущего Supabase-проекта Pinory публичный адрес имеет вид:

```text
https://btuulqrgnkmajysmroww.supabase.co/storage/v1/object/public/pinory-media
```

## 4. Запустить деплой

Нажмите **Apply** или **Create Web Service**. Render соберёт корневой `Dockerfile`. При старте контейнер:

1. применит миграции Neon;
2. заполнит справочники категорий без mock-пользователей;
3. запустит API и Mini App;
4. установит Telegram webhook и кнопку меню.

Первый build может занять несколько минут. Успешный healthcheck доступен по адресу:

```text
https://ВАШ-СЕРВИС.onrender.com/health
```

Ответ должен содержать `"status":"ok"`. Корень того же домена должен открыть Pinory.

## 5. Подключить Mini App в BotFather

1. Откройте `@BotFather → /mybots → ваш бот`.
2. В **Bot Settings → Menu Button** задайте текст `Открыть Pinory`.
3. Вставьте точный HTTPS-адрес Render, например `https://pinory.onrender.com`.
4. В **Configure Mini App / Main Mini App** используйте тот же URL.
5. Отправьте боту `/start` и откройте Pinory через кнопку.

## Обновления

После изменений достаточно выполнить:

```powershell
git add .
git commit -m "Update Pinory"
git push
```

Render автоматически соберёт и развернёт новую версию.

## Ограничения бесплатного Render

- Free Web Service засыпает после 15 минут без входящих запросов. Первый запуск после паузы может занять около минуты.
- На workspace доступно 750 бесплатных instance-hours в месяц.
- При превышении бесплатных лимитов без привязанной карты Render приостанавливает сервис, а не списывает деньги.
- Локальный диск временный, поэтому база хранится в Neon, а фотографии — в Supabase.

Для тестирования и первого запуска это полностью бесплатный вариант. Для постоянно мгновенного открытия без холодного старта впоследствии понадобится платный сервер или другой оплачиваемый тариф.
