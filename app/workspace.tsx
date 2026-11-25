'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

export const stages = { todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done' };
export const priorities = { low: 'Low', medium: 'Medium', high: 'High' };
export type Stage = keyof typeof stages;
export type Priority = keyof typeof priorities;
export type Assignee = { id: number; name: string };
export type User = Assignee & { role: 'staff' | 'manager' };
export type Session = { user: User | null; csrf: string };
export type Task = {
  id: number; title: string; description: string; stage: Stage; priority: Priority;
  assignee: number; assignee_name: string; due_date: string; can_edit: boolean; can_delete: boolean;
};
export type TaskDetail = Task & {
  comments: { author: string; body: string; created_at: string }[];
  activity: { actor: string; action: string; created_at: string }[];
  subtasks: string[];
};

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
export type Api = <T>(path: string, method?: Method, body?: object) => Promise<T>;
export function apiClient(csrf = ''): Api {
  return async function request<T>(path: string, method: Method = 'GET', body?: object): Promise<T> {
    const response = await fetch('/api' + path, {
      method,
      headers: method === 'GET' ? { Accept: 'application/json' } : {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf,
      },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || 'The request could not be completed.');
    return payload as T;
  };
}

export const WorkspaceContext = createContext<{ api: Api; user: User } | null>(null);
export function useWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error('The workspace requires an authenticated session.');
  return workspace;
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The request could not be completed.';
}

export function useResource<T>(load: () => Promise<T>) {
  const [state, setState] = useState<{ data?: T; error?: string }>({});
  useEffect(() => {
    let active = true;
    load().then(
      data => { if (active) setState({ data }); },
      error => { if (active) setState({ error: errorMessage(error) }); },
    );
    return () => { active = false; };
  }, [load]);
  return state;
}

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run, clearError: () => setError('') };
}

export function formValues(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return Object.fromEntries(new FormData(event.currentTarget));
}

export function go(route: string) {
  window.location.hash = route;
}

export function editable(task: Task) {
  return task.can_edit && task.stage !== 'done';
}

export function formatDate(date: string, time = false) {
  const parsed = new Date(time ? date : date + 'T00:00:00');
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('en-ZA', time
    ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(parsed);
}

export function Heading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  useEffect(() => { document.title = title + ' | Meridian Workflow'; }, [title]);
  return <header className="page-heading">
    <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
    {action}
  </header>;
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="panel"><h2>{title}</h2>{children}</section>;
}

export function Message({ children }: { children: string }) {
  return <p className="message" role="alert">{children}</p>;
}

export function Loading() {
  return <p className="loading" role="status">Loading…</p>;
}

export function LoadError({ message }: { message: string }) {
  return <><Heading title="Unable to load this page" /><Message>{message}</Message>
    <a href="#dashboard">Return to dashboard</a></>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function Select({ name, choices, value, empty, required }: {
  name: string; choices: [string | number, string][]; value?: string | number | null;
  empty?: string; required?: boolean;
}) {
  return <select name={name} defaultValue={value ?? ''} required={required}>
    {empty && <option value="">{empty}</option>}
    {choices.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
  </select>;
}

export function Badge({ value }: { value: Priority | Stage }) {
  const labels = { ...stages, ...priorities };
  return <span className={'badge ' + value}>{labels[value]}</span>;
}
