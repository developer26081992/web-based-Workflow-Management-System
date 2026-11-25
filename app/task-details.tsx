'use client';

import { useCallback, useRef, useState } from 'react';
import {
  Badge, editable, Field, formValues, formatDate, go, Heading, Loading, LoadError,
  Message, Panel, stages, useAction, useResource, useWorkspace,
} from './workspace';
import type { Priority, Stage, TaskDetail } from './workspace';

type PanelProps = { task: TaskDetail; reload: () => void };
const nextStage: Partial<Record<Stage, Stage>> = { todo: 'in_progress', in_progress: 'review' };

function Workflow({ task, reload }: PanelProps) {
  const { api, user } = useWorkspace();
  const action = useAction();
  const path = '/tasks/' + task.id;
  const next = nextStage[task.stage];
  function update(endpoint: string, data: object) {
    void action.run(async () => {
      await api(path + endpoint, 'POST', data);
      reload();
    });
  }

  return <Panel title="Workflow">
    <p className="muted">Current stage: <Badge value={task.stage} /></p>
    {task.can_edit && next && <button type="button" className="button primary" disabled={action.busy}
      onClick={() => update('/stage', { stage: next })}>Move to {stages[next]}</button>}
    {task.stage === 'review' && (user.role === 'manager' ? <>
      <button type="button" className="button primary" disabled={action.busy}
        onClick={() => update('/decision', { decision: 'approve' })}>Approve task</button>
      <form className="stack rejection grid gap-3.5" onSubmit={event => {
        const { comment } = formValues(event);
        update('/decision', { decision: 'reject', comment });
      }}>
        <Field label="Rejection comment"><textarea name="comment" rows={3} required maxLength={1500} /></Field>
        <button type="submit" className="button danger" disabled={action.busy}>Reject and return</button>
      </form>
    </> : <p>Awaiting a manager’s decision.</p>)}
    <Message>{action.error}</Message>
  </Panel>;
}

function Timeline({ entries, empty }: {
  entries: { person: string; text: string; date: string }[]; empty: string;
}) {
  if (!entries.length) return <p className="muted">{empty}</p>;
  return <ol className="timeline">
    {entries.map(({ person, text, date }, index) => <li key={index}>
      <div className="entry-heading"><strong>{person}</strong><time dateTime={date}>{formatDate(date, true)}</time></div>
      <p className="user-text">{text}</p>
    </li>)}
  </ol>;
}

function Comments({ task, reload }: PanelProps) {
  const { api } = useWorkspace();
  const action = useAction();
  return <Panel title="Comments">
    <Timeline empty="No comments yet." entries={task.comments.map(comment =>
      ({ person: comment.author, text: comment.body, date: comment.created_at }))} />
    <form className="stack grid gap-3.5" onSubmit={event => {
      const fields = formValues(event);
      void action.run(async () => {
        await api('/tasks/' + task.id + '/comments', 'POST', fields);
        reload();
      });
    }}>
      <Field label="Add a comment"><textarea name="body" rows={3} required maxLength={1500} /></Field>
      <button type="submit" className="button" disabled={action.busy}>Post comment</button>
      <Message>{action.error}</Message>
    </form>
  </Panel>;
}

