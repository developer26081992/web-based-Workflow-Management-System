'use client';

import { Grid2X2, List, Plus } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { TaskDetails } from './task-details';
import {
  apiClient, Badge, editable, Field, formValues, formatDate, go, Heading, Loading, LoadError, Message,
  priorities, Select, stages, useAction, useResource, useWorkspace, WorkspaceContext,
} from './workspace';
import type { Api, Assignee, Session, Stage, Task, TaskDetail, User } from './workspace';

let pendingSession: Promise<Session> | undefined;
function fetchSession() {
  pendingSession ??= apiClient()<Session>('/session').finally(() => { pendingSession = undefined; });
  return pendingSession;
}

function Brand() {
  return <div className="brand"><span className="brand-mark" aria-hidden="true" />
    <div><strong>Meridian</strong><span>Consulting Group</span></div>
  </div>;
}

function Auth({ api, register, onSession }: {
  api: Api; register: boolean; onSession: (session: Session) => void;
}) {
  const action = useAction();
  const title = register ? 'Create an account' : 'Sign in';
  const submit = register ? 'Register' : 'Sign in';
  useEffect(() => { document.title = title + ' | Meridian Workflow'; }, [title]);
  return <main id="main" className="auth" tabIndex={-1}>
    <div className="auth-brand"><Brand /></div>
    <section className="auth-panel">
      <p className="eyebrow">Workflow workspace</p><h1>{title}</h1>
      <p className="muted">{register ? 'Register to join the workspace as staff.' : 'Track assignments and review completed work.'}</p>
      <form className="stack grid gap-3.5" onSubmit={event => {
        const fields = formValues(event);
        void action.run(async () => {
          const session = await api<Session>(register ? '/register' : '/login', 'POST', fields);
          onSession(session);
          go(session.user ? 'dashboard' : 'login');
        });
      }}>
        {register && <Field label="Full name"><input name="name" required minLength={2} maxLength={100} autoComplete="name" /></Field>}
        <Field label="Email address"><input name="email" type="email" required maxLength={254} autoComplete="email" /></Field>
        <Field label="Password"><input name="password" type="password" required minLength={register ? 12 : undefined}
          maxLength={128} autoComplete={register ? 'new-password' : 'current-password'}
          aria-describedby={register ? 'password-guidance' : undefined} /></Field>
        {register && <p id="password-guidance" className="muted">Use at least 12 characters.</p>}
        <button type="submit" className="button primary" disabled={action.busy}>{submit}</button>
        <Message>{action.error}</Message>
      </form>
      <p className="auth-switch">
        {register ? 'Already registered? ' : 'New to Meridian Workflow? '}
        <a href={register ? '#login' : '#register'}>{register ? 'Sign in' : 'Register'}</a>
      </p>
    </section>
  </main>;
}

function Shell({ current, onSession, children }: {
  current: 'dashboard' | 'tasks'; onSession: (session: Session) => void; children: ReactNode;
}) {
  const { api, user } = useWorkspace();
  const action = useAction();
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('');
  return <div className="layout">
    <aside className="sidebar">
      <Brand />
      <nav aria-label="Workspace">
        <a href="#dashboard" aria-current={current === 'dashboard' ? 'page' : undefined}>
          <Grid2X2 size={18} className="nav-icon" aria-hidden="true" />Dashboard
        </a>
        <a href="#tasks" aria-current={current === 'tasks' ? 'page' : undefined}>
          <List size={18} className="nav-icon" aria-hidden="true" />Tasks
        </a>
      </nav>
      <div className="account">
        <span className="avatar" aria-hidden="true">{initials}</span>
        <div className="account-label"><strong>{user.name}</strong><span>{user.role === 'manager' ? 'Manager' : 'Staff'}</span></div>
        <button type="button" className="signout" disabled={action.busy} onClick={() => void action.run(async () => {
          onSession(await api<Session>('/logout', 'POST'));
          go('login');
        })}>Sign out</button>
        <Message>{action.error}</Message>
      </div>
    </aside>
    <div className="workspace">
      <div className="topbar">Workflow workspace</div>
      <main id="main" tabIndex={-1}>{children}</main>
    </div>
  </div>;
}

