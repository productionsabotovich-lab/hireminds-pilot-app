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

  describe('GET /todos with limit', () => {
    // Смешанный список из критериев приёмки: A и C выполнены, B и D открыты.
    const todoA = { id: 1, title: 'A', done: true };
    const todoB = { id: 2, title: 'B', done: false };
    const todoC = { id: 3, title: 'C', done: true };
    const todoD = { id: 4, title: 'D', done: false };

    async function seedMixedList(): Promise<void> {
      await addTodo('A');
      await addTodo('B');
      await addTodo('C');
      await addTodo('D');
      await post('/todos/1/complete');
      await post('/todos/3/complete');
    }

    async function expectJson(path: string, expected: unknown): Promise<void> {
      const res = await get(path);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(await res.json()).toEqual(expected);
    }

    it('keeps the previous behaviour without a limit', async () => {
      await seedMixedList();
      await expectJson('/todos', [todoA, todoB, todoC, todoD]);
      await expectJson('/todos?filter=open', [todoB, todoD]);
    });

    it('returns the first items of the list', async () => {
      await seedMixedList();
      await expectJson('/todos?limit=2', [todoA, todoB]);
      await expectJson('/todos?filter=all&limit=2', [todoA, todoB]);
    });

    it('applies the filter before the limit', async () => {
      await seedMixedList();
      await expectJson('/todos?filter=open&limit=1', [todoB]);
      await expectJson('/todos?filter=done&limit=1', [todoA]);
    });

    it('ignores an unknown or empty filter', async () => {
      await seedMixedList();
      await expectJson('/todos?filter=other&limit=1', [todoA]);
      await expectJson('/todos?filter=&limit=1', [todoA]);
    });

    it('returns all matching todos when there are fewer than the limit', async () => {
      await seedMixedList();
      await expectJson('/todos?filter=open&limit=2', [todoB, todoD]);
      await expectJson('/todos?filter=open&limit=10', [todoB, todoD]);
    });

    it('accepts the largest safe integer as a limit', async () => {
      await seedMixedList();
      await expectJson('/todos?limit=9007199254740991', [todoA, todoB, todoC, todoD]);
    });

    it('returns an empty array for an empty list and for no matches', async () => {
      await expectJson('/todos?limit=3', []);

      await addTodo('X');
      await expectJson('/todos?filter=done&limit=3', []);
    });

    it('does not depend on the order of the query parameters', async () => {
      await seedMixedList();
      await expectJson('/todos?limit=1&filter=open', [todoB]);
      await expectJson('/todos?filter=open&limit=1', [todoB]);
    });

    it('rejects an invalid limit with 400', async () => {
      const invalid = [
        'limit',
        'limit=',
        'limit=0',
        'limit=-1',
        'limit=1.5',
        'limit=%2B1',
        'limit=%201',
        'limit=1e2',
        'limit=0x10',
        'limit=abc',
        'limit=2abc',
        'limit=9007199254740992',
      ];
      for (const query of invalid) {
        const res = await get(`/todos?${query}`);
        expect(res.status).toBe(400);
        expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
        expect(await res.text()).toBe('{"error":"limit must be a positive safe integer"}');
      }
    });

    it('rejects an invalid limit even for an empty list', async () => {
      const res = await get('/todos?limit=0');
      expect(res.status).toBe(400);
      expect(await res.text()).toBe('{"error":"limit must be a positive safe integer"}');
    });

    it('accepts leading zeros and uses the first value of a repeated limit', async () => {
      await seedMixedList();
      await expectJson('/todos?limit=01', [todoA]);
      await expectJson('/todos?limit=1&limit=2', [todoA]);

      const res = await get('/todos?limit=&limit=2');
      expect(res.status).toBe(400);
      expect(await res.text()).toBe('{"error":"limit must be a positive safe integer"}');
    });

    it('does not change the stored list', async () => {
      await seedMixedList();

      await expectJson('/todos?limit=1', [todoA]);
      await expectJson('/todos', [todoA, todoB, todoC, todoD]);
      await expectJson('/todos/stats', { total: 4, open: 2, done: 2 });

      await addTodo('E');
      await expectJson('/todos', [todoA, todoB, todoC, todoD, { id: 5, title: 'E', done: false }]);
    });

    it('does not change the stored list after an invalid limit', async () => {
      await seedMixedList();

      const res = await get('/todos?limit=0');
      expect(res.status).toBe(400);

      await expectJson('/todos', [todoA, todoB, todoC, todoD]);
      await expectJson('/todos/stats', { total: 4, open: 2, done: 2 });
    });

    it('ignores the limit in the statistics route', async () => {
      await seedMixedList();
      await expectJson('/todos/stats?limit=1', { total: 4, open: 2, done: 2 });
      await expectJson('/todos/stats?limit=0', { total: 4, open: 2, done: 2 });
    });
  });
});
