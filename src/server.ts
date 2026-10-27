// HTTP-интерфейс над списком дел: GET /health, GET /todos, POST /todos, POST /todos/:id/complete.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { addTodo, completeTodo, emptyList, healthStatus, listTodos, type TodoList } from './todos.js';

let state: TodoList = emptyList();
const startedAt = Date.now();

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text.length === 0 ? {} : (JSON.parse(text) as Record<string, unknown>);
}

export function handle(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const complete = url.pathname.match(/^\/todos\/(\d+)\/complete$/);
  void (async () => {
    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        return send(res, 200, healthStatus((Date.now() - startedAt) / 1000));
      }
      if (req.method === 'GET' && url.pathname === '/todos') {
        const filter = url.searchParams.get('filter');
        const allowed = filter === 'open' || filter === 'done' ? filter : 'all';
        return send(res, 200, listTodos(state, allowed));
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