function NewTask() {
  return <a className="button primary gap-1" href="#tasks/new"><Plus size={16} aria-hidden="true" />New task</a>;
}

function TaskTable({ tasks, empty }: { tasks: Task[]; empty: string }) {
  if (!tasks.length) return <p className="empty">{empty}</p>;
  const headers = ['Task', 'Stage', 'Assignee', 'Due date', 'Priority'];
  return <div className="table-wrap"><table role="table">
    <thead role="rowgroup"><tr role="row">{headers.map(label => <th key={label} scope="col" role="columnheader">{label}</th>)}</tr></thead>
    <tbody role="rowgroup">{tasks.map(task => {
      const cells = [
        <a key="title" href={'#tasks/' + task.id} className="task-link">{task.title}</a>,
        <Badge key="stage" value={task.stage} />, task.assignee_name, formatDate(task.due_date),
        <Badge key="priority" value={task.priority} />,
      ];
      return <tr key={task.id} role="row">
        {cells.map((cell, i) => <td key={headers[i]} role="cell" data-label={headers[i]}>{cell}</td>)}
      </tr>;
    })}</tbody>
  </table></div>;
}

function Dashboard() {
  const { api } = useWorkspace();
  const load = useCallback(() => api<{ counts: Record<Stage, number>; overdue: Task[] }>('/dashboard'), [api]);
  const { data, error } = useResource(load);
  if (error) return <LoadError message={error} />;
  if (!data) return <Loading />;
  return <>
    <Heading title="Dashboard" description="Track work across every stage and see what’s overdue." action={<NewTask />} />
    <section className="stage-section">
      <h2>Workflow stages</h2>
      <div className="stage-grid">{(Object.entries(stages) as [Stage, string][]).map(([key, name]) =>
        <a key={key} href={'#tasks?stage=' + key} className={'stage-card ' + key}>
          <span className="stage-name"><span className="stage-dot" aria-hidden="true" />{name}</span>
          <strong>{data.counts[key] ?? 0}</strong>
        </a>)}</div>
    </section>
    <section className="panel overdue">
      <div className="section-heading"><div><h2>Overdue tasks</h2><p className="muted">Open tasks past their due date</p></div>
        <a href="#tasks">View all tasks</a></div>
      <TaskTable tasks={data.overdue} empty="No overdue tasks." />
    </section>
  </>;
}

