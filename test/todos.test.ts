import { createServer } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { addTodo, completeTodo, emptyList, listTodos, todoStats, type TodoList } from '../src/todos.js';

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
});

describe('todoStats', () => {
  it('counts an empty list', () => {
    expect(todoStats(emptyList())).toEqual({ total: 0, open: 0, done: 0 });
  });

  it('counts mixed open and completed todos', () => {
    let { list } = addTodo(emptyList(), 'a');
    list = addTodo(list, 'b').list;
    list = addTodo(list, 'c').list;
    list = completeTodo(list, 2);
    expect(todoStats(list)).toEqual({ total: 3, open: 2, done: 1 });
  });

  it('counts an entirely completed list', () => {
    let { list } = addTodo(emptyList(), 'a');
    list = addTodo(list, 'b').list;
    list = completeTodo(completeTodo(list, 1), 2);
    expect(todoStats(list)).toEqual({ total: 2, open: 0, done: 2 });
  });

  it('preserves the full input and item references on repeated calls', () => {
    const list: TodoList = {
      nextId: 8,
      items: [
        { id: 7, title: 'second', done: false },
        { id: 3, title: 'first', done: true },
      ],
    };
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
    references.forEach((item, index) => expect(list.items[index]).toBe(item));
  });
});

describe('GET /todos/stats', () => {
  it('returns current counts without filtering or changing state', async () => {
    const { handle } = await import('../src/server.js');
    const server = createServer(handle);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('missing server address');
      const base = `http://127.0.0.1:${address.port}`;
      const stats = async (expected: { total: number; open: number; done: number }, query = '') => {
        const response = await fetch(`${base}/todos/stats${query}`);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
        expect(await response.json()).toEqual(expected);
      };
      await stats({ total: 0, open: 0, done: 0 });
      for (const title of ['a', 'b']) {
        const response = await fetch(`${base}/todos`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title }),
        });
        expect(response.status).toBe(201);
        await response.json();
      }
      await stats({ total: 2, open: 2, done: 0 });
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await fetch(`${base}/todos/1/complete`, { method: 'POST' });
        expect(response.status).toBe(200);
        await response.json();
        await stats({ total: 2, open: 1, done: 1 });
      }
      await stats({ total: 2, open: 1, done: 1 }, '?filter=done');
      await stats({ total: 2, open: 1, done: 1 });
      const response = await fetch(`${base}/todos`);
      expect(await response.json()).toEqual([
        { id: 1, title: 'a', done: true },
        { id: 2, title: 'b', done: false },
      ]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    }
  });
});
