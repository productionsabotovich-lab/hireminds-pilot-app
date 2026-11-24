# hireminds-pilot-app

Пилотное приложение для платформы Hireminds: список дел по HTTP. На нём роли-агенты выполняют задачи
от постановки до PR; репозиторий намеренно небольшой.

## Как запустить локально

Нужен Node.js версии 20 или новее (`engines.node` в `package.json`: `>=20`).

После клонирования репозитория:

```
npm ci                       # установить зависимости
npm run build && npm start   # собрать и запустить сервер: http://127.0.0.1:3000
npm test                     # запустить тесты (vitest)
npm run check                # проверить типы
```

Отдельного dev-сервера с автоперезапуском в `package.json` нет: сервер запускается из сборки (`dist/server.js`).

## API

| Метод и путь | Что делает |
| --- | --- |
| `GET /todos?filter=all\|open\|done` | Список дел |
| `GET /todos/stats` | Сводка по делам: `total`, `open`, `done` |
| `POST /todos` `{ "title": "..." }` | Добавить дело |
| `POST /todos/:id/complete` | Отметить выполненным |

Сводка `GET /todos/stats` считается по всему списку, query-параметры (в том числе `filter`)
игнорируются, запрос ничего не меняет. Пример ответа для списка из трёх дел, одно из которых выполнено:

```
$ curl -s http://127.0.0.1:3000/todos/stats
{"total":3,"open":2,"done":1}
```

Пустой заголовок отклоняется: `POST /todos` отвечает `400 Bad Request`, дело не создаётся
и идентификатор не расходуется. Строка из одних пробельных символов считается пустой.

```
$ curl -i -X POST http://127.0.0.1:3000/todos \
  -H 'Content-Type: application/json' \
  -d '{"title":""}'
HTTP/1.1 400 Bad Request
Content-Type: application/json; charset=utf-8

{"error":"title is empty"}
```

Корректный заголовок обрезается по краям, дело создаётся с ответом `201 Created`:

```
$ curl -i -X POST http://127.0.0.1:3000/todos \
  -H 'Content-Type: application/json' \
  -d '{"title":" Купить хлеб "}'
HTTP/1.1 201 Created
Content-Type: application/json; charset=utf-8

{"id":1,"title":"Купить хлеб","done":false}
```

Состояние хранится в памяти процесса и теряется при перезапуске.

## Структура

- `src/todos.ts` — чистые функции списка дел.
- `src/server.ts` — HTTP-обработчик и запуск сервера.
- `test/` — тесты vitest.
- `docs/` — постановки и документы задач (см. `docs/README.md`).
