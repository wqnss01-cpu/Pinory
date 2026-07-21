# Pinory

Telegram Mini App, в котором места превращаются в личный живой атлас: посещённое, желания, воспоминания друзей и авторские подборки.

## Бесплатный production-деплой

Проект готов к внешнему запуску одним Docker-сервисом: Mini App, API и Telegram webhook работают на одном HTTPS-домене. Рекомендуемая бесплатная схема:

- Northflank Sandbox — постоянно работающий Docker-контейнер приложения;
- Neon Free — PostgreSQL + PostGIS;
- Supabase Storage Free — фотографии, без обязательной привязки карты;
- GitHub — автоматические деплои после `git push`.

Полная инструкция для запуска через BotFather: [docs/deploy-free.md](./docs/deploy-free.md).

Production-контейнер автоматически применяет миграции, заполняет только справочники, отдаёт собранный Mini App, регистрирует webhook Telegram и настраивает кнопку меню бота. Healthcheck: `/health`.

## Локальный запуск

1. Установите Node.js 22+ и Docker Desktop.
2. Скопируйте `.env.example` в `.env`.
3. Выполните `npm install`.
4. Запустите инфраструктуру: `docker compose up -d`.
5. Примените схему и заполните только справочники категорий: `npm run db:migrate && npm run db:seed`.
6. Запустите приложение: `npm run dev`.
7. Откройте Mini App из Telegram. Для локальной проверки вне Telegram явно задайте `ALLOW_DEV_TELEGRAM=true` и собственный `DEV_TELEGRAM_USER_ID`.

API и Swagger в development доступны на `http://localhost:4000/docs`, healthcheck — на `http://localhost:4000/health`.

## Telegram

Для реального запуска нужны `TELEGRAM_BOT_TOKEN`, публичный HTTPS-домен и `TELEGRAM_WEBHOOK_SECRET`. На Northflank адреса приложения, API и CORS автоматически формируются из `NF_HOSTS`. Локальный вход по умолчанию выключен. Backend проверяет подпись и возраст `Telegram.WebApp.initData`, после чего выдаёт собственную короткую сессию.

## Команды

- `npm run dev` — API + Mini App;
- `npm run dev:all` — API + Mini App + локальный long-polling бот;
- `npm run build` — production-сборка;
- `npm test` — тесты;
- `npm run lint` — статическая проверка;
- `npm run db:migrate` — миграции;
- `npm run db:seed` — только категории и стили меток; пользователей и контент команда не создаёт;
- `CONFIRM_CLEAR_LOCAL_DATA=YES npm run db:clear-content` — очищает локальный пользовательский контент (в production заблокировано);
- `docker build -t pinory .` — production Docker-образ.

Архитектура, ER-модель, API, экраны и план миграций находятся в [`docs`](./docs). Известные компромиссы записываются в [`TECH_DEBT.md`](./TECH_DEBT.md).
