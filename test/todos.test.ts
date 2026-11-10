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
  it('counts an empty list', () => {
    expect(todoStats(emptyList())).toEqual({ total: 0, open: 0, done: 0 });
  });

  it('counts only open todos', () => {
    let { list } = addTodo(emptyList(), 'a');
    list = addTodo(list, 'b').list;
    expect(todoStats(list)).toEqual({ total: 2, open: 2, done: 0 });
  });

  it('counts mixed open and completed todos', () => {
    let { list } = addTodo(emptyList(), 'a');
    list = addTodo(list, 'b').list;
    list = addTodo(list, 'c').list;
    list = completeTodo(list, 2);
    expect(todoStats(list)).toEqual({ total: 3, open: 2, done: 1 });
  });

  it('counts all completed todos', () => {
    let { list } = addTodo(emptyList(), 'a');
    list = addTodo(list, 'b').list;
    list = completeTodo(completeTodo(list, 1), 2);
    expect(todoStats(list)).toEqual({ total: 2, open: 0, done: 2 });
  });

  it('preserves the list, items, and their references across repeated calls', () => {
    const list = {
      nextId: 42,
      items: [
        { id: 7, title: 'open', done: false },
        { id: 19, title: 'completed', done: true },
      ],
    };
    const snapshot = structuredClone(list);
    const items = list.items;
    const references = [...items];
    items.forEach(Object.freeze);
    Object.freeze(items);
    Object.freeze(list);

    expect(todoStats(list)).toEqual({ total: 2, open: 1, done: 1 });
    expect(todoStats(list)).toEqual({ total: 2, open: 1, done: 1 });
    expect(list).toEqual(snapshot);
    expect(list.items).toBe(items);
    list.items.forEach((item, index) => expect(item).toBe(references[index]));
  });
});
