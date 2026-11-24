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

  describe('GET /todos/:id', () => {
    it('returns a todo by the id returned on creation', async () => {
      const first = await post('/todos', { title: 'Купить хлеб' });
      const second = await post('/todos', { title: 'Позвонить врачу' });
      const firstId = ((await first.json()) as { id: number }).id;
      const secondId = ((await second.json()) as { id: number }).id;
      expect(firstId).not.toBe(secondId);

      const res = await get(`/todos/${firstId}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(await res.json()).toEqual({ id: firstId, title: 'Купить хлеб', done: false });

      const other = await get(`/todos/${secondId}`);
      expect(other.status).toBe(200);
      expect(await other.json()).toEqual({ id: secondId, title: 'Позвонить врачу', done: false });
    });

    it('returns the current done flag of a completed todo', async () => {
      await addTodo('a');
      const completed = await post('/todos/1/complete');
      expect(completed.status).toBe(200);

      const res = await get('/todos/1');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: 1, title: 'a', done: true });
    });

    it('returns 404 for a missing todo in an empty and in a non-empty list', async () => {
      const empty = await get('/todos/1');
      expect(empty.status).toBe(404);
      expect(empty.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(await empty.text()).toBe('{"error":"not found"}');

      await addTodo('a');
      const missing = await get('/todos/2');
      expect(missing.status).toBe(404);
      expect(await missing.text()).toBe('{"error":"not found"}');
    });

    it('ignores query parameters and accepts leading zeros', async () => {
      await addTodo('a');

      const plain = await get('/todos/1');
      const query = await get('/todos/1?filter=done');
      const zeros = await get('/todos/01');

      expect(plain.status).toBe(200);
      expect(query.status).toBe(200);
      expect(zeros.status).toBe(200);
      expect(await query.json()).toEqual({ id: 1, title: 'a', done: false });
      expect(await zeros.json()).toEqual({ id: 1, title: 'a', done: false });
    });

    it('keeps 404 for ids that match no todo', async () => {
      await addTodo('a');

      const paths = [
        '/todos/0',
        '/todos/2',
        '/todos/abc',
        '/todos/-1',
        '/todos/1.5',
        '/todos/1/',
        '/todos/9007199254740993',
      ];
      for (const path of paths) {
        const res = await get(path);
        expect(res.status).toBe(404);
        expect(await res.text()).toBe('{"error":"not found"}');
      }
    });

    it('keeps 404 for non-GET methods and does not change the list', async () => {
      await addTodo('a');

      const res = await post('/todos/1', { title: 'b' });
      expect(res.status).toBe(404);
      expect(await res.text()).toBe('{"error":"not found"}');

      const list = await (await get('/todos')).json();
      expect(list).toEqual([{ id: 1, title: 'a', done: false }]);
    });

    it('does not change the list, the stats or the id sequence', async () => {
      await addTodo('a');
      await addTodo('b');
      await post('/todos/1/complete');

      const listBefore = await (await get('/todos')).text();
      const statsBefore = await (await get('/todos/stats')).text();

      await get('/todos/1');
      await get('/todos/9');

      const listAfter = await (await get('/todos')).text();
      const statsAfter = await (await get('/todos/stats')).text();

      expect(listAfter).toBe(listBefore);
      expect(statsAfter).toBe(statsBefore);
      expect(statsAfter).toBe('{"total":2,"open":1,"done":1}');

      const created = await post('/todos', { title: 'c' });
      expect(created.status).toBe(201);
      expect(await created.json()).toEqual({ id: 3, title: 'c', done: false });
    });

    it('keeps the stats route exact', async () => {
      await addTodo('a');
      await addTodo('b');
      await post('/todos/1/complete');

      const stats = await get('/todos/stats');
      expect(stats.status).toBe(200);
      expect(await stats.json()).toEqual({ total: 2, open: 1, done: 1 });

      const filtered = await get('/todos/stats?filter=open');
      expect(filtered.status).toBe(200);
      expect(await filtered.json()).toEqual({ total: 2, open: 1, done: 1 });
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
