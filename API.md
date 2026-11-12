# REST API для hack_3 — v1

Локальный API: `http://127.0.0.1:8080/api/v1`. Из LAN: `http://<IP этого Mac>:3000/api/v1` (через клиентский reverse proxy). Браузер использует тот же origin `/api`. Сервер API слушает loopback; клиент — `0.0.0.0:3000`. Данные синтетические, валюта нормирована в BYN, календарь `Europe/Minsk` (UTC+3).

## Авторизация

1. Пользователь открывает дашборд, входит с персональными логином/паролем. Первичные учётные записи созданы в `.data/auth/ACCESS.txt` (0600, игнорируется Git). Передавайте сокоманднику только его запись. Вход по произвольной роли отключён.
2. В интерфейсе кнопка **Доступ агента** → **Создать персональный токен**. Пользователь копирует токен в конфигурацию своего подключения в hack_3. Токен живёт 1 час по умолчанию (API допускает 60–28800 секунд), привязан к конкретному пользователю; его можно отозвать.
3. Агент передаёт `Authorization: Bearer <token>`. Разрешения: `catalog:read`, `changes:propose`. Не используйте общий токен директора для других пользователей. Роль/подразделение из запроса или ответа модели не принимаются как полномочия.
4. Агент создаёт предложение и показывает пользователю `reviewUrl`, разрешённый относительно адреса дашборда. Пользователь входит **под той же учётной записью**, просматривает точную формулу/значение/источники либо состав дашборда и нажимает **Подтверждаю изменение**.
5. Bearer-токен **не может подтвердить**, отменить, выдавать токены, импортировать CSV, изменять задачи или вызывать старые API. Не передавайте агенту пароль, браузерную cookie, CSRF или confirmationToken. Авторизованный API подтверждения предназначен только для браузерного клиента.

`POST /api/auth/login {username,password}` возвращает `{actor,csrf,expiresIn}` и HttpOnly/SameSite=Strict cookie `contour_session` (12 часов; Secure при HTTPS). `GET /api/auth/me` восстанавливает CSRF после перезагрузки. Браузерные POST требуют **точный Origin** и `X-CSRF-Token`. При локальном HTTP используйте доверенную LAN; для недоверенной сети нужен TLS reverse proxy. Сервер не настраивает роутер/проброс портов, публичный доступ или firewall.

`POST /api/auth/tokens {label,scopes,expiresIn}` — только браузер + CSRF + Idempotency-Key; ответ `{id,token,label,scopes,expiresAt}`. `GET /api/auth/tokens` — список без секретов. `POST /api/auth/tokens/{id}/revoke {}` отзывает собственный токен. `POST /api/auth/logout {}` закрывает браузерную сессию; агентские токены отзываются отдельно. Пароли хешированы scrypt, токены хранятся по SHA-256; выдача токена идемпотентна. Повтор неверного входа ограничен 12 попытками на логин за 10 минут (память процесса).

## Права и сохранение обязательного продукта

- Директор: company, любое направление и собственный personal layout.
- Сущёнок Максим: только `photo`; Зыков Сергей: `books`, `gifts`. Редактируют определения только своего направления и личный дашборд.
- Аналитик/администратор — отдельный профиль третьего уровня, чтение. Линейные сотрудники — чтение разрешённых KPI. Право настройки агентом им не выдано.
- Компания в определении означает общий шаблон; значения **всегда пересчитываются в пределах ACL читателя**. Фильтр не расширяет права. Поля `revenue`, `cost` скрыты от Максима и линейных сотрудников, включая условия `where`.
- 18 встроенных KPI неизменяемы через API; можно создавать и обновлять `custom_*`. Обязательный набор KPI каждого уровня нельзя удалить из layout, нельзя повторять виджеты. Стандартные страницы, прогноз на четыре недели и сценарии решений остаются доступны.
- Порядок выбора layout: личный → выбранное/единственное направление → company → стандартный. При нескольких направлениях выберите направление для его общего layout. Обязательные KPI добавляются сервером, недоступные отфильтровываются. На аналитика и линейных сотрудников распространяются их разрешённые обязательные наборы.

