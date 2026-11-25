// Список дел в памяти процесса. Чистые функции без I/O.

export type Todo = { id: number; title: string; done: boolean };

export type TodoList = { nextId: number; items: Todo[] };

export type TodoStats = { total: number; open: number; done: number };

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

// Список дел по статусу и по подстроке заголовка.
// q — буквальная подстрока заголовка, регистр игнорируется. Отсутствие или пустое
// значение ограничения не вносит, пробелы в q значимы. Порядок дел сохраняется.
export function listTodos(list: TodoList, filter: 'all' | 'open' | 'done' = 'all', q?: string): Todo[] {
  let items = list.items;
  if (filter === 'open') items = items.filter((t) => !t.done);
  if (filter === 'done') items = items.filter((t) => t.done);
  if (q !== undefined && q.length > 0) {
    const needle = q.toLowerCase();
    items = items.filter((t) => t.title.toLowerCase().includes(needle));
  }
  return items;
}

// Сводка по списку: всего, открыто и выполнено. Счёт по флагу done, вход не мутируется.
export function todoStats(list: TodoList): TodoStats {
  let done = 0;
  for (const todo of list.items) {
    if (todo.done) done += 1;
  }
  const total = list.items.length;
  return { total, open: total - done, done };
}
