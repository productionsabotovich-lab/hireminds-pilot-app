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

  describe('GET /todos search', () => {
    async function addBreadTodos(): Promise<void> {
      await addTodo('Купить ХЛЕБ');
      await addTodo('Хлеб для ужина');
      await addTodo('Позвонить врачу');
      await post('/todos/2/complete');
    }

    async function search(params: Record<string, string>): Promise<Response> {
      return get(`/todos?${new URLSearchParams(params).toString()}`);
    }

    it('finds todos by a case-insensitive substring of the title', async () => {
      await addBreadTodos();

      const res = await search({ q: 'хЛеБ' });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(await res.json()).toEqual([
        { id: 1, title: 'Купить ХЛЕБ', done: false },
        { id: 2, title: 'Хлеб для ужина', done: true },
      ]);
    });

    it('matches a substring inside a word', async () => {
      await addBreadTodos();

      const res = await search({ q: 'вра' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([{ id: 3, title: 'Позвонить врачу', done: false }]);
    });

    it('returns an empty array when nothing matches', async () => {
      await addBreadTodos();

      const res = await search({ q: 'молоко' });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(await res.text()).toBe('[]');
    });

    it('combines the search with the status filter', async () => {
      await addBreadTodos();

      const open = await search({ filter: 'open', q: 'хлеб' });
      expect(open.status).toBe(200);
      expect(await open.json()).toEqual([{ id: 1, title: 'Купить ХЛЕБ', done: false }]);

      const done = await search({ filter: 'done', q: 'хлеб' });
      expect(done.status).toBe(200);
      expect(await done.json()).toEqual([{ id: 2, title: 'Хлеб для ужина', done: true }]);

      const all = await search({ filter: 'all', q: 'хлеб' });
      expect(await all.json()).toEqual([
        { id: 1, title: 'Купить ХЛЕБ', done: false },
        { id: 2, title: 'Хлеб для ужина', done: true },
      ]);

      const unknown = await search({ filter: 'unknown', q: 'хлеб' });
      expect(await unknown.json()).toEqual([
        { id: 1, title: 'Купить ХЛЕБ', done: false },
        { id: 2, title: 'Хлеб для ужина', done: true },
      ]);
    });

    it('does not depend on the order of the query parameters', async () => {
      await addBreadTodos();

      const first = await get('/todos?filter=open&q=%D1%85%D0%BB%D0%B5%D0%B1');
      const second = await get('/todos?q=%D1%85%D0%BB%D0%B5%D0%B1&filter=open');
      const firstBody = await first.text();
      expect(firstBody).toBe('[{"id":1,"title":"Купить ХЛЕБ","done":false}]');
      expect(await second.text()).toBe(firstBody);
    });

    it('keeps the list unchanged when q is missing or empty', async () => {
      await addBreadTodos();

      const plain = await (await get('/todos')).text();
      const emptyValue = await (await get('/todos?q=')).text();
      const noValue = await (await get('/todos?q')).text();
      expect(emptyValue).toBe(plain);
      expect(noValue).toBe(plain);

      const open = await (await get('/todos?filter=open')).text();
      const openEmpty = await (await get('/todos?filter=open&q=')).text();
      expect(openEmpty).toBe(open);

      const done = await (await get('/todos?filter=done')).text();
      const doneEmpty = await (await get('/todos?filter=done&q')).text();
      expect(doneEmpty).toBe(done);
    });

    it('returns an empty array for an empty storage with any q', async () => {
      const res = await search({ q: 'хлеб' });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('[]');
    });

    it('matches latin titles case-insensitively', async () => {
      await addTodo('Read TypeScript');

      const res = await search({ q: 'typesCRIPT' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([{ id: 1, title: 'Read TypeScript', done: false }]);
    });

    it('searches literally, without regular expressions', async () => {
      await addTodo('a.b');
      await addTodo('axb');

      const res = await search({ q: '.' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([{ id: 1, title: 'a.b', done: false }]);
    });

    it('decodes a plus sign as a space and percent-encoding as a literal plus', async () => {
      await addTodo('a b');
      await addTodo('a+b');

      const space = await get('/todos?q=a+b');
      expect(space.status).toBe(200);
      expect(await space.json()).toEqual([{ id: 1, title: 'a b', done: false }]);

      const plus = await get('/todos?q=a%2Bb');
      expect(plus.status).toBe(200);
      expect(await plus.json()).toEqual([{ id: 2, title: 'a+b', done: false }]);
    });

    it('keeps spaces in q significant', async () => {
      await addBreadTodos();

      const res = await get('/todos?q=%20%D1%85%D0%BB%D0%B5%D0%B1%20');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('[]');
    });

    it('uses the first value of a repeated q', async () => {
      await addBreadTodos();

      const res = await get('/todos?q=%D0%BC%D0%BE%D0%BB%D0%BE%D0%BA%D0%BE&q=%D1%85%D0%BB%D0%B5%D0%B1');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('[]');
    });

    it('does not change the todos and the stats', async () => {
      await addBreadTodos();

      const before = await (await get('/todos')).text();
      const statsBefore = await (await get('/todos/stats')).text();

      await search({ q: 'молоко' });
      await search({ filter: 'open', q: 'хлеб' });
      await get('/todos?q=%D1%85%D0%BB%D0%B5%D0%B1');

      expect(await (await get('/todos')).text()).toBe(before);
      expect(await (await get('/todos/stats')).text()).toBe(statsBefore);
      expect(statsBefore).toBe('{"total":3,"open":2,"done":1}');
    });

    it('keeps the stats independent of q', async () => {
      await addBreadTodos();

      const plain = await (await get('/todos/stats')).text();
      const filtered = await (await get('/todos/stats?q=%D0%BC%D0%BE%D0%BB%D0%BE%D0%BA%D0%BE&filter=open')).text();
      expect(filtered).toBe(plain);
      expect(filtered).toBe('{"total":3,"open":2,"done":1}');
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