## Контракт

Все ответы JSON; `Cache-Control: no-store`. Ошибка: `{ "error": "сообщение", "code": "machine_code" }`. Любой POST в `/api/v1` требует `Idempotency-Key` (8–128 символов). Повтор того же тела/пути/ключа в той же авторизации возвращает сохранённый результат и `replayed:true`; другой запрос с этим ключом — 409. Для новой попытки после изменения предложения нужен новый ключ.

| Метод и путь `/api/v1` | Запрос | Ответ |
|---|---|---|
| GET `/catalog` | Фильтры в query | `actor`, `metrics[]` (id, label, version, builtin, editable, formula, source, sourceUpdatedAt, unit, value, plan, definition), `filters`, `dashboard`, `sourceVersion` |
| GET `/fields` | — | Разрешённые `sources[].fields[]`, типы/единицы, операции, ограничения, время источников |
| POST `/metrics/preview` | `{definition, filters?}` | Проверенное определение, value/null, unit, sampleSize, formula, sources[], freshness, filters, warnings[], sourceVersion. Саму метрику не сохраняет |
| GET `/dashboards` | Фильтры query | `dashboard`, доступные сохранённые `layouts`, `targets` |
| POST `/proposals` | metric/layout/rollback, см. ниже | 201 `{proposal,reviewUrl}`. Конфигурация ещё не изменена |
| GET `/proposals` | — | Собственные последние 100 `proposals`, без confirmationToken |
| GET `/proposals/{id}` | — | `{proposal,canConfirm}`; **только браузеру** также confirmationToken |
| POST `/proposals/{id}/confirm` | `{confirm:true,confirmationToken}` | Только браузер. `{resource,version,record,proposalId}` |
| POST `/proposals/{id}/cancel` | `{}` | Только браузер. `{proposal}` со статусом cancelled; конфигурация не меняется |
| GET `/history?resource=...` | `metric/{id}` или `layout/{id}` | Разрешённые `revisions[]`: before/after, версия, автор, время, операция и proposalId |

Фильтры: `period=today|week|month|custom`, для custom `from=YYYY-MM-DD&to=YYYY-MM-DD` (включительно, 1–366 дней), `department=all|books|photo|gifts`, `product=all|book|prints|canvas|calendar|cards`, `market=all|BY|RU`, `region=all|<код региона>`. Заказы отбираются по createdAt; обращения/отзывы — по собственному createdAt и связи с разрешённым заказом. Пустые средние/перцентили и деление на ноль возвращают null + warning, а не фиктивный ноль. P50/P90/P95/P99 — линейная интерполяция между соседями отсортированной выборки.

### Определение метрики

```json
{
  "id": "custom_lead_p90",
  "label": "P90 времени исполнения",
  "description": "90% заказов укладываются в это время",
  "source": "orders",
  "expression": {"op":"percentile","field":"leadHours","p":90},
  "unit": "hours",
  "scope": {"type":"department","department":"books"},
  "target": 40,
  "better": "lower"
}
```

`id`: `^custom_[a-z][a-z0-9_]{1,48}$`; label 3–100 символов, description до 500. `source`: orders/interactions/reviews. `scope`: company или department; область существующего определения неизменна. `target`: конечное число или null; `better`: higher/lower. `unit`: count/BYN/percent/ratio/minutes/hours/score. Версия, автор и время назначаются сервером.

`expression` — **JSON AST, не строка с кодом**:

- `{op:"count",where?:[condition]}`;
- `{op:"sum"|"avg"|"min"|"max",field,where?:[condition]}`;
- `{op:"percentile",field,p:50|90|95|99,where?:[condition]}`;
- `{op:"constant",value}`;
- `{op:"add"|"subtract"|"multiply"|"divide",left:expression,right:expression}`.

