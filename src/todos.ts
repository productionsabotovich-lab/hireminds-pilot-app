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

// Разбор query-параметра limit: только десятичные цифры ASCII и положительное
// безопасное целое число. Отсутствие параметра — отсутствие ограничения,
// недопустимое значение — ошибка с точным текстом из контракта.
export function parseLimit(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  if (!/^[0-9]+$/.test(raw)) throw new Error('limit must be a positive safe integer');
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('limit must be a positive safe integer');
  return value;
}

// Список дел: сначала фильтр по состоянию, затем первые limit элементов результата.
// Порядок исходного списка сохраняется, вход не мутируется.
export function listTodos(list: TodoList, filter: 'all' | 'open' | 'done' = 'all', limit?: number): Todo[] {
  const matches = (todo: Todo): boolean => {
    if (filter === 'open') return !todo.done;
    if (filter === 'done') return todo.done;
    return true;
  };
  const items: Todo[] = [];
  for (const todo of list.items) {
    if (!matches(todo)) continue;
    items.push(todo);
    // Отбор прекращается, как только набрано нужное число совпадений.
    if (limit !== undefined && items.length >= limit) break;
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
