import { getTasksToken } from './google-auth';

const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';

export type GoogleTask = {
  id: string;
  title: string;
  status: 'needsAction' | 'completed';
  due?: string;
  notes?: string;
  updated: string;
};

type TaskList = {
  id: string;
  title: string;
};

async function tasksFetch(path: string, opts?: RequestInit) {
  const token = await getTasksToken();
  const res = await fetch(`${TASKS_API}${path}`, {
    ...opts,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...opts?.headers },
  });
  if (!res.ok) throw new Error(`Tasks API ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

/** Find the "Tana Tasks" list or create it */
export async function getOrCreateTaskList(name: string): Promise<string> {
  const data = await tasksFetch('/users/@me/lists');
  const lists: TaskList[] = data?.items || [];
  const existing = lists.find((l) => l.title === name);
  if (existing) return existing.id;

  const created = await tasksFetch('/users/@me/lists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: name }),
  });
  return created.id;
}

/** List all tasks from a task list (including completed, excluding deleted) */
export async function listGoogleTasks(taskListId: string): Promise<GoogleTask[]> {
  const all: GoogleTask[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      showCompleted: 'true',
      showHidden: 'true',
      maxResults: '100',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const data = await tasksFetch(`/lists/${encodeURIComponent(taskListId)}/tasks?${params}`);
    for (const item of data?.items || []) {
      if (item.deleted) continue;
      all.push({
        id: item.id,
        title: item.title || '',
        status: item.status,
        due: item.due,
        notes: item.notes,
        updated: item.updated,
      });
    }
    pageToken = data?.nextPageToken;
  } while (pageToken);

  return all;
}

/** Create a task in a task list */
export async function createGoogleTask(
  taskListId: string,
  data: { title: string; due?: string; notes?: string }
): Promise<GoogleTask> {
  const body: Record<string, unknown> = { title: data.title };
  if (data.due) body.due = data.due;
  if (data.notes) body.notes = data.notes;

  const result = await tasksFetch(`/lists/${encodeURIComponent(taskListId)}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return {
    id: result.id,
    title: result.title,
    status: result.status,
    due: result.due,
    notes: result.notes,
    updated: result.updated,
  };
}

/** Update a task */
export async function updateGoogleTask(
  taskListId: string,
  taskId: string,
  data: { title?: string; due?: string | null; notes?: string; status?: 'needsAction' | 'completed' }
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (data.title !== undefined) body.title = data.title;
  if (data.due !== undefined) body.due = data.due;
  if (data.notes !== undefined) body.notes = data.notes;
  if (data.status !== undefined) body.status = data.status;

  await tasksFetch(`/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Delete a task */
export async function deleteGoogleTask(taskListId: string, taskId: string): Promise<void> {
  await tasksFetch(`/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
  });
}