Условие: `{field,op:"eq"|"ne"|"lt"|"lte"|"gt"|"gte",value}`. Только поля из `/fields`, сравнения правильного типа; строки/булевы — eq/ne. До 64 узлов, глубина 8, до 10 условий на агрегат. Операции учитывают размерность: сложение одинаковых единиц, умножение только на безразмерное число, деление одинаковых единиц даёт ratio; для percent умножьте ratio на 100. Нет SQL, eval, Function, произвольных вызовов, URL или файловых путей.

### Предложения и версии

```json
{"kind":"metric","baseVersion":0,"definition":{"...":"полное определение"},"filters":{"period":"week","market":"BY"}}
```

Для обновления передайте актуальную версию из каталога и полное определение того же ID. `baseVersion:0` означает отсутствие предыдущей версии. Свойства уровня definition валидируются строго; роль пользователя туда не входит.

```json
{"kind":"layout","baseVersion":0,"layout":{"id":"department:books","metricIds":["revenue","orders","production","margin","custom_lead_p90"]}}
```

Layout ID: `company`, `department:{id}`, `personal:{actor.id}`. Актуальную версию берите из `/dashboards`; для личного — `dashboard.version`. Список должен включать `required` целевой роли. Для общих направлений обязательные наборы: photo — customers/newCustomers/support/repeat; books/gifts — revenue/orders/production/margin. Для company — 10 обязательных директорских KPI.

```json
{"kind":"rollback","resource":"metric/custom_lead_p90","baseVersion":2,"targetVersion":1}
```

Откат тоже создаёт предложение и требует подтверждения. После отката к версии 1 текущая версия станет **3**, история не стирается. targetVersion 0 восстанавливает отсутствие пользовательской конфигурации. Удалить метрику откатом нельзя, пока её использует сохранённый layout. Удалённое определение сохраняет номер версии; восстановление возможно новым подтверждённым предложением с актуальным baseVersion.

Предложение неизменно, принадлежит одному пользователю, живёт 30 минут. Исправление — новое предложение. Предпросмотр фиксирует точный диапазон дат, даже для week/today. При подтверждении атомарно перепроверяются сессия, права, структура, зависимости, версия ресурса и версия исходных данных и SHA-256 исходных CSV (включая ручные изменения файлов). Изменившийся источник или конкурирующая правка → 409, повторите preview/propose. После применения обновляются CSV конфигурации, история и аудит в одном snapshot. Состояния: pending/applied/cancelled; просроченное pending применять нельзя.

Основные ошибки: 401 unauthorized, 403 forbidden/forbidden_field/insufficient_scope/human_confirmation_required/csrf_required, 404 not_found, 409 version_conflict/source_changed/idempotency_conflict/metric_in_use/proposal_closed, 410 proposal_expired, 422 invalid_definition/invalid_operation/unit_mismatch/formula_complexity/required_metrics, 429 rate_limited.

## Примеры для агента

Сохраните выданный токен в защищённой конфигурации hack_3 и передайте в переменную окружения `CONTOUR_TOKEN`. Не записывайте его в историю команд или Git.

```sh
CONTOUR_API=http://127.0.0.1:8080/api/v1
curl -H "Authorization: Bearer $CONTOUR_TOKEN" "$CONTOUR_API/catalog?period=week&market=BY"
curl -H "Authorization: Bearer $CONTOUR_TOKEN" "$CONTOUR_API/fields"
curl -H "Authorization: Bearer $CONTOUR_TOKEN" "$CONTOUR_API/dashboards"
```

Файл `preview.json`:

```json
{
  "definition": {
    "id":"custom_response_p90", "label":"P90 первого ответа",
    "source":"interactions", "expression":{"op":"percentile","field":"firstReplyMinutes","p":90},
    "unit":"minutes", "scope":{"type":"department","department":"photo"},
    "target":15, "better":"lower"
  },
  "filters":{"period":"week","market":"BY"}
}
```

```sh
curl -H "Authorization: Bearer $CONTOUR_TOKEN" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: preview-response-001' --data-binary @preview.json "$CONTOUR_API/metrics/preview"
```

Для сохранения создайте `proposal.json` с теми же definition/filters и дополнительными `kind:"metric", baseVersion:0`:

