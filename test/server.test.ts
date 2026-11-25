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

  describe('GET /todos/stats.tsv', () => {
    it('returns the header row and zero counters for an empty list', async () => {
      const res = await get('/todos/stats.tsv');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/tab-separated-values; charset=utf-8');
      expect(await res.text()).toBe('total\topen\tdone\n0\t0\t0\n');
    });

    it('returns counters of a mixed list in the header order', async () => {
      await addTodo('a');
      await addTodo('b');
      await addTodo('c');
      await post('/todos/1/complete');

      const res = await get('/todos/stats.tsv');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('total\topen\tdone\n3\t2\t1\n');
    });

    it('matches the JSON statistics for the same list', async () => {
      await addTodo('a');
      await addTodo('b');
      await addTodo('c');
      await post('/todos/2/complete');

      const stats = (await (await get('/todos/stats')).json()) as {
        total: number;
        open: number;
        done: number;
      };
      const res = await get('/todos/stats.tsv');
      expect(await res.text()).toBe(`total\topen\tdone\n${stats.total}\t${stats.open}\t${stats.done}\n`);
    });

    it('reflects the current state of the list', async () => {
      await addTodo('a');
      expect(await (await get('/todos/stats.tsv')).text()).toBe('total\topen\tdone\n1\t1\t0\n');

      await post('/todos/1/complete');
      expect(await (await get('/todos/stats.tsv')).text()).toBe('total\topen\tdone\n1\t0\t1\n');

      await addTodo('b');
      expect(await (await get('/todos/stats.tsv')).text()).toBe('total\topen\tdone\n2\t1\t1\n');
    });

    it('does not change the todos and returns the same body on repeated reads', async () => {
      await addTodo('a');
      await addTodo('b');
      await post('/todos/1/complete');

      const before = await (await get('/todos')).text();
      const first = await (await get('/todos/stats.tsv')).text();
      const second = await (await get('/todos/stats.tsv')).text();
      const after = await (await get('/todos')).text();

      expect(after).toBe(before);
      expect(second).toBe(first);
      expect(first).toBe('total\topen\tdone\n2\t1\t1\n');
    });

    it('ignores query parameters', async () => {
      await addTodo('a');
      await post('/todos/1/complete');

      const plain = await (await get('/todos/stats.tsv')).text();
      const filtered = await (await get('/todos/stats.tsv?filter=open')).text();
      const unknown = await (await get('/todos/stats.tsv?unknown=1')).text();
      expect(filtered).toBe(plain);
      expect(unknown).toBe(plain);
      expect(plain).toBe('total\topen\tdone\n1\t0\t1\n');
    });

    it('keeps the existing 404 for non-GET methods', async () => {
      const res = await post('/todos/stats.tsv');
      expect(res.status).toBe(404);
      expect(await res.text()).toBe('{"error":"not found"}');
    });

    it('keeps the existing 404 for a trailing slash', async () => {
      const res = await get('/todos/stats.tsv/');
      expect(res.status).toBe(404);
      expect(await res.text()).toBe('{"error":"not found"}');
    });

    // Отдельная проверка точного тела для табличного импорта: сравнение полной
    // строки без trim и нормализации переводов строк отклоняет отсутствие LF,
    // двойной LF, CRLF, BOM, лишние пробелы и колонки.
    it('returns exactly the body a line-based importer expects', async () => {
      const empty = await get('/todos/stats.tsv');
      expect(empty.status).toBe(200);
      expect(Buffer.from(await empty.arrayBuffer())).toEqual(
        Buffer.from('total\topen\tdone\n0\t0\t0\n', 'utf8'),
      );

      await addTodo('a');
      await addTodo('b');
      await addTodo('c');
      await post('/todos/1/complete');

      const res = await get('/todos/stats.tsv');
      expect(res.status).toBe(200);
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes).toEqual(Buffer.from('total\topen\tdone\n3\t2\t1\n', 'utf8'));

      const body = bytes.toString('utf8');
      expect(body).toBe('total\topen\tdone\n3\t2\t1\n');
      expect(body.endsWith('\n')).toBe(true);
      expect(body.endsWith('\n\n')).toBe(false);
      expect(body.includes('\r')).toBe(false);
      expect(body.startsWith('\uFEFF')).toBe(false);
      expect(body.split('\n')).toEqual(['total\topen\tdone', '3\t2\t1', '']);
      expect(body.split('\n').slice(0, 2).map((line) => line.split('\t'))).toEqual([
        ['total', 'open', 'done'],
        ['3', '2', '1'],
      ]);
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
