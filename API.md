# REST/JSON API

Все маршруты `/api/*`. Все ответы JSON, `Cache-Control: no-store`. Сессия передаётся cookie. У каждой операции записи, кроме выбора демороли, требуется `Idempotency-Key` длиной 8–128 символов. Повтор ключа и того же тела возвращает исходный результат с `replayed: true`; ключ с другим запросом даёт 409. Доступ к чужому подразделению проверяется независимо от фильтров UI.

| Метод и маршрут | Вход / результат |
| --- | --- |
| `GET /health` | `{status, mode, persistence}`, доступен без сессии |
| `POST /session` | `{role: executive\|manager\|analyst\|operator}` → демосессия и HttpOnly cookie |
| `GET /bootstrap?period=week&department=all&product=all` | Разрешённые KPI, формулы, заказы, задачи, проверки, журнал, источники, качество данных и прогноз |
| `GET /export` | Та же отфильтрованная витрина, с `exportedAt`; оператору запрещён |
| `POST /tasks` | `{title, description?, impact?, cause?, owner, dueAt, priority?, signalId?}` → `{task}` |
| `PATCH /tasks/:id/status` | `{status: in_progress}` или `{status: review, note}`; переходы только `new → in_progress → review` |
| `POST /tasks/:id/verify` | `{scenario: recovered\|unchanged, note?}` → `{task, check}`; только руководители/аналитик, исходный статус review |
| `POST /integrations/:id/sync` | `{eventId?}` → `{connector, eventId, duplicate}`; только аналитик |
| `POST /integrations/:id/failure` | `{enabled: boolean}` → включить/выключить mock-сбой; только аналитик |

`period`: `today`, `week`, `month` (соответственно 1, 7, 28 дней). Подразделения: `books`, `photo`, `gifts`. Продукты: `book`, `prints`, `canvas`, `calendar`, `cards`. Источники: `crm`, `support`, `erp`, `finance`, `hr`. Владельцы: `mikhail`, `daria`, `igor`, `anna`. Приоритеты: `high`, `medium`, `low`.

Для `dueAt` передавайте ISO 8601 с часовым поясом. Финансы возвращаются в виде нормированных индексов и долей; абсолютных денежных значений в API нет. Экспорт соблюдает те же права, что bootstrap.

## Пример

```sh
curl -c /tmp/contour-cookies -H 'Content-Type: application/json' \
  -d '{"role":"executive"}' http://localhost:3000/api/session

curl -b /tmp/contour-cookies \
  'http://localhost:3000/api/bootstrap?period=week&department=all'
```

Создание решения (подставить срок в будущем):

```json
{
  "title": "Подключить двух модераторов",
  "description": "Уменьшить очередь фотокниг до 30 заказов",
  "impact": "Сохранить обещанные сроки выпуска",
  "owner": "mikhail",
  "dueAt": "2026-11-12T15:00:00+03:00",
  "priority": "high",
  "signalId": "SIG-1042"
}
```

## Ошибки и восстановление

Формат: `{ "error": "Понятное сообщение", "code": "machine_code" }`.

- `400` — невалидная форма/JSON/ключ идемпотентности.
- `401` — нет или истекла демосессия.
- `403` — недостаточно прав или несовпадение Origin. Отказы авторизованному пользователю записываются в журнал.
- `404` — неизвестный объект/маршрут.
- `409` — неверный переход, дубликат активного решения, повтор ключа с другим содержимым.
- `413` — тело больше 64 KiB.
- `503 source_unavailable` — тест сбоя mock API; данные и прогресс сохраняются. После восстановления источника можно повторить тот же запрос с тем же ключом: ошибки источника ключ не потребляют.
- `500` — непредвиденный сбой, безопасное понятное сообщение без внутреннего стека.

Успешная повторная проверка сохраняет источник, время, исходное и измеренное значение, целевой порог и результат. Негативная проверка остаётся в истории, задача сохраняет статус review. Успешный mock-сценарий изменяет исходные синтетические факты, после чего метрики рассчитываются заново. Источник передаёт безденежные статусы. Реальная финансовая сверка сумм и внешний event ingestion требуют отдельного адаптера.
