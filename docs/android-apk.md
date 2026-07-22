# Pinory для Android (APK)

Pinory упакован в нативную Android-оболочку Capacitor. В APK используется та же база, тот же профиль и те же места, что в Telegram Mini App. Вход выполняется через официальный Telegram OpenID Connect в системном браузере.

## 1. Один раз включить Telegram Login

1. Откройте `@BotFather` → ваш бот Pinory → **Bot Settings** → **Web Login**.
2. Добавьте разрешённый redirect URL:

   `https://pinory.onrender.com/api/v1/auth/telegram/oidc/callback`

3. Скопируйте выданные **Client ID** и **Client Secret**.
4. В Render откройте сервис Pinory → **Environment** и добавьте:

   ```env
   TELEGRAM_OIDC_CLIENT_ID=CLIENT_ID_ИЗ_BOTFATHER
   TELEGRAM_OIDC_CLIENT_SECRET=CLIENT_SECRET_ИЗ_BOTFATHER
   TELEGRAM_OIDC_REDIRECT_URL=https://pinory.onrender.com/api/v1/auth/telegram/oidc/callback
   MOBILE_APP_DEEP_LINK=pinory://auth
   MOBILE_APP_ORIGINS=https://localhost
   ```

5. Сохраните переменные и дождитесь нового успешного деплоя Render. Миграция `005_telegram_oidc_mobile.sql` выполнится автоматически при старте.

`TELEGRAM_OIDC_CLIENT_SECRET` нельзя добавлять в Android-проект, GitHub Actions или публичные файлы. Он должен храниться только в секретных переменных Render.

## 2. Бесплатно получить APK без Android Studio

1. Откройте репозиторий GitHub → вкладка **Actions**.
2. Слева выберите **Build Pinory Android APK**.
3. Нажмите **Run workflow** → **Run workflow**.
4. После зелёной галочки откройте завершённый запуск.
5. Внизу в **Artifacts** скачайте `Pinory-Android-APK`.
6. Распакуйте архив и установите `Pinory-1.0-alpha.apk` на Android. Телефон может один раз попросить разрешить установку из этого источника.

Сборка выполняется на сервере GitHub и не требует включённого компьютера. Для публичного репозитория этот сценарий доступен бесплатно.

## 3. Что уже настроено

- идентификатор Android-приложения: `app.pinory.mobile`;
- название и иконка: Pinory;
- Android 7.0 и новее;
- HTTPS без небезопасного HTTP-трафика;
- возврат из Telegram по ссылке `pinory://auth`;
- одноразовый код входа со сроком жизни 2 минуты;
- PKCE, `state`, `nonce` и серверная проверка подписи Telegram;
- сохранение и автоматическое обновление сессии;
- нативный запрос разрешения на геолокацию;
- светлая и тёмная системная тема.

## 4. Обновление APK

После изменений в Pinory снова запустите workflow **Build Pinory Android APK**. Отладочный ключ создаётся на сервере сборки, поэтому Android иногда потребует удалить предыдущую альфа-версию перед установкой новой. Пины и профиль не потеряются — они находятся на сервере, но потребуется снова войти через Telegram.

Текущий файл подписан стандартным отладочным ключом GitHub-сборки и подходит для прямой установки и альфа-тестирования. Для Google Play понадобится постоянный release-keystore и аккаунт Google Play; сама публикация в Google Play не бесплатна.
