import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { addTodo, completeTodo, emptyList, listTodos, todoStats } from '../src/todos.js';
import { handle } from '../src/server.js';

describe('todos', () => {
  it('adds a todo with a sequential id', () => {
    const { list, todo } = addTodo(emptyList(), ' Купить хлеб ');
    expect(todo).toEqual({ id: 1, title: 'Купить хлеб', done: false });
    expect(list.nextId).toBe(2);
  });

  it('rejects an empty title', () => {
    expect(() => addTodo(emptyList(), '   ')).toThrow('title is empty');
  });

  it('completes a todo and filters by state', () => {
    let { list } = addTodo(emptyList(), 'a');
    list = addTodo(list, 'b').list;
    list = completeTodo(list, 1);
    expect(listTodos(list, 'open').map((t) => t.title)).toEqual(['b']);
    expect(listTodos(list, 'done').map((t) => t.title)).toEqual(['a']);
    expect(listTodos(list)).toHaveLength(2);
  });

  it('fails to complete an unknown todo', () => {
    expect(() => completeTodo(emptyList(), 9)).toThrow('todo 9 not found');
  });

  it('counts an empty list', () => {
    expect(todoStats(emptyList())).toEqual({ total: 0, open: 0, done: 0 });
  });

  it('counts mixed and fully completed lists', () => {
    let { list } = addTodo(emptyList(), 'a');
    list = addTodo(list, 'b').list;
    list = completeTodo(list, 1);
    expect(todoStats(completeTodo(list, 2))).toEqual({ total: 2, open: 0, done: 2 });
    list = addTodo(list, 'c').list;
    expect(todoStats(list)).toEqual({ total: 3, open: 2, done: 1 });
  });

  it('preserves values and references on deeply frozen input', () => {
    let { list } = addTodo(emptyList(), 'a');
    list = addTodo(list, 'b').list;
    list = completeTodo(list, 1);
    list.nextId = 99;
    const before = structuredClone(list);
    const items = list.items;
    const references = [...items];
    items.forEach(Object.freeze);
    Object.freeze(items);
    Object.freeze(list);

    expect(todoStats(list)).toEqual({ total: 2, open: 1, done: 1 });
    expect(todoStats(list)).toEqual({ total: 2, open: 1, done: 1 });
    expect(list).toEqual(before);
    expect(list.items).toBe(items);
    list.items.forEach((item, index) => expect(item).toBe(references[index]));
  });
});

describe('HTTP todo statistics', () => {
  it('reflects current state without changing it and preserves existing routes', async () => {
    const server = createServer(handle);
    server.listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('missing server port');
      const base = `http://127.0.0.1:${address.port}`;
      const request = (path: string, method = 'GET', body?: unknown) => fetch(base + path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const stats = async (expected: { total: number; open: number; done: number }, query = '') => {
        const response = await request('/todos/stats' + query);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
        expect(await response.json()).toEqual(expected);
      };

      await stats({ total: 0, open: 0, done: 0 });
      for (const title of ['a', 'b']) {
        const response = await request('/todos', 'POST', { title });
        expect(response.status).toBe(201);
      }
      await stats({ total: 2, open: 2, done: 0 });
      const complete = await request('/todos/1/complete', 'POST');
      expect(complete.status).toBe(200);
      expect(await complete.json()).toEqual({ ok: true });
      await stats({ total: 2, open: 1, done: 1 });
      await stats({ total: 2, open: 1, done: 1 });
      await stats({ total: 2, open: 1, done: 1 }, '?filter=done&unused=1');
      expect((await request('/todos/1/complete', 'POST')).status).toBe(200);
      await stats({ total: 2, open: 1, done: 1 });
      expect(await (await request('/todos')).json()).toEqual([
        { id: 1, title: 'a', done: true },
        { id: 2, title: 'b', done: false },
      ]);
      expect(await (await request('/todos?filter=open')).json()).toEqual([
        { id: 2, title: 'b', done: false },
      ]);
      for (const [path, method] of [['/unknown', 'GET'], ['/todos/stats', 'POST']]) {
        const response = await request(path, method);
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: 'not found' });
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    }
  });
});
