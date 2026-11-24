// HTTP-поведение маршрутов. Состояние `state` — переменная модуля src/server.ts,
// поэтому перед каждым кейсом реестр модулей сбрасывается и модуль импортируется заново.
import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('server routes', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.resetModules();
    const { handle } = await import('../src/server.js');
    server = createServer(handle);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('server address is not available');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  async function get(path: string): Promise<Response> {
    return fetch(`${baseUrl}${path}`);
  }

  async function post(path: string, body?: unknown): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function addTodo(title: string): Promise<void> {
    const res = await post('/todos', { title });
    expect(res.status).toBe(201);
  }

  describe('GET /todos/stats', () => {
    it('returns zero counters for an empty list', async () => {
      const res = await get('/todos/stats');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(await res.text()).toBe('{"total":0,"open":0,"done":0}');
    });

    it('reflects the current state of the list', async () => {
      await addTodo('Купить хлеб');
      await addTodo('Позвонить врачу');
      const completed = await post('/todos/1/complete');
      expect(completed.status).toBe(200);

      const res = await get('/todos/stats');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ total: 2, open: 1, done: 1 });
    });

    it('keeps total equal to open plus done', async () => {
      await addTodo('a');
      await addTodo('b');
      await addTodo('c');
      await post('/todos/2/complete');

      const stats = (await (await get('/todos/stats')).json()) as {
        total: number;
        open: number;
        done: number;
      };
      expect(stats.total).toBe(stats.open + stats.done);
      expect(Object.keys(stats).sort()).toEqual(['done', 'open', 'total']);
    });

    it('does not change the todos', async () => {
      await addTodo('a');
      await addTodo('b');
      await post('/todos/1/complete');

      const before = await (await get('/todos')).text();
      const first = await (await get('/todos/stats')).text();
      const second = await (await get('/todos/stats')).text();
      const after = await (await get('/todos')).text();

      expect(after).toBe(before);
      expect(second).toBe(first);
      expect(first).toBe('{"total":2,"open":1,"done":1}');
    });

    it('ignores query parameters', async () => {
      await addTodo('a');
      await post('/todos/1/complete');

      const plain = await (await get('/todos/stats')).text();
      const filtered = await (await get('/todos/stats?filter=open')).text();
      expect(filtered).toBe(plain);
      expect(filtered).toBe('{"total":1,"open":0,"done":1}');
    });

    it('keeps the existing 404 for non-GET methods', async () => {
      const res = await post('/todos/stats');
      expect(res.status).toBe(404);
      expect(await res.text()).toBe('{"error":"not found"}');
    });
  });

  describe('GET /todos/stats.txt', () => {
    it('returns zero counters for an empty list', async () => {
      const res = await get('/todos/stats.txt');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
      expect(await res.text()).toBe('total: 0\nopen: 0\ndone: 0\n');
    });

    it('returns three lines in the total, open, done order', async () => {
      await addTodo('Купить хлеб');
      await addTodo('Позвонить врачу');
      await addTodo('Сдать отчёт');
      await post('/todos/2/complete');

      const res = await get('/todos/stats.txt');
      const body = await res.text();
      expect(res.status).toBe(200);
      expect(body).toBe('total: 3\nopen: 2\ndone: 1\n');
      expect(body.split('\n').filter((line) => line !== '')).toEqual(['total: 3', 'open: 2', 'done: 1']);
    });

    it('counts a list where every todo is open', async () => {
      await addTodo('a');
      await addTodo('b');

      const body = await (await get('/todos/stats.txt')).text();
      expect(body).toBe('total: 2\nopen: 2\ndone: 0\n');
    });

    it('counts a list where every todo is done', async () => {
      await addTodo('a');
      await addTodo('b');
      await post('/todos/1/complete');
      await post('/todos/2/complete');

      const body = await (await get('/todos/stats.txt')).text();
      expect(body).toBe('total: 2\nopen: 0\ndone: 2\n');
    });

    it('matches the counters of the JSON summary', async () => {
      await addTodo('a');
      await addTodo('b');
      await post('/todos/1/complete');

      const text = await (await get('/todos/stats.txt')).text();
      const json = (await (await get('/todos/stats')).json()) as { total: number; open: number; done: number };
      expect(text).toBe(`total: ${json.total}\nopen: ${json.open}\ndone: ${json.done}\n`);
      expect(json.total).toBe(json.open + json.done);
    });

    it('reflects the list after adding and completing a todo', async () => {
      await addTodo('a');
      expect(await (await get('/todos/stats.txt')).text()).toBe('total: 1\nopen: 1\ndone: 0\n');

      await post('/todos/1/complete');
      expect(await (await get('/todos/stats.txt')).text()).toBe('total: 1\nopen: 0\ndone: 1\n');

      // Повторное завершение уже выполненного дела не увеличивает done второй раз.
      await post('/todos/1/complete');
      expect(await (await get('/todos/stats.txt')).text()).toBe('total: 1\nopen: 0\ndone: 1\n');
    });

    it('does not change the todos and does not consume ids', async () => {
      await addTodo('a');
      await addTodo('b');
      await post('/todos/1/complete');

      const before = await (await get('/todos')).text();
      const first = await (await get('/todos/stats.txt')).text();
      const second = await (await get('/todos/stats.txt')).text();
      const after = await (await get('/todos')).text();

      expect(after).toBe(before);
      expect(second).toBe(first);
      expect(first).toBe('total: 2\nopen: 1\ndone: 1\n');

      const created = await post('/todos', { title: 'c' });
      expect(await created.json()).toEqual({ id: 3, title: 'c', done: false });
    });

    it('ignores query parameters and the accept header', async () => {
      await addTodo('a');
      await post('/todos/1/complete');

      const plain = await (await get('/todos/stats.txt')).text();
      const filtered = await (await get('/todos/stats.txt?filter=open')).text();
      const unknown = await (await get('/todos/stats.txt?unknown=1')).text();
      expect(filtered).toBe(plain);
      expect(unknown).toBe(plain);
      expect(plain).toBe('total: 1\nopen: 0\ndone: 1\n');

      const accepted = await fetch(`${baseUrl}/todos/stats.txt`, { headers: { accept: 'application/json' } });
      expect(accepted.headers.get('content-type')).toBe('text/plain; charset=utf-8');
      expect(await accepted.text()).toBe(plain);
    });

    it('sends utf-8 text without a byte order mark', async () => {
      const res = await get('/todos/stats.txt');
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
      expect(bytes.toString('utf8')).toBe('total: 0\nopen: 0\ndone: 0\n');
    });

    it('sets content-length to the byte length of the body', async () => {
      await addTodo('a');

      const res = await get('/todos/stats.txt');
      const body = await res.text();
      const length = Number(res.headers.get('content-length'));
      expect(Number.isInteger(length)).toBe(true);
      expect(length).toBe(Buffer.byteLength(body, 'utf8'));
      expect(length).toBe(Buffer.byteLength('total: 1\nopen: 1\ndone: 0\n', 'utf8'));
    });

    it('keeps content-length equal to the body length for multi-digit counters', async () => {
      for (let i = 0; i < 12; i += 1) await addTodo(`todo ${i}`);
      await post('/todos/1/complete');

      const res = await get('/todos/stats.txt');
      const body = await res.text();
      expect(body).toBe('total: 12\nopen: 11\ndone: 1\n');
      expect(Number(res.headers.get('content-length'))).toBe(Buffer.byteLength(body, 'utf8'));
    });

    it('keeps the existing 404 for the trailing slash and for non-GET methods', async () => {
      const withSlash = await get('/todos/stats.txt/');
      expect(withSlash.status).toBe(404);
      expect(await withSlash.text()).toBe('{"error":"not found"}');

      const posted = await post('/todos/stats.txt');
      expect(posted.status).toBe(404);
      expect(await posted.text()).toBe('{"error":"not found"}');
    });
  });

  describe('existing routes', () => {
    it('lists todos and filters them by state', async () => {
      await addTodo('a');
      await addTodo('b');
      await post('/todos/1/complete');

      const all = await get('/todos');
      expect(all.status).toBe(200);
      expect(await all.json()).toEqual([
        { id: 1, title: 'a', done: true },
        { id: 2, title: 'b', done: false },
      ]);

      const open = await get('/todos?filter=open');
      expect(open.status).toBe(200);
      expect(await open.json()).toEqual([{ id: 2, title: 'b', done: false }]);

      const done = await get('/todos?filter=done');
      expect(done.status).toBe(200);
      expect(await done.json()).toEqual([{ id: 1, title: 'a', done: true }]);
    });

    it('adds a todo and completes it', async () => {
      const created = await post('/todos', { title: 'a' });
      expect(created.status).toBe(201);
      expect(await created.json()).toEqual({ id: 1, title: 'a', done: false });

      const completed = await post('/todos/1/complete');
      expect(completed.status).toBe(200);
      expect(await completed.json()).toEqual({ ok: true });
    });

    it('keeps the existing 404 for unknown paths', async () => {
      const res = await get('/todos/stats/');
      expect(res.status).toBe(404);
      expect(await res.text()).toBe('{"error":"not found"}');
    });
  });
});
