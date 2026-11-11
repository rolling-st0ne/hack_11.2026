# REST API

Префикс `/api`. JSON, `Cache-Control: no-store`, сессия в HttpOnly SameSite=Strict cookie. Каждая запись, кроме `/session`, требует `Idempotency-Key` (8–128 символов). Повтор того же запроса возвращает результат с `replayed: true`, другое тело с тем же ключом — 409. Чужой Origin отклоняется.

| Метод | Маршрут | Действие |
| --- | --- | --- |
| GET | `/health` | Состояние и тип хранения |
| POST | `/session` | `{role: executive|maxim|sergey|operator|support_staff|growth_staff}` |
| GET | `/bootstrap` | Разрешённые KPI, графики, роль, меню, задачи, источники |
| GET | `/export` | JSON-витрина с текущими фильтрами; только руководители |
| GET | `/files/:name.csv` | `{name,csv}`; только директор |
| POST | `/files/:name.csv` | `{csv}` → `{name,rows}`; только директор, исходные таблицы |
| POST | `/tasks` | `{title,description?,impact?,owner,dueAt,priority?,signalId?}` |
| PATCH | `/tasks/:id/status` | `{status:in_progress}` или `{status:review,note}` |
| POST | `/tasks/:id/verify` | `{scenario:recovered|unchanged,note?}`; руководитель |
| POST | `/integrations/filesystem/sync` | `{eventId?}`; перечитать данные, дедупликация события |
| POST | `/integrations/filesystem/failure` | `{enabled:boolean}`; тест доступности, директор |

Фильтры bootstrap/export: `period=today|week|month` (1/7/28 дней), `department=all|books|photo|gifts`, `product=all|book|prints|canvas|calendar|cards`. Фильтр не расширяет права роли. Оператору передаются только его задачи и заказы. Maxim не получает финансовую витрину. Mary и исходные файлы доступны только директору.

Импортируемые таблицы: `orders.csv`, `customers.csv`, `interactions.csv`, `staff.csv`, `performance.csv`. Используйте скачанный шаблон; типы определены в `schema.csv`. Импорт заменяет ровно одну таблицу атомарно и добавляет аудит. Невалидный CSV не сохраняется. Транспортный лимит JSON — 2 MiB, UI-лимит CSV — 1,8 МБ.

Битрикс24 зарегистрирован как `bitrix`, статус `unconfigured`; запрос синхронизации возвращает 409. Реальных webhook/ключей в проекте нет.

Ошибки: `{error,code}`. 400 — валидация; 401 — сессия; 403 — права/Origin; 404 — объект; 409 — конфликт; 413 — размер; 503 — сценарий недоступного источника. Отказы в доступе пишутся в аудит. Ошибка источника не потребляет ключ идемпотентности.
