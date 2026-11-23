// HTTP-поведение маршрутов. Состояние `state` — переменная модуля src/server.ts,
// поэтому перед каждым кейсом реестр модулей сбрасывается и модуль импортируется заново.
import { createServer, type Server } from 'node:http';
import { connect } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('server routes', () => {
  let server: Server;
  let baseUrl: string;
  let port: number;

  beforeEach(async () => {
    vi.resetModules();
    const { handle } = await import('../src/server.js');
    server = createServer(handle);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('server address is not available');
    port = address.port;
    baseUrl = `http://127.0.0.1:${port}`;
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

  async function head(path: string): Promise<Response> {
    return fetch(`${baseUrl}${path}`, { method: 'HEAD' });
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

  // Сырой запрос через node:net: HTTP-клиент умеет скрывать тело HEAD-запроса,
  // поэтому байты на проводе проверяются напрямую. Ожидание ограничено таймаутом,
  // соединение закрывается при любом исходе.
  async function rawRequest(method: string, path: string): Promise<string> {
    const socket = connect(port, '127.0.0.1');
    const chunks: Buffer[] = [];
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no response for ${method} ${path}`)), 2000);
        const finish = (error?: Error): void => {
          clearTimeout(timer);
          if (error) reject(error);
          else resolve();
        };
        socket.on('data', (chunk: Buffer) => chunks.push(chunk));
        socket.once('error', finish);
        socket.once('close', () => finish());
        socket.once('connect', () => {
          socket.write(`${method} ${path} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`);
        });
      });
    } finally {
      socket.destroy();
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  function splitResponse(raw: string): { head: string; body: string } {
    const separator = raw.indexOf('\r\n\r\n');
    if (separator < 0) throw new Error(`response without a header block: ${raw}`);
    return { head: raw.slice(0, separator), body: raw.slice(separator + 4) };
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

  describe('HEAD /todos/stats', () => {
    it('answers 200 with the GET headers and without a body', async () => {
      const res = await head('/todos/stats');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(await res.text()).toBe('');

      const getRes = await get('/todos/stats');
      expect(res.headers.get('content-type')).toBe(getRes.headers.get('content-type'));
    });

    it('keeps the same contract for a list with open and done todos', async () => {
      await addTodo('Купить хлеб');
      await addTodo('Позвонить врачу');
      await post('/todos/1/complete');

      const res = await head('/todos/stats');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(await res.text()).toBe('');

      const stats = await (await get('/todos/stats')).json();
      expect(stats).toEqual({ total: 2, open: 1, done: 1 });
    });

    it('sends no body bytes on the wire', async () => {
      await addTodo('a');
      await post('/todos/1/complete');

      const raw = splitResponse(await rawRequest('HEAD', '/todos/stats'));
      expect(raw.head.split('\r\n')[0]).toBe('HTTP/1.1 200 OK');
      expect(raw.head.toLowerCase()).toContain('content-type: application/json; charset=utf-8');
      expect(raw.body).toBe('');

      const getRaw = splitResponse(await rawRequest('GET', '/todos/stats'));
      // GET отдаёт тело фрагментами (Transfer-Encoding: chunked), поэтому ищем JSON в теле.
      expect(getRaw.body).toContain('{"total":1,"open":0,"done":1}');
    });

    it('does not change the list, the statistics or the next id', async () => {
      await addTodo('a');
      await addTodo('b');
      await post('/todos/1/complete');

      const listBefore = await (await get('/todos')).text();
      const statsBefore = await (await get('/todos/stats')).text();

      expect((await head('/todos/stats')).status).toBe(200);
      expect((await head('/todos/stats')).status).toBe(200);

      const listAfter = await (await get('/todos')).text();
      const statsAfter = await (await get('/todos/stats')).text();

      expect(listAfter).toBe(listBefore);
      expect(statsAfter).toBe(statsBefore);

      const created = await post('/todos', { title: 'c' });
      expect(created.status).toBe(201);
      expect(await created.json()).toEqual({ id: 3, title: 'c', done: false });
    });

    it('ignores query parameters', async () => {
      await addTodo('a');
      await post('/todos/1/complete');

      const plain = await head('/todos/stats');
      const filtered = await head('/todos/stats?filter=open');
      const unknown = await head('/todos/stats?unknown=1');

      expect(plain.status).toBe(200);
      expect(filtered.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(filtered.headers.get('content-type')).toBe(plain.headers.get('content-type'));
      expect(unknown.headers.get('content-type')).toBe(plain.headers.get('content-type'));
      expect(await filtered.text()).toBe('');
      expect(await unknown.text()).toBe('');
    });

    it('keeps the 404 for other paths without a body', async () => {
      const res = await head('/todos/stats/');
      expect(res.status).toBe(404);
      expect(await res.text()).toBe('');

      const other = await head('/todos');
      expect(other.status).toBe(404);
      expect(await other.text()).toBe('');
    });

    it('keeps the existing 404 for POST', async () => {
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
});
