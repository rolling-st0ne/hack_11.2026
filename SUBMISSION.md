# Комплект для презентации — трек 1

Начните с [сценария на 6 минут](DEMO.md) и [памятки защиты](submission/DEFENSE.md). [Матрица пунктов 8–12](submission/REQUIREMENTS-8-12.md) связывает требования с материалами и проверками.

## Материалы

| Что нужно | Где |
|---|---|
| Презентация, 10 слайдов | [Открыть PPTX](submission/presentation/output/fotoprint-presentation.pptx) |
| Демонстрация 5–7 минут | [DEMO.md](DEMO.md), целевое время — 6 минут целиком |
| Гипотезы, метрики эффекта, критерии и ответы | [DEFENSE.md](submission/DEFENSE.md) |
| Архитектура и потоки | [ARCHITECTURE.md](ARCHITECTURE.md), схема на слайде 6 |
| API | [API.md](API.md) |
| Данные и воспроизведение | [DATA-METHOD.md](DATA-METHOD.md), data/filesystem, demo:prepare |
| Результаты проверок | [RESULTS.md](submission/verification/RESULTS.md), [TESTING.md](TESTING.md) |
| Задача, роли, запуск, env и ограничения | [README.md](README.md) |
| Лицензии | [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md), licenses/ |

## Код с историей

[Ветка presentation-ready-2026-11-12](https://github.com/rolling-st0ne/hack_11.2026/tree/presentation-ready-2026-11-12).

```sh
git clone --branch presentation-ready-2026-11-12 https://github.com/rolling-st0ne/hack_11.2026.git
cd hack_11.2026
APP_PORT=3310 docker compose -p fotoprint-presentation up -d --build --wait
```

В этой ветке приложение находится в корне репозитория; в исходном рабочем каталоге — в fotoprint/. Репозиторий приватный: жюри нужен ранее выданный доступ. Для просмотра без GitHub подготовлены исходный ZIP и Git bundle с историей. Публичность не изменена. Распакованный ZIP запускается той же командой.

## Готовый стенд

На подготовленном Mac отдельный стенд: http://localhost:3310; с другого устройства — http://<LAN-IP Mac>:3310. Данные и учётные записи отделены от рабочих контейнеров. Адрес хоста можно посмотреть через `npm run address` (для презентации заменить порт на 3310).

Локальная приватная копия паролей: `.data/presentation/ACCESS.txt`. При новом запуске получить их командой `docker compose -p fotoprint-presentation exec app cat .data/auth/ACCESS.txt`. Эти файлы не входят в репозиторий/архив. Использовать executive и maxim; analyst — для вопросов. Не показывать пароли аудитории.

Для поставляемого набора выбрать **06–12 ноября 2026**: в нём виден SIG-1042. Перед показом возвращать все фильтры. Основной сценарий изменяет демоданные; повторная репетиция проводится на новом наборе по DEMO.md, не через удаление рабочих томов.

Без Docker/BI: `npm run demo:prepare`, затем `npm run demo:start`. Нужен Node.js ≥22.13, приложение на порту 3311; источник будет Filesystem. Это честно обозначенный резерв, а не показ отключённого BI как подключённого.

Остановка отдельного презентационного стенда: `docker compose -p fotoprint-presentation stop`. Не выполнять down -v: тома содержат историю показов.

## Что ещё проверяется человеком

Полная репетиция с секундомером на экране зала, распределение рассказа/управления и устные ответы жюри. Другой физический клиент и доступ внешнего аккаунта жюри к приватному GitHub не проверялись. Старый опубликованный Sites-демо не подменяет эту версию.
