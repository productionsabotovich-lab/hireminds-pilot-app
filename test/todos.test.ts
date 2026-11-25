import { describe, expect, it } from 'vitest';
import { addTodo, completeTodo, emptyList, listTodos, parseLimit, todoStats } from '../src/todos.js';

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

describe('listTodos with limit', () => {
  // Смешанный список из критериев приёмки: A и C выполнены, B и D открыты.
  function mixedList(): ReturnType<typeof addTodo>['list'] {
    let { list } = addTodo(emptyList(), 'A');
    list = addTodo(list, 'B').list;
    list = addTodo(list, 'C').list;
    list = addTodo(list, 'D').list;
    list = completeTodo(list, 1);
    list = completeTodo(list, 3);
    return list;
  }

  it('returns the whole list without a limit', () => {
    expect(listTodos(mixedList()).map((t) => t.title)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('returns the first items of the list', () => {
    expect(listTodos(mixedList(), 'all', 2).map((t) => t.title)).toEqual(['A', 'B']);
  });

  it('applies the filter before the limit', () => {
    expect(listTodos(mixedList(), 'open', 1).map((t) => t.title)).toEqual(['B']);
    expect(listTodos(mixedList(), 'done', 1).map((t) => t.title)).toEqual(['A']);
  });

  it('returns all matching items when there are fewer than the limit', () => {
    expect(listTodos(mixedList(), 'open', 2).map((t) => t.title)).toEqual(['B', 'D']);
    expect(listTodos(mixedList(), 'open', 10).map((t) => t.title)).toEqual(['B', 'D']);
    expect(listTodos(mixedList(), 'done', 10).map((t) => t.title)).toEqual(['A', 'C']);
  });

  it('returns an empty list for an empty list and for no matches', () => {
    expect(listTodos(emptyList(), 'all', 5)).toEqual([]);
    expect(listTodos(emptyList(), 'open', 5)).toEqual([]);
    const allOpen = addTodo(addTodo(emptyList(), 'A').list, 'B').list;
    expect(listTodos(allOpen, 'done', 5)).toEqual([]);
  });

  it('keeps the shape and the order of the matching todos', () => {
    expect(listTodos(mixedList(), 'open', 1)).toEqual([{ id: 2, title: 'B', done: false }]);
  });

  it('does not mutate the list', () => {
    const list = mixedList();
    const items = list.items;
    const nextId = list.nextId;

    listTodos(list, 'all', 2);
    listTodos(list, 'open', 1);
    listTodos(list, 'done', 1);

    expect(list.items).toBe(items);
    expect(list.nextId).toBe(nextId);
    expect(list.items.map((t) => t.title)).toEqual(['A', 'B', 'C', 'D']);
    expect(list.items.map((t) => t.done)).toEqual([true, false, true, false]);
  });
});

describe('parseLimit', () => {
  it('returns undefined when the parameter is absent', () => {
    expect(parseLimit(null)).toBeUndefined();
  });

  it('accepts a positive safe integer', () => {
    expect(parseLimit('1')).toBe(1);
    expect(parseLimit('2')).toBe(2);
    expect(parseLimit('9007199254740991')).toBe(9007199254740991);
  });

  it('accepts leading zeros', () => {
    expect(parseLimit('01')).toBe(1);
  });

  it('rejects values that are not a positive safe integer', () => {
    const invalid = ['', '0', '-1', '1.5', '+1', ' 1', '1 ', '1e2', '0x10', 'abc', '2abc', '9007199254740992'];
    for (const value of invalid) {
      expect(() => parseLimit(value)).toThrow('limit must be a positive safe integer');
    }
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
