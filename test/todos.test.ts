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
  it.each([
    { states: [], expected: { total: 0, open: 0, done: 0 } },
    { states: [true, false, false], expected: { total: 3, open: 2, done: 1 } },
    { states: [true, true, true], expected: { total: 3, open: 0, done: 3 } },
    { states: [false, false, false], expected: { total: 3, open: 3, done: 0 } },
  ])('counts items with completion states $states', ({ states, expected }) => {
    const list = {
      nextId: states.length + 1,
      items: states.map((done, index) => ({ id: index + 1, title: `todo ${index}`, done })),
    };
    expect(todoStats(list)).toEqual(expected);
  });

  it('counts a completed item only once after repeated completion', () => {
    const { list } = addTodo(emptyList(), 'a');
    const completed = completeTodo(completeTodo(list, 1), 1);
    expect(todoStats(completed)).toEqual({ total: 1, open: 0, done: 1 });
  });

  it('preserves the list, array, item references and values across repeated calls', () => {
    let { list } = addTodo(emptyList(), 'a');
    list = addTodo(list, 'b').list;
    list = completeTodo(list, 1);
    const originalList = list;
    const originalItems = list.items;
    const itemReferences = [...list.items];
    const snapshot = structuredClone(list);

    expect(todoStats(list)).toEqual({ total: 2, open: 1, done: 1 });
    expect(todoStats(list)).toEqual({ total: 2, open: 1, done: 1 });
    expect(list).toEqual(snapshot);
    expect(list).toBe(originalList);
    expect(list.items).toBe(originalItems);
    list.items.forEach((item, index) => expect(item).toBe(itemReferences[index]));
  });
});
