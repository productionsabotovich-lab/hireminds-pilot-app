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

  describe('POST /todos validation', () => {
    const emptyTitles = ['', '   ', '\t', '\t\t', '\n', '\n\n', '\r', '\r\n', '\t\r\n', '\u00a0'];

    async function listText(): Promise<string> {
      const res = await get('/todos');
      expect(res.status).toBe(200);
      return res.text();
    }

    async function statsText(): Promise<string> {
      const res = await get('/todos/stats');
      expect(res.status).toBe(200);
      return res.text();
    }

    it.each(emptyTitles)('rejects a whitespace-only title %j in an empty list', async (title) => {
      const before = await listText();
      const beforeStats = await statsText();
      expect(before).toBe('[]');
      expect(beforeStats).toBe('{"total":0,"open":0,"done":0}');

      const res = await post('/todos', { title });
      expect(res.status).toBe(400);
      expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(await res.text()).toBe('{"error":"title is empty"}');

      expect(await listText()).toBe(before);
      expect(await statsText()).toBe(beforeStats);

      const created = await post('/todos', { title: 'Купить хлеб' });
      expect(created.status).toBe(201);
      expect(await created.json()).toEqual({ id: 1, title: 'Купить хлеб', done: false });
    });

    it.each(emptyTitles)('rejects a whitespace-only title %j in a non-empty list', async (title) => {
      const first = await post('/todos', { title: 'Купить хлеб' });
      expect(first.status).toBe(201);
      const second = await post('/todos', { title: 'Позвонить врачу' });
      expect(second.status).toBe(201);
      const completed = await post('/todos/1/complete');
      expect(completed.status).toBe(200);

      const before = await listText();
      const beforeStats = await statsText();
      expect(before).toBe(
        '[{"id":1,"title":"Купить хлеб","done":true},{"id":2,"title":"Позвонить врачу","done":false}]',
      );
      expect(beforeStats).toBe('{"total":2,"open":1,"done":1}');

      const res = await post('/todos', { title });
      expect(res.status).toBe(400);
      expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(await res.text()).toBe('{"error":"title is empty"}');

      expect(await listText()).toBe(before);
      expect(await statsText()).toBe(beforeStats);

      const created = await post('/todos', { title: 'Купить молоко' });
      expect(created.status).toBe(201);
      expect(await created.json()).toEqual({ id: 3, title: 'Купить молоко', done: false });
      expect(await listText()).toBe(
        '[{"id":1,"title":"Купить хлеб","done":true},{"id":2,"title":"Позвонить врачу","done":false},' +
          '{"id":3,"title":"Купить молоко","done":false}]',
      );
      expect(await statsText()).toBe('{"total":3,"open":2,"done":1}');
    });

    it('trims the edges of a valid title and keeps internal spaces', async () => {
      const res = await post('/todos', { title: '  Купить  хлеб  ' });
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ id: 1, title: 'Купить  хлеб', done: false });
    });

    it('rejects a request without a title', async () => {
      const res = await post('/todos', {});
      expect(res.status).toBe(400);
      expect(await res.text()).toBe('{"error":"title is empty"}');
    });

    it('rejects a request with a null title', async () => {
      const res = await post('/todos', { title: null });
      expect(res.status).toBe(400);
      expect(await res.text()).toBe('{"error":"title is empty"}');
    });

    it('keeps the existing conversion of a numeric title', async () => {
      const res = await post('/todos', { title: 42 });
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ id: 1, title: '42', done: false });
    });

    it('ignores extra fields of the request', async () => {
      const res = await post('/todos', { title: 'Купить хлеб', done: true, extra: 1 });
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ id: 1, title: 'Купить хлеб', done: false });
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
