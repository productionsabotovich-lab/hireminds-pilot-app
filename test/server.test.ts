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

  describe('GET /todos version header', () => {
    it('adds the version header to an empty list', async () => {
      const res = await get('/todos');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(res.headers.get('X-Todo-Api-Version')).toBe('1');
      expect(await res.text()).toBe('[]');
    });

    it('adds the version header to every filter variant', async () => {
      await addTodo('Купить хлеб');
      await addTodo('Позвонить врачу');
      await post('/todos/1/complete');

      const all = await get('/todos');
      expect(all.status).toBe(200);
      expect(all.headers.get('X-Todo-Api-Version')).toBe('1');
      expect(await all.json()).toEqual([
        { id: 1, title: 'Купить хлеб', done: true },
        { id: 2, title: 'Позвонить врачу', done: false },
      ]);

      const filterAll = await get('/todos?filter=all');
      expect(filterAll.status).toBe(200);
      expect(filterAll.headers.get('X-Todo-Api-Version')).toBe('1');
      expect(await filterAll.json()).toEqual([
        { id: 1, title: 'Купить хлеб', done: true },
        { id: 2, title: 'Позвонить врачу', done: false },
      ]);

      const open = await get('/todos?filter=open');
      expect(open.status).toBe(200);
      expect(open.headers.get('X-Todo-Api-Version')).toBe('1');
      expect(await open.json()).toEqual([{ id: 2, title: 'Позвонить врачу', done: false }]);

      const done = await get('/todos?filter=done');
      expect(done.status).toBe(200);
      expect(done.headers.get('X-Todo-Api-Version')).toBe('1');
      expect(await done.json()).toEqual([{ id: 1, title: 'Купить хлеб', done: true }]);
    });

    it('keeps the previous response for an unknown filter and extra query parameters', async () => {
      await addTodo('a');
      await addTodo('b');
      await post('/todos/1/complete');

      const unknown = await get('/todos?filter=unknown');
      expect(unknown.status).toBe(200);
      expect(unknown.headers.get('X-Todo-Api-Version')).toBe('1');
      expect(await unknown.json()).toEqual([
        { id: 1, title: 'a', done: true },
        { id: 2, title: 'b', done: false },
      ]);

      const extra = await get('/todos?limit=1&sort=desc');
      expect(extra.status).toBe(200);
      expect(extra.headers.get('X-Todo-Api-Version')).toBe('1');
      expect(await extra.json()).toEqual([
        { id: 1, title: 'a', done: true },
        { id: 2, title: 'b', done: false },
      ]);
    });

    it('keeps the header and the body stable on repeated reads', async () => {
      await addTodo('a');

      const first = await get('/todos');
      const second = await get('/todos');
      const firstBody = await first.text();
      const secondBody = await second.text();

      expect(first.headers.get('X-Todo-Api-Version')).toBe('1');
      expect(second.headers.get('X-Todo-Api-Version')).toBe('1');
      expect(firstBody).toBe(secondBody);
      expect(firstBody).toBe('[{"id":1,"title":"a","done":false}]');
    });

    it('does not add the version header to other routes and errors', async () => {
      const stats = await get('/todos/stats');
      expect(stats.status).toBe(200);
      expect(stats.headers.get('X-Todo-Api-Version')).toBeNull();

      const created = await post('/todos', { title: 'a' });
      expect(created.status).toBe(201);
      expect(created.headers.get('X-Todo-Api-Version')).toBeNull();

      const completed = await post('/todos/1/complete');
      expect(completed.status).toBe(200);
      expect(completed.headers.get('X-Todo-Api-Version')).toBeNull();

      const missing = await get('/todos/unknown');
      expect(missing.status).toBe(404);
      expect(missing.headers.get('X-Todo-Api-Version')).toBeNull();
    });
  });
});
