# Комплект сдачи трека 1

Исходный код с историей: https://github.com/rolling-st0ne/hack_11.2026/tree/spec-compliance-2026-11-12

В самостоятельном checkout этой ветки каталог приложения — корень репозитория. В исходном локальном workspace он расположен в `fotoprint/`.

```sh
git clone --branch spec-compliance-2026-11-12 https://github.com/rolling-st0ne/hack_11.2026.git
cd hack_11.2026
CONTOUR_BI=off npm start
```

Нужен Node.js ≥22.13. Открыть http://localhost:3000. Учётные записи и индивидуальные пароли создаются при первом запуске в `.data/auth/ACCESS.txt`; файл не публикуется. Для проверки: executive (директор), maxim (только photo), analyst (аналитика, без записи решений). Смена роли — выход и новый вход.

| Материал | Файл |
|---|---|
| Задача, роли, запуск, env, ограничения | [README.md](README.md) |
| Демонстрация на 6 минут | [DEMO.md](DEMO.md) |
| Презентация, 8 слайдов | [PPTX](submission/presentation/output/fotoprint-track1.pptx) |
| Архитектура и потоки данных | [ARCHITECTURE.md](ARCHITECTURE.md) |
| API | [API.md](API.md) |
| Данные и методика | [DATA-METHOD.md](DATA-METHOD.md), `data/filesystem/` |
| Повторная генерация набора | `npm run seed`; рабочее `.data` не сбрасывается |
| Тестирование | [TESTING.md](TESTING.md), `npm test`, `npm run test:acceptance` |
| Сверка обязательных пунктов | [SPEC-COMPLIANCE.md](SPEC-COMPLIANCE.md) |
| Лицензии и notices | [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md), `licenses/` |

Старая облачная демоверсия независима и не служит доказательством текущих исправлений. Канонический воспроизводимый путь этой сдачи — локальный/LAN запуск из указанной ветки. Docker/Metabase остаются дополнительными вариантами из README.