type Suggestion = { priority: Priority; subtasks: string[]; token: string };
function AiAssistance({ task, reload }: PanelProps) {
  const { api } = useWorkspace();
  const summaryAction = useAction();
  const suggestionAction = useAction();
  const confirmAction = useAction();
  const [summary, setSummary] = useState('');
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const suggestButton = useRef<HTMLButtonElement>(null);
  const path = '/tasks/' + task.id;
  return <Panel title="AI assistance">
    <p className="muted">Summarise the task and comments, or suggest a priority and subtasks.</p>
    <div className="actions flex flex-wrap items-center gap-2">
      <button type="button" className="button" disabled={summaryAction.busy} onClick={() => {
        setSummary('');
        void summaryAction.run(async () => setSummary((await api<{ summary: string }>(path + '/summary', 'POST')).summary));
      }}>Summarise</button>
      <button ref={suggestButton} type="button" className="button"
        disabled={suggestionAction.busy || confirmAction.busy} onClick={() => {
          setSuggestion(null);
          confirmAction.clearError();
          void suggestionAction.run(async () => setSuggestion(await api<Suggestion>(path + '/suggest', 'POST')));
        }}>Suggest</button>
    </div>
    <Message>{summaryAction.error}</Message>
    <div aria-live="polite">
      {summaryAction.busy && 'Generating summary…'}
      {summary && <div className="ai-result"><h3>Task summary</h3><p className="user-text">{summary}</p></div>}
    </div>
    <Message>{suggestionAction.error || confirmAction.error}</Message>
    <div aria-live="polite">
      {suggestionAction.busy && 'Generating suggestions…'}
      {suggestion && <div className="ai-result">
        <h3>Suggested plan</h3>
        <p>Proposed priority: <Badge value={suggestion.priority} /></p>
        <ul>{suggestion.subtasks.map((item, i) => <li key={i}>{item}</li>)}</ul>
        {editable(task) && <p className="muted">Confirm to apply the priority and save these subtasks.</p>}
        <div className="actions flex flex-wrap items-center gap-2">
          {editable(task) && <button type="button" className="button primary" disabled={confirmAction.busy}
            onClick={() => void confirmAction.run(async () => {
              await api(path + '/confirm', 'POST', { token: suggestion.token });
              reload();
            })}>Confirm suggestions</button>}
          <button type="button" className="button" disabled={confirmAction.busy} onClick={() => {
            setSuggestion(null);
            confirmAction.clearError();
            suggestButton.current?.focus();
          }}>Discard</button>
        </div>
      </div>}
    </div>
  </Panel>;
}

export function TaskDetails({ id }: { id: string }) {
  const [revision, setRevision] = useState(0);
  return <TaskDetailScreen key={revision} id={id} reload={() => setRevision(value => value + 1)} />;
}

function TaskDetailScreen({ id, reload }: { id: string; reload: () => void }) {
  const { api } = useWorkspace();
  const path = '/tasks/' + id;
  const load = useCallback(() => api<TaskDetail>(path), [api, path]);
  const { data: task, error } = useResource(load);
  const dialog = useRef<HTMLDialogElement>(null);
  const deletion = useAction();
  if (error) return <LoadError message={error} />;
  if (!task) return <Loading />;
  return <>
    <a className="back" href="#tasks">← All tasks</a>
    <Heading title={task.title} action={<div className="actions flex flex-wrap items-center gap-2">
      {editable(task) && <a href={'#tasks/' + id + '/edit'} className="button">Edit task</a>}
      {task.can_delete && <button type="button" className="button danger"
        onClick={() => dialog.current?.showModal()}>Delete</button>}
    </div>} />
    <div className="detail-grid">
      <div className="grid min-w-0 content-start gap-3.5">
        <Panel title="Task details">
          <dl className="facts">
            <div><dt>Assignee</dt><dd>{task.assignee_name}</dd></div>
            <div><dt>Due date</dt><dd>{formatDate(task.due_date)}</dd></div>
            <div><dt>Priority</dt><dd><Badge value={task.priority} /></dd></div>
          </dl>
          <h3>Description</h3><p className="user-text">{task.description}</p>
          {task.subtasks.length > 0 && <><h3>Subtasks</h3>
            <ul>{task.subtasks.map((item, i) => <li key={i}>{item}</li>)}</ul></>}
        </Panel>
        <Comments task={task} reload={reload} />
      </div>
      <div className="grid min-w-0 content-start gap-3.5">
        <Workflow task={task} reload={reload} />
        <AiAssistance task={task} reload={reload} />
        <Panel title="Activity log">
          <Timeline empty="No activity yet." entries={task.activity.map(entry =>
            ({ person: entry.actor, text: entry.action, date: entry.created_at }))} />
        </Panel>
      </div>
    </div>
    <dialog ref={dialog} aria-labelledby="delete-title" onClose={() => deletion.clearError()}>
      <h2 id="delete-title">Delete this task?</h2>
      <p>The task will be removed from your workspace.</p>
      <div className="actions flex flex-wrap items-center gap-2">
        <button type="button" className="button" onClick={() => dialog.current?.close()}>Cancel</button>
        <button type="button" className="button danger" disabled={deletion.busy}
          onClick={() => void deletion.run(async () => {
            await api(path, 'DELETE');
            dialog.current?.close();
            go('tasks');
          })}>Delete task</button>
      </div>
      <Message>{deletion.error}</Message>
    </dialog>
  </>;
}
