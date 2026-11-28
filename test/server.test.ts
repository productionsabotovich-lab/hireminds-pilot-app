// HTTP-поведение маршрутов. Состояние `state` — переменная модуля src/server.ts,
// поэтому перед каждым кейсом реестр модулей сбрасывается и модуль импортируется заново.
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Ожидаемая версия читается из package.json независимо от реализации маршрута.
const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
) as { version: string };

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

  describe('GET /version', () => {
    it('returns the version from package.json', async () => {
      const res = await get('/version');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(await res.text()).toBe(JSON.stringify({ version: packageJson.version }));
    });

    it('returns the version as the only field', async () => {
      const body = (await (await get('/version')).json()) as Record<string, unknown>;
      expect(Object.keys(body)).toEqual(['version']);
      expect(typeof body.version).toBe('string');
      expect(body.version).toBe(packageJson.version);
    });

    it('ignores query parameters', async () => {
      const plain = await (await get('/version')).text();
      const withQuery = await (await get('/version?probe=1')).text();
      expect(withQuery).toBe(plain);
      expect(withQuery).toBe(JSON.stringify({ version: packageJson.version }));
    });

    it('keeps the existing 404 for other methods and paths', async () => {
      const posted = await post('/version');
      expect(posted.status).toBe(404);
      expect(await posted.text()).toBe('{"error":"not found"}');

      for (const path of ['/version/', '/Version']) {
        const res = await get(path);
        expect(res.status).toBe(404);
        expect(await res.text()).toBe('{"error":"not found"}');
      }
    });

    it('does not change the todos', async () => {
      await addTodo('a');
      await addTodo('b');
      await post('/todos/1/complete');

      const before = await (await get('/todos')).text();
      const statsBefore = await (await get('/todos/stats')).text();

      expect((await get('/version')).status).toBe(200);

      expect(await (await get('/todos')).text()).toBe(before);
      expect(await (await get('/todos/stats')).text()).toBe(statsBefore);
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