function TaskList({ query }: { query: string }) {
  const { api } = useWorkspace();
  const params = new URLSearchParams(query);
  const load = useCallback(() => Promise.all([api<Assignee[]>('/users'), api<Task[]>('/tasks?' + query)]), [api, query]);
  const { data, error } = useResource(load);
  if (error) return <LoadError message={error} />;
  if (!data) return <Loading />;
  const [users, tasks] = data;
  return <>
    <Heading title="Tasks" description="Find and manage work across the team." action={<NewTask />} />
    <section className="panel">
      <form className="filters" onSubmit={event => {
        const filters = new URLSearchParams();
        for (const [key, value] of Object.entries(formValues(event))) if (value) filters.set(key, String(value));
        go(filters.size ? 'tasks?' + filters : 'tasks');
      }}>
        <Field label="Stage"><Select name="stage" choices={Object.entries(stages)} value={params.get('stage')} empty="All stages" /></Field>
        <Field label="Assignee"><Select name="assignee" choices={users.map(user => [user.id, user.name])}
          value={params.get('assignee')} empty="All assignees" /></Field>
        <Field label="Priority"><Select name="priority" choices={Object.entries(priorities)}
          value={params.get('priority')} empty="All priorities" /></Field>
        <button type="submit" className="button">Apply filters</button><a href="#tasks">Clear</a>
      </form>
      <h2 className="results-heading">{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</h2>
      <TaskTable tasks={tasks} empty="No tasks match these filters." />
    </section>
  </>;
}

function TaskForm({ id }: { id?: string }) {
  const { api, user } = useWorkspace();
  const action = useAction();
  const load = useCallback(() => Promise.all([
    api<Assignee[]>('/users'), id ? api<TaskDetail>('/tasks/' + id) : Promise.resolve(null),
  ]), [api, id]);
  const { data, error } = useResource(load);
  if (error) return <LoadError message={error} />;
  if (!data) return <Loading />;
  const [users, task] = data;
  if (task && !editable(task)) return <LoadError message={task.stage === 'done'
    ? 'Completed tasks are closed for editing.' : 'You do not have permission to edit this task.'} />;
  const cancel = id ? '#tasks/' + id : '#tasks';
  return <>
    <a className="back" href={cancel}>← Back</a>
    <Heading title={id ? 'Edit task' : 'New task'} />
    <div className="panel editor">
      <form className="stack grid gap-3.5" onSubmit={event => {
        const fields = formValues(event);
        void action.run(async () => {
          const result = await api<{ id: number }>(id ? '/tasks/' + id : '/tasks', id ? 'PATCH' : 'POST',
            { ...fields, assignee: Number(fields.assignee) });
          go('tasks/' + (id ?? result.id));
        });
      }}>
        <Field label="Title"><input name="title" required maxLength={160} defaultValue={task?.title} /></Field>
        <Field label="Description"><textarea name="description" rows={6} required maxLength={4000}
          defaultValue={task?.description} /></Field>
        <div className="form-grid">
          <Field label="Assignee"><Select name="assignee" choices={users.map(person => [person.id, person.name])}
            value={task?.assignee ?? user.id} required /></Field>
          <Field label="Due date"><input name="due_date" type="date" required defaultValue={task?.due_date} /></Field>
          <Field label="Priority"><Select name="priority" choices={Object.entries(priorities)}
            value={task?.priority ?? 'medium'} required /></Field>
        </div>
        <div className="actions flex flex-wrap items-center gap-2"><button type="submit" className="button primary" disabled={action.busy}>
          {id ? 'Save changes' : 'Create task'}
        </button><a className="button" href={cancel}>Cancel</a></div>
        <Message>{action.error}</Message>
      </form>
    </div>
  </>;
}

function useHashRoute() {
  const [route, setRoute] = useState('dashboard');
  useEffect(() => {
    function read() { setRoute(window.location.hash.slice(1) || 'dashboard'); }
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  return route;
}

export default function Page() {
  const route = useHashRoute();
  const [path, query = ''] = route.split('?');
  const bootstrap = useResource(fetchSession);
  const [sessionUpdate, setSession] = useState<Session>();
  const session = sessionUpdate ?? bootstrap.data;
  const api = useMemo(() => apiClient(session?.csrf), [session?.csrf]);
  const user: User | null = session?.user ?? null;
  const taskRoute = /^tasks\/(\d+)(\/edit)?$/.exec(path);
  useEffect(() => { document.getElementById('main')?.focus(); }, [route, user?.id]);

  let content: ReactNode;
  if (bootstrap.error) {
    content = <main id="main" tabIndex={-1}><Heading title="Unable to reach the workspace" />
      <Message>{bootstrap.error}</Message></main>;
  } else if (!session) {
    content = <main id="main" tabIndex={-1}><Loading /></main>;
  } else if (!user) {
    content = <Auth key={path} api={api} register={path === 'register'} onSession={setSession} />;
  } else {
    let screen: ReactNode = <Dashboard />;
    if (path === 'tasks') screen = <TaskList query={query} />;
    else if (path === 'tasks/new') screen = <TaskForm />;
    else if (taskRoute?.[2]) screen = <TaskForm id={taskRoute[1]} />;
    else if (taskRoute) screen = <TaskDetails id={taskRoute[1]} />;
    content = <WorkspaceContext.Provider value={{ api, user }}>
      <Shell current={path.startsWith('tasks') ? 'tasks' : 'dashboard'} onSession={setSession}>
        <Fragment key={route}>{screen}</Fragment>
      </Shell>
    </WorkspaceContext.Provider>;
  }

  return <>
    <a className="skip-link" href="#main" onClick={event => {
      event.preventDefault();
      document.getElementById('main')?.focus();
    }}>Skip to content</a>
    {content}
  </>;
}
