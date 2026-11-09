// Список дел в памяти процесса. Чистые функции без I/O.

export type Todo = { id: number; title: string; done: boolean };

export type TodoList = { nextId: number; items: Todo[] };

export function todoStats(list: TodoList): { total: number; open: number; done: number } {
  let open = 0;
  let done = 0;
  for (const todo of list.items) {
    if (todo.done === true) done++;
    if (todo.done === false) open++;
  }
  return { total: list.items.length, open, done };
}

export function emptyList(): TodoList {
  return { nextId: 1, items: [] };
}

export function addTodo(list: TodoList, title: string): { list: TodoList; todo: Todo } {
  const trimmed = title.trim();
  if (trimmed.length === 0) throw new Error('title is empty');
  const todo: Todo = { id: list.nextId, title: trimmed, done: false };
  return { list: { nextId: list.nextId + 1, items: [...list.items, todo] }, todo };
}

export function completeTodo(list: TodoList, id: number): TodoList {
  if (!list.items.some((t) => t.id === id)) throw new Error(`todo ${id} not found`);
  return { ...list, items: list.items.map((t) => (t.id === id ? { ...t, done: true } : t)) };
}

export function listTodos(list: TodoList, filter: 'all' | 'open' | 'done' = 'all'): Todo[] {
  if (filter === 'open') return list.items.filter((t) => !t.done);
  if (filter === 'done') return list.items.filter((t) => t.done);
  return list.items;
}
