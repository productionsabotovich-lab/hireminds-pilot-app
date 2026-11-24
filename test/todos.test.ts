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

// Граница пустоты названия: отклоняется всё, что после trim() пусто,
// состояние списка при этом не меняется.
describe('addTodo title validation', () => {
  const emptyTitles = ['', '   ', '\t', '\t\t', '\n', '\n\n', '\r', '\r\n', '\t\r\n', '\u00a0'];

  function listWithOpenAndDone(): TodoList {
    let { list } = addTodo(emptyList(), 'Купить хлеб');
    list = addTodo(list, 'Позвонить врачу').list;
    list = completeTodo(list, 1);
    return list;
  }

  it.each(emptyTitles)('rejects a title of %j in an empty list', (title) => {
    expect(() => addTodo(emptyList(), title)).toThrow('title is empty');
  });

  it.each(emptyTitles)('keeps the list unchanged after rejecting a title of %j', (title) => {
    const list = listWithOpenAndDone();
    const nextId = list.nextId;
    const items = list.items;
    const elements = [...list.items];
    const values = list.items.map((todo) => ({ ...todo }));

    expect(() => addTodo(list, title)).toThrow('title is empty');

    expect(list.nextId).toBe(nextId);
    expect(list.items).toBe(items);
    expect(list.items).toHaveLength(elements.length);
    expect(list.items.every((todo, index) => todo === elements[index])).toBe(true);
    expect(list.items.map((todo) => ({ ...todo }))).toEqual(values);
  });

  it.each(emptyTitles)('does not spend the next id on a rejected title of %j', (title) => {
    const list = listWithOpenAndDone();

    expect(() => addTodo(list, title)).toThrow('title is empty');

    const { list: next, todo } = addTodo(list, 'Купить молоко');
    expect(todo).toEqual({ id: 3, title: 'Купить молоко', done: false });
    expect(next.nextId).toBe(4);
    expect(next.items).toHaveLength(3);
  });

  it('keeps the first id in an empty list after a rejected title', () => {
    expect(() => addTodo(emptyList(), '   ')).toThrow('title is empty');

    const { list, todo } = addTodo(emptyList(), 'Купить хлеб');
    expect(todo.id).toBe(1);
    expect(list.nextId).toBe(2);
  });

  it('creates a todo after a rejected title and keeps internal spaces', () => {
    const list = listWithOpenAndDone();

    expect(() => addTodo(list, '\t\r\n')).toThrow('title is empty');

    const { list: next, todo } = addTodo(list, 'Купить  хлеб');
    expect(todo).toEqual({ id: 3, title: 'Купить  хлеб', done: false });
    expect(next.nextId).toBe(4);
  });

  it('does not throw on a frozen list and keeps it unchanged', () => {
    const frozen = Object.freeze(listWithOpenAndDone());

    expect(() => addTodo(frozen, '  ')).toThrow('title is empty');

    expect(frozen.nextId).toBe(3);
    expect(frozen.items).toHaveLength(2);
    expect(frozen.items.map((todo) => todo.id)).toEqual([1, 2]);
  });
});

describe('todoStats', () => {
  function listWithOneDone(): ReturnType<typeof addTodo>['list'] {
    let { list } = addTodo(emptyList(), 'a');
    list = addTodo(list, 'b').list;
    list = completeTodo(list, 1);
    return list;
  }

  it('counts zeros for an empty list', () => {
    expect(todoStats(emptyList())).toEqual({ total: 0, open: 0, done: 0 });
  });

  it('counts open and done todos in a mixed list', () => {
    let { list } = addTodo(emptyList(), 'a');
    list = addTodo(list, 'b').list;
    list = addTodo(list, 'c').list;
    list = completeTodo(list, 1);
    expect(todoStats(list)).toEqual({ total: 3, open: 2, done: 1 });
  });

  it('counts every todo as done when all of them are completed', () => {
    let { list } = addTodo(emptyList(), 'a');
    list = addTodo(list, 'b').list;
    list = completeTodo(list, 1);
    list = completeTodo(list, 2);
    expect(todoStats(list)).toEqual({ total: 2, open: 0, done: 2 });
  });

  it('does not count a completed todo twice', () => {
    let list = listWithOneDone();
    list = completeTodo(list, 1);
    expect(todoStats(list)).toEqual({ total: 2, open: 1, done: 1 });
  });

  it('keeps total equal to open plus done', () => {
    const stats = todoStats(listWithOneDone());
    expect(stats.total).toBe(stats.open + stats.done);
    for (const value of Object.values(stats)) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it('does not mutate the list', () => {
    const list = listWithOneDone();
    const items = list.items;
    const elements = [...list.items];
    const nextId = list.nextId;

    todoStats(list);

    expect(list.nextId).toBe(nextId);
    expect(list.items).toBe(items);
    expect(list.items).toHaveLength(elements.length);
    expect(list.items.map((t) => t.id)).toEqual(elements.map((t) => t.id));
    expect(list.items.every((t, i) => t === elements[i])).toBe(true);
    expect(list.items.map((t) => ({ ...t }))).toEqual(elements.map((t) => ({ ...t })));
  });

  it('does not throw on a frozen list', () => {
    const frozen = Object.freeze(listWithOneDone());
    expect(todoStats(frozen)).toEqual({ total: 2, open: 1, done: 1 });
  });

  it('is deterministic', () => {
    const list = listWithOneDone();
    expect(todoStats(list)).toEqual(todoStats(list));
  });
});
