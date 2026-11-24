// HTTP-интерфейс над списком дел: GET /todos, GET /todos/stats, GET /todos/stats.txt, POST /todos, POST /todos/:id/complete.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { addTodo, completeTodo, emptyList, listTodos, todoStats, type TodoList, type TodoStats } from './todos.js';

let state: TodoList = emptyList();

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

// Текстовый ответ: тело отдаётся как есть, Content-Length — число байтов UTF-8 без заголовков.
function sendText(res: ServerResponse, status: number, body: string): void {
  const payload = Buffer.from(body, 'utf8');
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': String(payload.byteLength),
  });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text.length === 0 ? {} : (JSON.parse(text) as Record<string, unknown>);
}

// Текстовая сводка для терминала мониторинга: три строки `имя: число` в порядке
// total, open, done, разделитель строк LF. Числа те же, что в GET /todos/stats.
function statsText(stats: TodoStats): string {
  return `total: ${stats.total}\nopen: ${stats.open}\ndone: ${stats.done}\n`;
}

export function handle(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const complete = url.pathname.match(/^\/todos\/(\d+)\/complete$/);
  void (async () => {
    try {
      if (req.method === 'GET' && url.pathname === '/todos') {
        const filter = url.searchParams.get('filter');
        const allowed = filter === 'open' || filter === 'done' ? filter : 'all';
        return send(res, 200, listTodos(state, allowed));
      }
      if (req.method === 'GET' && url.pathname === '/todos/stats') {
        return send(res, 200, todoStats(state));
      }
      if (req.method === 'GET' && url.pathname === '/todos/stats.txt') {
        return sendText(res, 200, statsText(todoStats(state)));
      }
      if (req.method === 'POST' && url.pathname === '/todos') {
        const body = await readJson(req);
        const result = addTodo(state, String(body.title ?? ''));
        state = result.list;
        return send(res, 201, result.todo);
      }
      if (req.method === 'POST' && complete) {
        state = completeTodo(state, Number(complete[1]));
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'not found' });
    } catch (error) {
      return send(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  })();
}

if (process.argv[1]?.endsWith('server.js')) {
  const port = Number(process.env.PORT ?? 3000);
  createServer(handle).listen(port, '127.0.0.1', () => {
    console.log(`hireminds-pilot-app listening on http://127.0.0.1:${port}`);
  });
}
