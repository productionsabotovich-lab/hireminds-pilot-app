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

  describe('GET /health', () => {
    it('returns ok with a JSON content type', async () => {
      const res = await get('/health');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(await res.text()).toBe('{"status":"ok"}');
      expect(await (await get('/health')).json()).toEqual({ status: 'ok' });
    });

    it('returns the same answer repeatedly and keeps the todos unchanged', async () => {
      await addTodo('Купить хлеб');
      await post('/todos/1/complete');

      const before = await (await get('/todos')).text();
      const statsBefore = await (await get('/todos/stats')).text();

      const first = await get('/health');
      const second = await get('/health');
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(await first.text()).toBe('{"status":"ok"}');
      expect(await second.text()).toBe('{"status":"ok"}');

      const after = await (await get('/todos')).text();
      const statsAfter = await (await get('/todos/stats')).text();
      expect(after).toBe(before);
      expect(statsAfter).toBe(statsBefore);

      const next = await post('/todos', { title: 'Позвонить врачу' });
      expect(next.status).toBe(201);
      expect(await next.json()).toEqual({ id: 2, title: 'Позвонить врачу', done: false });
    });

    it('ignores query parameters', async () => {
      const plain = await (await get('/health')).text();
      const probed = await (await get('/health?probe=1')).text();
      expect(probed).toBe(plain);
      expect(probed).toBe('{"status":"ok"}');
    });

    it('keeps the existing 404 for other paths and methods', async () => {
      const trailingSlash = await get('/health/');
      expect(trailingSlash.status).toBe(404);
      expect(await trailingSlash.text()).toBe('{"error":"not found"}');

      const otherCase = await get('/Health');
      expect(otherCase.status).toBe(404);
      expect(await otherCase.text()).toBe('{"error":"not found"}');

      const posted = await post('/health');
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