```sh
curl -H "Authorization: Bearer $CONTOUR_TOKEN" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: propose-response-001' --data-binary @proposal.json "$CONTOUR_API/proposals"
```

Отдайте пользователю ссылку `http://<адрес дашборда>:3000` + `reviewUrl`. До нажатия пользователем подтверждения не сообщайте «сохранено». Проверяйте статус через GET `/proposals/{id}`, затем перечитайте каталог/дашборд. Для rollback используйте ту же последовательность. Сетевой retry должен повторять исходный ключ и тело; пользовательское исправление получает новый ключ.

## Хранение и границы

`metric_definitions.csv`, `config_layouts.csv`, `config_proposals.csv`, `config_revisions.csv`, `audit.csv` и исходные CSV сохраняются в `.data/filesystem/snapshot-*/`; атомарный `CURRENT` указывает активный snapshot. Сессии, хеши токенов и результаты идемпотентности — отдельный закрытый `private.json`, не доступны через CSV API. Scrypt-хеши паролей и ключ выдачи токенов — `.data/auth/users.json`. Все файлы доступа исключены из Git. Предложения хранят только конфигурацию/результаты preview, не полные разговоры hack_3. Snapshot и аудит хранятся до ручного удаления локальных тестовых данных; перед сбросом остановите сервер и сделайте копию `.data`. Многопроцессная запись в один Filesystem store не поддерживается: работает один API-процесс с очередью атомарных операций.

Это локальная интеграция Track 1. Код самого ассистента hack_3 не изменялся; ему достаточно реализовать HTTP-клиент этого контракта. Старая приватная облачная демоверсия не подключена к CSV на Mac и данным локального API.

## Источник Metabase

В локальном сервере `GET /api/bootstrap`, `GET /api/export` и `GET /api/v1/catalog` получают выручку, заказы и долю брака через Metabase. KPI сохраняют прежние ID и добавляют `sourceInfo`: `id`, `name`, `status`, `dataset`, `upstream`, `questionId`, `sourceUpdatedAt`, `snapshotAt`, `queriedAt`. Это JSON-данные общего дашборда, без iframe/ссылок на localhost/подписанных токенов в браузере. Фильтры и разрешённые подразделения определяет сервер. При недоступности Metabase `raw` KPI и `value` каталога равны null (в UI — «—»), `sourceInfo.status=unavailable`; остальные источники остаются доступны. Кэш — до 30 секунд, ключ включает fingerprint и область данных.

## Решения и импорт

Все маршруты ниже используют ту же персональную браузерную сессию, Origin/CSRF и Idempotency-Key.

- `GET /api/bootstrap` — ролевой срез, KPI, источники, owners с `assignable` и `departments`, задачи/сигналы/заказы.
- `POST /api/tasks` — `title` (действие), `problem`, `cause`, `impact`, `owner`, `dueAt` (будущий ISO 8601 с поясом), `priority`; `signalId` и `department` необязательны. У сигнала проблема/причина/влияние могут быть взяты из его явно сохранённых полей. Без сигнала эти поля обязательны. Направление должно быть доступно создателю и владельцу.
- `PATCH /api/tasks/{id}/status` — new → in_progress → review; для review обязательна запись `note` о выполненном действии.
- `POST /api/tasks/{id}/verify` — явный mock `scenario: unchanged|recovered`; закрытие только после достижения цели. Свободная задача требует `note` с проверенным результатом.
- `GET /api/files/{name}.csv` — директор/аналитик; `POST` с `{csv:"..."}` — только директор и только импортируемая исходная таблица. Обязательные поля, числа, даты, идентификаторы и ссылки проверяются до записи. Невалидный импорт возвращает 400 и сохраняет прежний снимок.

Встроенный каталог `/api/v1/catalog` возвращает `value: null`, `state: "Нет данных"` и `sampleSize`, когда долю/среднее вычислить нельзя. Нулевой знаменатель не становится 0%. Права проверяются как на существующую, так и на предлагаемую формулу, повторно при подтверждении. Значения вроде 1e-7 поддерживаются на всём пути preview → подтверждение → CSV → чтение.
