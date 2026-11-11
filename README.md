# hakRos

Приложение для поиска мест и событий для направления «Город после пар». Интерфейс на Expo и React Native получает данные через API Express. База SQLite создаётся при первом запуске и заполняется демонстрационными местами и историями.

## Локальный запуск

Используйте Node.js 24 LTS и npm. Откройте два терминала в корне репозитория.

В первом запустите API.

```powershell
cd backend
npm ci
npm start
```

API доступен по адресу `http://localhost:3000/api`. Список мест можно проверить по `http://localhost:3000/api/posts`.

Во втором запустите веб-версию.

```powershell
cd frontend
npm ci
npm run web
```

Откройте адрес из вывода Expo, обычно `http://localhost:8081`. Если PowerShell блокирует запуск `npm.ps1`, используйте `npm.cmd` в тех же командах.

## Настройки

- **API.** Для веба и iOS Simulator по умолчанию используется `http://localhost:3000`, для Android Emulator — `http://10.0.2.2:3000`. Чтобы изменить адрес, задайте `EXPO_PUBLIC_API_URL` в `frontend/.env.local` и перезапустите Expo.
- **Телефон в локальной сети.** Задайте `HOST=0.0.0.0` в `backend/.env`, а во фронтенде укажите `EXPO_PUBLIC_API_URL=http://<IP-компьютера>:3000`. Запустите `npm start` во фронтенде и откройте проект в совместимом Expo Go или development build. Для эмулятора используйте `npm run android` или `npm run ios` в настроенной среде.
- **Карта.** Для встроенной карты на Android и iOS задайте клиентский ключ `EXPO_PUBLIC_YANDEX_MAPS_KEY`. В браузере и без ключа поиск адреса открывает Яндекс Карты по ссылке.
- **SQLite.** По умолчанию используется локальный `backend/database.db`. Чтобы открыть другой файл базы, задайте `DB_PATH` в `backend/.env`. Примеры переменных есть в обеих папках. Локальные `.env` и базу не добавляйте в Git.

## Проверки

В папке `frontend` выполните:

```powershell
npm run lint
npm run typecheck
npm exec -- expo install --check
npm exec -- expo export --platform all
```

Веб-экспорт использует клиентскую маршрутизацию. При публикации папки `frontend/dist` настройте сервер на выдачу `index.html` для путей приложения, например `/company/7`. Адрес API встраивается при экспорте через `EXPO_PUBLIC_API_URL`.

## Где работать

| Участок | Файлы |
|---|---|
| Экраны и маршруты | `frontend/app` |
| Поиск и категории | `frontend/app/(tabs)/search.tsx`, `frontend/lib/place-categories.ts` |
| Ленты | `frontend/app/(tabs)/index.tsx`, `frontend/app/(tabs)/nearby.tsx` |
| Карточка места | `frontend/app/company/[id].tsx`, `frontend/components/place-details.tsx` |
| Адрес API и типы данных | `frontend/constants/content.ts` |
| Сервер, запросы и база | `backend/server.js`, `backend/database-service.js`, `backend/db.js`, `backend/seed.js` |

Форма входа пока создаёт локальный демопрофиль. API регистрации и входа уже доступен отдельно. Подключение формы к API, ленты новостей и рекомендаций, админка и статистика описаны в плане задач.

Чтобы начать работу в новом чате, напишите «Делай пункт N» или «Делай Т-XX» с номером назначенной задачи из [TASKS.md](TASKS.md). Правила для агентов находятся в [AGENTS.md](AGENTS.md), текущие результаты и блокировки — в [PROJECT_PROGRESS.md](PROJECT_PROGRESS.md), версии пакетов — в [DEPENDENCIES.md](DEPENDENCIES.md).
