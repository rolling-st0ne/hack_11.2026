# Внешние компоненты и лицензии

Реестр для ОТ-08. Проверено 12 ноября 2026. Полные тексты и notices сохранены в [`licenses/`](licenses/README.txt); [`manifest.json`](licenses/manifest.json) содержит версии, источники, время получения/извлечения, размер и SHA-256 каждого файла. Здесь нет исполняемых библиотек, паролей, токенов или рабочих данных.

Основной приёмочный путь — локальное/LAN-приложение на Node.js с `CONTOUR_BI=off`. Metabase, Java и Docker — дополнительные варианты. В `package.json` нет сторонних npm-зависимостей. SQLite используется через встроенный `node:sqlite`, отдельный npm-драйвер не устанавливается. Внешние AI-модели/API для обязательного сценария не используются.

| Компонент | Использование и версия | Лицензия / локальные тексты | Первичный источник |
| --- | --- | --- | --- |
| Node.js | Сервер, CSV-хранилище, тесты и сборка. Минимум 22.13; локальная проверка выполнена на 26.8.1. | MIT для Node.js и отдельные лицензии встроенных компонентов. Полные inventories: [22.13.0](licenses/upstream/node-22.13.0-LICENSE.txt), [26.8.1](licenses/node-26.8.1/LICENSE). | [Node.js LICENSE 22.13.0](https://github.com/nodejs/node/blob/v22.13.0/LICENSE), [26.8.1](https://github.com/nodejs/node/blob/v26.8.1/LICENSE). |
| SQLite | Встроен в Node; локальный runtime сообщает 3.53.4. Используется для совместимости старого хранилища, проверок и необязательного BI-снимка. | Public domain для поставляемого кода и документации SQLite. [Копия заявления](licenses/upstream/sqlite-copyright.html). Версия зависит от Node. | [SQLite copyright](https://www.sqlite.org/copyright.html). |
| Manrope | Необязательный шрифт UI из Google Fonts; без сети используется системный шрифт. Файлы шрифта в репозитории не поставляются. Версия CDN не закреплена. | SIL Open Font License 1.1; [copyright и полный OFL](licenses/upstream/manrope-OFL-1.1.txt), snapshot от 12.11.2026. | [Google Fonts / Manrope](https://github.com/google/fonts/tree/main/ofl/manrope). |
| Natural Earth admin-1 | Основа упрощённых SVG-контуров BY/RU в `server/regions.mjs`. По исходной записи получено 11.11.2026; точный commit исходного GeoJSON тогда не зафиксирован. | Public domain; [копия условий](licenses/upstream/natural-earth-terms.html). | [Исходный GeoJSON](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_admin_1_states_provinces.geojson), [условия](https://www.naturalearthdata.com/about/terms-of-use/). |
| Metabase OSS | Необязательный отдельный сервис 0.65.3. Приложение получает метрики на сервере в JSON и рисует собственный UI; браузер не загружает iframe. | AGPL v3: [декларация версии](licenses/upstream/metabase-0.65.3-LICENSE.txt), [полный текст с исключениями upstream](licenses/upstream/metabase-0.65.3-AGPL.txt). [Дополнительная embedding license](licenses/upstream/metabase-0.65.3-EMBEDDING.txt) сохранена как upstream-контекст; она не заменяет основную лицензию OSS. | [Исходники 0.65.3](https://github.com/metabase/metabase/tree/v0.65.3), [OSS JAR](https://downloads.metabase.com/v0.65.3/metabase.jar), [лицензии](https://www.metabase.com/license). |
| Eclipse Temurin JRE | Необязательная Java для локального Metabase; установщик macOS arm64 использует 25.0.5+8. | GPL v2 with Classpath Exception; [NOTICE](licenses/temurin-25.0.5+8/NOTICE) и полный [`legal/`](licenses/temurin-25.0.5+8/legal/java.base/LICENSE), включая лицензии модулей, исключения и сторонние notices. | [Официальный релиз](https://github.com/adoptium/temurin25-binaries/releases/tag/jdk-25.0.5%2B8), [Adoptium FAQ](https://adoptium.net/docs/faq). |

Изменения геометрии Natural Earth: упрощение контуров, отбор кодов BY/RU, исправление подписей/соответствия Москвы и Московской области и подписи Алтайского края. Используемый производный файл входит в исходный код проекта. Карта служит аналитическому обзору, не определению юридических границ. Natural Earth допускает изменение и распространение, обязательной атрибуции не требует; источник сохранён для воспроизводимости.

## Встроенные компоненты дополнительных runtimes

Полный список Metabase представлен оригинальными inventories из установленного OSS JAR:

- [Backend](licenses/metabase-0.65.3/bundled/license-backend-third-party.txt): 418 блоков notices.
- [Frontend](licenses/metabase-0.65.3/bundled/license-frontend-third-party.txt): 1 883 блока notices.
- Ещё сохранены все текстовые файлы LICENSE/NOTICE/COPYING из JAR: всего 67 записей. Список путей — в [manifest.json](licenses/manifest.json). Среди них — notices SQLite JDBC 3.50.3.0, PostgreSQL JDBC, Clojure и других встроенных компонентов.

Это upstream-списки компонентов, которые могут входить в продукт, а не новое утверждение о точном составе активного процесса. Каждый компонент сохраняет собственную лицензию. Корневой `LICENSE.txt` внутри объединённого JAR содержит тексты встроенных библиотек и сам по себе не определяет лицензию Metabase; основная декларация версии дана отдельно выше.

Для Temurin скопированы неизменённые `NOTICE` и все текстовые файлы `legal/` из установленного 25.0.5+8 JRE. Символические ссылки преобразованы в самостоятельные копии текста, поэтому notices читаются без установленной Java. Версия подтверждена `release`; её поля записаны в manifest. При распространении бинарной сборки следует сохранять её оригинальные лицензии, notices и предусмотренные upstream материалы, а не только этот краткий реестр.

## Дополнительный Docker Compose

На момент проверки используются `node:24-bookworm-slim` и `metabase/metabase:v0.65.3`. Эти образы скачиваются из upstream и не входят в репозиторий или папку `licenses/`.

- [Рецепты Node Docker](https://github.com/nodejs/docker-node) — MIT; [копия лицензии рецептов](licenses/upstream/docker-node-LICENSE.txt). Это не единая лицензия всех пакетов образа.
- Основа Node-образа — Debian Bookworm; пакеты ОС имеют отдельные лицензии и copyright notices. Первичные тексты входят в исходный образ (`/usr/share/doc/*/copyright`, `/usr/share/common-licenses`) и доступны через [Debian packages](https://packages.debian.org/bookworm/). Проект их не удаляет.
- Metabase-образ сохраняет upstream-licenses Metabase, его runtime и ОС. Локальные notices macOS JRE выше не выдаются за точный состав Linux-контейнера.
- Теги контейнеров не являются зафиксированными digest. Точный набор версий/пакетов зависит от загруженного образа; этот реестр не утверждает, что его инвентаризация выполнена. Для передачи самих контейнерных образов сохраняют notices именно выбранных образов.

Установка Node, Docker Engine/Compose или Docker Desktop выполняется отдельно и не является частью исходного архива приложения. Условия выбранного установочного продукта сохраняются; лицензия Docker-рецептов не распространяется на Docker Desktop.

## Данные и собственный код

Заказы, клиенты, обращения, финансы, персонал и смены — синтетические данные проекта и его генераторов. Они не заимствованы из внешнего бизнес-датасета. Этот реестр перечисляет внешние компоненты и не назначает новую лицензию собственному коду проекта.

## Авторство презентации

Скрипт `submission/presentation/build/deck.mjs` использует @oai/artifact-tool 2.8.129 из предоставленной среды Codex. Эта библиотека не включена в репозиторий и не требуется для запуска приложения или просмотра/редактирования PPTX. Публичное поле license в установленном package.json отсутствует; разрешение на использование определяется условиями предоставленной среды OpenAI, открытая лицензия этому инструменту здесь не приписывается. Локальная ссылка на runtime исключена из Git. Презентация использует ссылки на системный Arial, файлы шрифта не распространяются.
