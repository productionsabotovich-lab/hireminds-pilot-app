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
  it('reports zero stats for an empty list', () => {
    const stats = todoStats(emptyList());
    expect(stats).toEqual({ total: 0, open: 0, done: 0 });
    expect(Object.keys(stats).sort()).toEqual(['done', 'open', 'total']);
  });

  it('counts open and completed todos in a mixed list', () => {
    let list = addTodo(emptyList(), 'a').list;
    list = addTodo(list, 'b').list;
    list = addTodo(list, 'c').list;
    list = completeTodo(list, 1);

    const stats = todoStats(list);
    expect(stats).toEqual({ total: 3, open: 2, done: 1 });
    expect(Object.keys(stats).sort()).toEqual(['done', 'open', 'total']);
    expect(stats.total).toBe(stats.open + stats.done);
  });

  it('counts a list where every todo is completed', () => {
    let list = addTodo(emptyList(), 'a').list;
    list = addTodo(list, 'b').list;
    list = completeTodo(list, 1);
    list = completeTodo(list, 2);

    const stats = todoStats(list);
    expect(stats).toEqual({ total: 2, open: 0, done: 2 });
    expect(stats.total).toBe(stats.open + stats.done);
  });

  it('does not mutate the list and returns equal results on repeated calls', () => {
    let list = addTodo(emptyList(), 'a').list;
    list = addTodo(list, 'b').list;
    list = completeTodo(list, 1);

    const nextIdBefore = list.nextId;
    const itemsBefore = list.items;
    const elementsBefore = list.items.map((todo) => todo);
    const fieldsBefore = list.items.map((todo) => ({ ...todo }));

    const first = todoStats(list);
    const second = todoStats(list);

    expect(first).toEqual(second);
    expect(list.nextId).toBe(nextIdBefore);
    expect(list.items).toBe(itemsBefore);
    expect(list.items).toHaveLength(elementsBefore.length);
    list.items.forEach((todo, index) => {
      expect(todo).toBe(elementsBefore[index]);
      expect({ ...todo }).toEqual(fieldsBefore[index]);
    });
  });
});
