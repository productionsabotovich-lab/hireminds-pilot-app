import { createServer } from 'node:http';
import { type AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
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
  it.each([
    { states: [], expected: { total: 0, open: 0, done: 0 } },
    { states: [false, true, false], expected: { total: 3, open: 2, done: 1 } },
    { states: [true, true], expected: { total: 2, open: 0, done: 2 } },
    { states: [false, false], expected: { total: 2, open: 2, done: 0 } },
  ])('counts $states', ({ states, expected }) => {
    const list: TodoList = {
      nextId: 100,
      items: states.map((done, index) => ({ id: index + 10, title: 'task', done })),
    };
    expect(todoStats(list)).toEqual(expected);
  });

  it('preserves the list, item order, values and references', () => {
    const list = addTodo(addTodo(emptyList(), 'a').list, 'b').list;
    const snapshot = structuredClone(list);
    const items = list.items;
    const references = [...items];
    items.forEach(Object.freeze);
    Object.freeze(items);
    Object.freeze(list);

    const stats = todoStats(list);
    expect(stats).toEqual({ total: 2, open: 2, done: 0 });
    expect(todoStats(list)).not.toBe(stats);
    expect(list).toEqual(snapshot);
    expect(list.items).toBe(items);
    references.forEach((todo, index) => expect(list.items[index]).toBe(todo));
  });
});

describe('GET /todos/stats', () => {
  it('reports current state without changing it and ignores query parameters', async () => {
    vi.resetModules();
    const { handle } = await import('../src/server.js');
    const server = createServer(handle);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const stats = async (expected: { total: number; open: number; done: number }, query = '') => {
      const before = await (await fetch(`${base}/todos`)).json();
      const response = await fetch(`${base}/todos/stats${query}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(await response.json()).toEqual(expected);
      expect(await (await fetch(`${base}/todos`)).json()).toEqual(before);
    };
    try {
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
      for (const filter of ['all', 'open', 'done', 'invalid']) {
        await stats({ total: 2, open: 1, done: 1 }, `?filter=${filter}&extra=1`);
      }
      expect((await fetch(`${base}/todos/stats`, { method: 'POST' })).status).toBe(404);
      expect((await fetch(`${base}/todos/unknown`)).status).toBe(404);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    }
  });
});
