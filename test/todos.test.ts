import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { addTodo, completeTodo, emptyList, listTodos, todoStats } from '../src/todos.js';

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

  it('counts open, mixed and completed lists', () => {
    let list = emptyList();
    for (const title of ['a', 'b', 'c']) list = addTodo(list, title).list;
    expect(todoStats(list)).toEqual({ total: 3, open: 3, done: 0 });
    list = completeTodo(list, 1);
    expect(todoStats(list)).toEqual({ total: 3, open: 2, done: 1 });
    list = completeTodo(completeTodo(list, 2), 3);
    expect(todoStats(list)).toEqual({ total: 3, open: 0, done: 3 });
  });

  it('does not mutate a deeply frozen input', () => {
    const list = completeTodo(addTodo(addTodo(emptyList(), 'a').list, 'b').list, 1);
    const before = structuredClone(list);
    const items = list.items;
    const references = [...items];
    list.items.forEach(Object.freeze);
    Object.freeze(list.items);
    Object.freeze(list);
    expect(todoStats(list)).toEqual({ total: 2, open: 1, done: 1 });
    expect(todoStats(list)).toEqual({ total: 2, open: 1, done: 1 });
    expect(list).toEqual(before);
    expect(list.items).toBe(items);
    list.items.forEach((item, index) => expect(item).toBe(references[index]));
  });
});

it('serves current statistics through HTTP without changing the list', async () => {
  vi.resetModules();
  const { handle } = await import('../src/server.js');
  const server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing server address');
    const base = `http://127.0.0.1:${address.port}`;
    const stats = async (expected: { total: number; open: number; done: number }, query = '') => {
      const response = await fetch(`${base}/todos/stats${query}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(await response.json()).toEqual(expected);
    };
    await stats({ total: 0, open: 0, done: 0 });
    for (const title of ['a', 'b', 'c']) {
      const response = await fetch(`${base}/todos`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      expect(response.status).toBe(201);
      await response.json();
    }
    await stats({ total: 3, open: 3, done: 0 });
    const complete = async (id: number) => {
      const response = await fetch(`${base}/todos/${id}/complete`, { method: 'POST' });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    };
    await complete(1);
    const before = await (await fetch(`${base}/todos`)).json();
    for (const query of ['', '', '?filter=open', '?filter=done', '?filter=invalid']) {
      await stats({ total: 3, open: 2, done: 1 }, query);
    }
    expect(await (await fetch(`${base}/todos`)).json()).toEqual(before);
    expect(await (await fetch(`${base}/todos?filter=open`)).json()).toEqual([
      { id: 2, title: 'b', done: false }, { id: 3, title: 'c', done: false },
    ]);
    await complete(1);
    await stats({ total: 3, open: 2, done: 1 });
    await complete(2);
    await complete(3);
    await stats({ total: 3, open: 0, done: 3 });
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const response = await fetch(`${base}/todos/stats`, { method });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'not found' });
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
