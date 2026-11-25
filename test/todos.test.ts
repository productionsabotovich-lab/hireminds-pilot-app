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

describe('listTodos search', () => {
  function listWithBread(): TodoList {
    let { list } = addTodo(emptyList(), 'Купить ХЛЕБ');
    list = addTodo(list, 'Хлеб для ужина').list;
    list = addTodo(list, 'Позвонить врачу').list;
    list = completeTodo(list, 2);
    return list;
  }

  it('finds todos by a case-insensitive substring of the title', () => {
    expect(listTodos(listWithBread(), 'all', 'хЛеБ').map((t) => t.id)).toEqual([1, 2]);
  });

  it('matches a substring inside a word', () => {
    expect(listTodos(listWithBread(), 'all', 'вра').map((t) => t.id)).toEqual([3]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(listTodos(listWithBread(), 'all', 'молоко')).toEqual([]);
  });

  it('combines the title search with the status filter', () => {
    expect(listTodos(listWithBread(), 'open', 'хлеб').map((t) => t.id)).toEqual([1]);
    expect(listTodos(listWithBread(), 'done', 'хлеб').map((t) => t.id)).toEqual([2]);
    expect(listTodos(listWithBread(), 'all', 'хлеб').map((t) => t.id)).toEqual([1, 2]);
  });

  it('keeps the previous behaviour when q is missing or empty', () => {
    const list = listWithBread();
    expect(listTodos(list).map((t) => t.id)).toEqual([1, 2, 3]);
    expect(listTodos(list, 'open').map((t) => t.id)).toEqual([1, 3]);
    expect(listTodos(list, 'done').map((t) => t.id)).toEqual([2]);
    expect(listTodos(list, 'all', '').map((t) => t.id)).toEqual([1, 2, 3]);
    expect(listTodos(list, 'open', '').map((t) => t.id)).toEqual([1, 3]);
  });

  it('treats spaces in q as significant', () => {
    expect(listTodos(listWithBread(), 'all', ' хлеб ')).toEqual([]);
  });

  it('searches literally, without regular expressions', () => {
    let list = addTodo(emptyList(), 'a.b').list;
    list = addTodo(list, 'axb').list;
    expect(listTodos(list, 'all', '.').map((t) => t.title)).toEqual(['a.b']);
  });

  it('does not mutate the list and keeps the order and fields of the found todos', () => {
    const list = listWithBread();
    const items = list.items;
    const elements = [...list.items];
    const nextId = list.nextId;

    const found = listTodos(list, 'all', 'хлеб');

    expect(list.nextId).toBe(nextId);
    expect(list.items).toBe(items);
    expect(list.items.every((t, i) => t === elements[i])).toBe(true);
    expect(found).toEqual([
      { id: 1, title: 'Купить ХЛЕБ', done: false },
      { id: 2, title: 'Хлеб для ужина', done: true },
    ]);
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
