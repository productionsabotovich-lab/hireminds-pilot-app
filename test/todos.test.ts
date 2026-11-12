import { describe, expect, it } from 'vitest';
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
  it('returns zero counters for an empty list', () => {
    expect(todoStats(emptyList())).toEqual({ total: 0, open: 0, done: 0 });
  });

  it('counts open and done todos of a mixed list', () => {
    let list = addTodo(emptyList(), 'a').list;
    list = addTodo(list, 'b').list;
    list = addTodo(list, 'c').list;
    list = completeTodo(list, 2);
    expect(todoStats(list)).toEqual({ total: 3, open: 2, done: 1 });
  });

  it('counts every todo as done when all of them are completed', () => {
    let list = addTodo(emptyList(), 'a').list;
    list = addTodo(list, 'b').list;
    list = completeTodo(list, 1);
    list = completeTodo(list, 2);
    expect(todoStats(list)).toEqual({ total: 2, open: 0, done: 2 });
  });

  it('does not mutate the counted list', () => {
    let list = addTodo(emptyList(), 'a').list;
    list = addTodo(list, 'b').list;
    list = completeTodo(list, 1);
    const items = list.items;
    const nextId = list.nextId;
    const snapshot = list.items.map((item) => ({ ...item }));

    const first = todoStats(list);
    const second = todoStats(list);

    expect(first).toEqual({ total: 2, open: 1, done: 1 });
    expect(second).toEqual(first);
    expect(list.nextId).toBe(nextId);
    expect(list.items).toBe(items);
    expect(list.items).toEqual(snapshot);
    expect(list.items[0]).toBe(items[0]);
    expect(list.items[1]).toBe(items[1]);
  });

  it('does not mutate a frozen list', () => {
    let list = addTodo(emptyList(), 'a').list;
    list = addTodo(list, 'b').list;
    list = completeTodo(list, 1);
    Object.freeze(list.items);
    Object.freeze(list);
    expect(() => todoStats(list)).not.toThrow();
    expect(todoStats(list)).toEqual({ total: 2, open: 1, done: 1 });
  });
});
