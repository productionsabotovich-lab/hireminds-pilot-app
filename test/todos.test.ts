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

  it('counts an empty list', () => {
    expect(todoStats(emptyList())).toEqual({ total: 0, open: 0, done: 0 });
  });

  it('counts mixed items and reflects additions and completions', () => {
    let list = emptyList();
    for (const title of ['a', 'b', 'c']) list = addTodo(list, title).list;
    list = completeTodo(list, 2);
    expect(todoStats(list)).toEqual({ total: 3, open: 2, done: 1 });
    listTodos(list, 'open');
    listTodos(list, 'done');
    expect(todoStats(list)).toEqual({ total: 3, open: 2, done: 1 });
    list = addTodo(list, 'd').list;
    expect(todoStats(list)).toEqual({ total: 4, open: 3, done: 1 });
    list = completeTodo(list, 1);
    expect(todoStats(list)).toEqual({ total: 4, open: 2, done: 2 });
  });

  it('counts all completed items', () => {
    let list = emptyList();
    for (const title of ['a', 'b', 'c']) list = addTodo(list, title).list;
    for (const id of [1, 2, 3]) list = completeTodo(list, id);
    expect(todoStats(list)).toEqual({ total: 3, open: 0, done: 3 });
  });

  it('does not mutate a frozen list or its items and gives repeatable results', () => {
    let list = addTodo(emptyList(), 'a').list;
    list = addTodo(list, 'b').list;
    list = completeTodo(list, 1);
    list.nextId = 100;
    const items = list.items;
    const originalItems = [...items];
    const snapshot = structuredClone(list);
    for (const todo of items) Object.freeze(todo);
    Object.freeze(items);
    Object.freeze(list);

    expect(todoStats(list)).toEqual({ total: 2, open: 1, done: 1 });
    expect(todoStats(list)).toEqual({ total: 2, open: 1, done: 1 });
    expect(list).toEqual(snapshot);
    expect(list.items).toBe(items);
    list.items.forEach((todo, index) => expect(todo).toBe(originalItems[index]));
  });
});
