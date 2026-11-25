const app = document.getElementById('app');
const stages = { todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done' };
const priorities = { low: 'Low', medium: 'Medium', high: 'High' };
const nextStage = { todo: 'in_progress', in_progress: 'review' };
const editable = task => task.can_edit && task.stage !== 'done';
let session = { user: null, csrf: '' };
let renderVersion = 0;

function element(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== null && value !== undefined && value !== false) node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child !== null && child !== undefined && child !== false) {
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
  }
  return node;
}

const el = element;
const link = (label, to, css = '') => el('a', { href: to, class: css }, label);
const button = (label, css = 'button', type = 'button') => el('button', { class: css, type }, label);
const message = () => el('p', { class: 'message', role: 'alert' });
const section = (title, ...children) => el('section', { class: 'panel' }, el('h2', {}, title), children);

async function api(path, method = 'GET', body) {
  const init = { method, headers: { Accept: 'application/json' } };
  if (method !== 'GET') {
    init.headers['X-CSRF-Token'] = session.csrf;
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body ?? {});
  }
  const response = await fetch('/api' + path, init);
  const data = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}

function run(control, feedback, operation) {
  control.disabled = true;
  feedback.textContent = '';
  Promise.resolve().then(operation).catch(error => {
    feedback.textContent = error.message;
  }).finally(() => { control.disabled = false; });
}

function submit(form, control, feedback, operation) {
  form.addEventListener('submit', event => {
    event.preventDefault();
    run(control, feedback, () => operation(Object.fromEntries(new FormData(form))));
  });
}

function field(label, control) {
  return el('label', { class: 'field' }, el('span', {}, label), control);
}

function select(name, entries, value, empty, required = false) {
  const options = entries.map(([id, label]) => el('option', { value: id }, label));
  if (empty !== null) options.unshift(el('option', { value: '' }, empty));
  const control = el('select', { name, required }, options);
  control.value = value ?? '';
  if (control.selectedIndex < 0) control.selectedIndex = 0;
  return control;
}

function heading(title, detail, action) {
  return el('header', { class: 'page-heading' },
    el('div', {}, el('h1', {}, title), detail && el('p', {}, detail)), action);
}

function brand() {
  return el('div', { class: 'brand' }, el('span', { class: 'brand-mark', 'aria-hidden': 'true' }),
    el('div', {}, el('strong', {}, 'Meridian'), el('span', {}, 'Consulting Group')));
}

function shell(route) {
  const main = el('main', { id: 'main', tabindex: '-1' });
  const current = route === 'dashboard' ? 'dashboard' : 'tasks';
  const nav = (label, href, key, icon) => el('a', {
    href, 'aria-current': current === key ? 'page' : null
  }, el('span', { 'aria-hidden': 'true', class: 'nav-icon' }, icon), label);
  const signout = button('Sign out', 'signout');
  const feedback = message();
  signout.addEventListener('click', () => run(signout, feedback, async () => {
    session = await api('/logout', 'POST');
    go('login');
  }));
  const initials = session.user.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('');
  app.replaceChildren(el('div', { class: 'layout' },
    el('aside', { class: 'sidebar' }, brand(),
      el('nav', { 'aria-label': 'Workspace' }, nav('Dashboard', '#dashboard', 'dashboard', '▦'),
        nav('Tasks', '#tasks', 'tasks', '☷')),
      el('div', { class: 'account' }, el('span', { class: 'avatar', 'aria-hidden': 'true' }, initials),
        el('div', { class: 'account-label' }, el('strong', {}, session.user.name),
          el('span', {}, session.user.role === 'manager' ? 'Manager' : 'Staff')), signout, feedback)),
    el('div', { class: 'workspace' }, el('div', { class: 'topbar' }, 'Workflow workspace'), main)));
  return main;
}

function auth(register) {
  const title = register ? 'Create an account' : 'Sign in';
  document.title = title + ' | Meridian Workflow';
  const feedback = message();
  const control = button(register ? 'Register' : 'Sign in', 'button primary', 'submit');
  const form = el('form', { class: 'stack' },
    register && field('Full name', el('input', { name: 'name', required: true, minlength: 2, maxlength: 100, autocomplete: 'name' })),
    field('Email address', el('input', { name: 'email', type: 'email', required: true, maxlength: 254, autocomplete: 'email' })),
    field('Password', el('input', {
      name: 'password', type: 'password', required: true, minlength: register ? 12 : null, maxlength: 128,
      'aria-describedby': register ? 'password-guidance' : null,
      autocomplete: register ? 'new-password' : 'current-password'
    })), register && el('p', { id: 'password-guidance', class: 'muted' }, 'Use at least 12 characters.'),
    control, feedback);
  submit(form, control, feedback, async data => {
    session = await api(register ? '/register' : '/login', 'POST', data);
    go(session.user ? 'dashboard' : 'login');
  });
  app.replaceChildren(el('main', { id: 'main', class: 'auth', tabindex: '-1' },
    el('div', { class: 'auth-brand' }, brand()),
    el('section', { class: 'auth-panel' },
      el('p', { class: 'eyebrow' }, 'Workflow workspace'), el('h1', {}, title),
      el('p', { class: 'muted' }, register ? 'Register to join the workspace as staff.' : 'Track assignments and review completed work.'),
      form,
      el('p', { class: 'auth-switch' }, register ? 'Already registered? ' : 'New to Meridian Workflow? ',
        link(register ? 'Sign in' : 'Register', register ? '#login' : '#register')))));
}

function formatDate(date, time = false) {
  if (!date) return '';
  const parsed = new Date(time ? date : date + 'T00:00:00');
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('en-ZA', time ? { dateStyle: 'medium', timeStyle: 'short' } :
    { dateStyle: 'medium' }).format(parsed);
}

function badge(value, labels) {
  return el('span', { class: 'badge ' + value }, labels[value] || value);
}

function taskTable(tasks, empty) {
  if (!tasks.length) return el('p', { class: 'empty' }, empty);
  const headers = ['Task', 'Stage', 'Assignee', 'Due date', 'Priority'];
  return el('div', { class: 'table-wrap' }, el('table', { role: 'table' },
    el('thead', { role: 'rowgroup' }, el('tr', { role: 'row' }, headers.map(label => el('th', { scope: 'col', role: 'columnheader' }, label)))),
    el('tbody', { role: 'rowgroup' }, tasks.map(task => el('tr', { role: 'row' },
      [link(task.title, '#tasks/' + task.id, 'task-link'), badge(task.stage, stages),
        task.assignee_name, formatDate(task.due_date), badge(task.priority, priorities)]
        .map((value, index) => el('td', { 'data-label': headers[index], role: 'cell' }, value)))))));
}

async function dashboard(main) {
  const data = await api('/dashboard');
  const cards = el('div', { class: 'stage-grid' }, Object.entries(stages).map(([key, name]) =>
    el('a', { class: 'stage-card ' + key, href: '#tasks?stage=' + key },
      el('span', { class: 'stage-name' }, el('span', { class: 'stage-dot', 'aria-hidden': 'true' }), name),
      el('strong', {}, data.counts[key] ?? 0))));
  main.replaceChildren(
    heading('Dashboard', 'Track work across every stage and see what’s overdue.', link('+ New task', '#tasks/new', 'button primary')),
    el('section', { class: 'stage-section' }, el('h2', {}, 'Workflow stages'), cards),
    el('section', { class: 'panel overdue' },
      el('div', { class: 'section-heading' }, el('div', {}, el('h2', {}, 'Overdue tasks'),
        el('p', { class: 'muted' }, 'Open tasks past their due date')), link('View all tasks', '#tasks')),
      taskTable(data.overdue, 'No overdue tasks.')));
}

async function taskList(main, query) {
  const params = new URLSearchParams(query);
  const [users, tasks] = await Promise.all([api('/users'), api('/tasks?' + params)]);
  const stage = select('stage', Object.entries(stages), params.get('stage'), 'All stages');
  const assignee = select('assignee', users.map(user => [user.id, user.name]), params.get('assignee'), 'All assignees');
  const priority = select('priority', Object.entries(priorities), params.get('priority'), 'All priorities');
  const filters = el('form', { class: 'filters' }, field('Stage', stage), field('Assignee', assignee),
    field('Priority', priority), button('Apply filters', 'button', 'submit'), link('Clear', '#tasks'));
  filters.addEventListener('submit', event => {
    event.preventDefault();
    const next = new URLSearchParams();
    for (const [key, value] of new FormData(filters)) if (value) next.set(key, value);
    go(next.size ? 'tasks?' + next : 'tasks');
  });
  main.replaceChildren(heading('Tasks', 'Find and manage work across the team.', link('+ New task', '#tasks/new', 'button primary')),
    el('section', { class: 'panel' }, filters, el('h2', { class: 'results-heading' },
      tasks.length + (tasks.length === 1 ? ' task' : ' tasks')),
    taskTable(tasks, 'No tasks match these filters.')));
}

async function taskForm(main, id) {
  const [users, task] = await Promise.all([api('/users'), id ? api('/tasks/' + id) : {}]);
  if (id && !editable(task)) throw new Error(task.stage === 'done' ?
    'Completed tasks are closed for editing.' : 'You do not have permission to edit this task.');
  const feedback = message();
  const save = button(id ? 'Save changes' : 'Create task', 'button primary', 'submit');
  const cancel = id ? '#tasks/' + id : '#tasks';
  const form = el('form', { class: 'stack' },
    field('Title', el('input', { name: 'title', required: true, maxlength: 160, value: task.title })),
    field('Description', el('textarea', { name: 'description', rows: 6, required: true, maxlength: 4000 }, task.description)),
    el('div', { class: 'form-grid' },
      field('Assignee', select('assignee', users.map(user => [user.id, user.name]), task.assignee ?? session.user.id, null, true)),
      field('Due date', el('input', { name: 'due_date', type: 'date', required: true, value: task.due_date })),
      field('Priority', select('priority', Object.entries(priorities), task.priority ?? 'medium', null, true))),
    el('div', { class: 'actions' }, save, link('Cancel', cancel, 'button')), feedback);
  submit(form, save, feedback, async data => {
    data.assignee = Number(data.assignee);
    const result = await api(id ? '/tasks/' + id : '/tasks', id ? 'PATCH' : 'POST', data);
    go('tasks/' + (id || result.id));
  });
  main.replaceChildren(link('← Back', cancel, 'back'), heading(id ? 'Edit task' : 'New task'),
    el('div', { class: 'panel editor' }, form));
}

function timeline(items, empty, makeItem) {
  return items.length ? el('ol', { class: 'timeline' }, items.map(makeItem)) :
    el('p', { class: 'muted' }, empty);
}

function workflowPanel(task, path) {
  const feedback = message();
  const contents = [el('p', { class: 'muted' }, 'Current stage: ', badge(task.stage, stages))];
  const next = nextStage[task.stage];
  if (task.can_edit && next) {
    const move = button('Move to ' + stages[next], 'button primary');
    move.addEventListener('click', () => run(move, feedback, async () => {
      await api(path + '/stage', 'POST', { stage: next });
      render();
    }));
    contents.push(move);
  }
  if (task.stage === 'review' && session.user.role === 'manager') {
    const approve = button('Approve task', 'button primary');
    const reject = button('Reject and return', 'button danger', 'submit');
    const form = el('form', { class: 'stack rejection' },
      field('Rejection comment', el('textarea', {
        name: 'comment', required: true, rows: 3, maxlength: 1500
      })), reject);
    approve.addEventListener('click', () => run(approve, feedback, async () => {
      await api(path + '/decision', 'POST', { decision: 'approve' });
      render();
    }));
    submit(form, reject, feedback, async data => {
      await api(path + '/decision', 'POST', { decision: 'reject', comment: data.comment });
      render();
    });
    contents.push(approve, form);
  } else if (task.stage === 'review') {
    contents.push(el('p', {}, 'Awaiting a manager’s decision.'));
  }
  return section('Workflow', contents, feedback);
}

function commentsPanel(task, path) {
  const feedback = message();
  const send = button('Post comment', 'button', 'submit');
  const form = el('form', { class: 'stack' }, field('Add a comment',
    el('textarea', { name: 'body', rows: 3, required: true, maxlength: 1500 })), send, feedback);
  submit(form, send, feedback, async data => {
    await api(path + '/comments', 'POST', data);
    render();
  });
  return section('Comments',
    timeline(task.comments, 'No comments yet.', comment => el('li', {},
      el('div', { class: 'entry-heading' }, el('strong', {}, comment.author),
        el('time', { datetime: comment.created_at }, formatDate(comment.created_at, true))),
      el('p', { class: 'user-text' }, comment.body))), form);
}

function aiPanel(task, path) {
  const summary = button('Summarise');
  const suggest = button('Suggest');
  const summaryResult = el('div', { 'aria-live': 'polite' });
  const suggestionsResult = el('div', { 'aria-live': 'polite' });
  const summaryFeedback = message();
  const suggestFeedback = message();
  summary.addEventListener('click', () => run(summary, summaryFeedback, async () => {
    summaryResult.textContent = 'Generating summary…';
    try {
      const result = await api(path + '/summary', 'POST');
      summaryResult.replaceChildren(el('div', { class: 'ai-result' },
        el('h3', {}, 'Task summary'), el('p', { class: 'user-text' }, result.summary)));
    } catch (error) {
      summaryResult.replaceChildren();
      throw error;
    }
  }));
  suggest.addEventListener('click', () => run(suggest, suggestFeedback, async () => {
    suggestionsResult.textContent = 'Generating suggestions…';
    try {
      const result = await api(path + '/suggest', 'POST');
      const save = button('Confirm suggestions', 'button primary');
      const discard = button('Discard');
      save.addEventListener('click', () => run(save, suggestFeedback, async () => {
        await api(path + '/confirm', 'POST', { token: result.token });
        render();
      }));
      discard.addEventListener('click', () => {
        suggestionsResult.replaceChildren();
        suggestFeedback.textContent = '';
        suggest.focus();
      });
      suggestionsResult.replaceChildren(el('div', { class: 'ai-result' }, el('h3', {}, 'Suggested plan'),
        el('p', {}, 'Proposed priority: ', badge(result.priority, priorities)),
        el('ul', {}, result.subtasks.map(item => el('li', {}, item))),
        editable(task) && el('p', { class: 'muted' }, 'Confirm to apply the priority and save these subtasks.'),
        el('div', { class: 'actions' }, editable(task) && save, discard)));
    } catch (error) {
      suggestionsResult.replaceChildren();
      throw error;
    }
  }));
  return section('AI assistance',
    el('p', { class: 'muted' }, 'Summarise the task and comments, or suggest a priority and subtasks.'),
    el('div', { class: 'actions' }, summary, suggest),
    summaryFeedback, summaryResult, suggestFeedback, suggestionsResult);
}

async function taskDetail(main, id) {
  const path = '/tasks/' + id;
  const task = await api(path);
  const deleteTask = button('Delete', 'button danger');
  const deleteError = message();
  const dialog = el('dialog', { 'aria-labelledby': 'delete-title' });
  const cancel = button('Cancel');
  const confirmDelete = button('Delete task', 'button danger');
  cancel.addEventListener('click', () => dialog.close());
  deleteTask.addEventListener('click', () => dialog.showModal());
  confirmDelete.addEventListener('click', () => run(confirmDelete, deleteError, async () => {
    await api(path, 'DELETE');
    dialog.close();
    go('tasks');
  }));
  dialog.append(el('h2', { id: 'delete-title' }, 'Delete this task?'),
    el('p', {}, 'The task will be removed from your workspace.'),
    el('div', { class: 'actions' }, cancel, confirmDelete), deleteError);
  const facts = [['Assignee', task.assignee_name], ['Due date', formatDate(task.due_date)],
    ['Priority', badge(task.priority, priorities)]];
  const details = section('Task details',
    el('dl', { class: 'facts' }, facts.map(([label, value]) =>
      el('div', {}, el('dt', {}, label), el('dd', {}, value)))),
    el('h3', {}, 'Description'), el('p', { class: 'user-text' }, task.description),
    task.subtasks.length > 0 && [el('h3', {}, 'Subtasks'), el('ul', {}, task.subtasks.map(item => el('li', {}, item)))]);
  const activity = section('Activity log', timeline(task.activity, 'No activity yet.', entry => el('li', {},
    el('div', { class: 'entry-heading' }, el('strong', {}, entry.actor),
      el('time', { datetime: entry.created_at }, formatDate(entry.created_at, true))),
    el('p', { class: 'user-text' }, entry.action))));
  main.replaceChildren(link('← All tasks', '#tasks', 'back'),
    heading(task.title, null, el('div', { class: 'actions' },
      editable(task) && link('Edit task', '#tasks/' + id + '/edit', 'button'), task.can_delete && deleteTask)),
    el('div', { class: 'detail-grid' }, el('div', { class: 'detail-column' }, details, commentsPanel(task, path)),
      el('div', { class: 'detail-column' }, workflowPanel(task, path), aiPanel(task, path), activity)), dialog);
}

function go(route) {
  if (location.hash === '#' + route) render();
  else location.hash = route;
}

async function render(focusContent = false) {
  const version = ++renderVersion;
  const [route, query] = (location.hash.slice(1) || 'dashboard').split('?');
  if (!session.user) {
    auth(route === 'register');
    if (focusContent) document.getElementById('main').focus();
    return;
  }
  const main = shell(route === 'login' || route === 'register' ? 'dashboard' : route);
  main.append(el('p', { role: 'status', class: 'loading' }, 'Loading…'));
  try {
    const taskRoute = /^tasks\/(\d+)(\/edit)?$/.exec(route);
    if (route === 'tasks') await taskList(main, query);
    else if (route === 'tasks/new') await taskForm(main);
    else if (taskRoute?.[2]) await taskForm(main, taskRoute[1]);
    else if (taskRoute) await taskDetail(main, taskRoute[1]);
    else await dashboard(main);
    if (version === renderVersion) {
      document.title = (main.querySelector('h1')?.textContent || 'Workspace') + ' | Meridian Workflow';
      if (focusContent) main.focus();
    }
  } catch (error) {
    if (version === renderVersion) main.replaceChildren(heading('Unable to load this page'),
      el('p', { role: 'alert' }, error.message), link('Return to dashboard', '#dashboard'));
  }
}

document.querySelector('.skip-link').addEventListener('click', event => {
  event.preventDefault();
  document.getElementById('main')?.focus();
});

async function start() {
  try {
    session = await api('/session');
    window.addEventListener('hashchange', () => render(true));
    render();
  } catch (error) {
    app.replaceChildren(el('main', { id: 'main', tabindex: '-1' }, heading('Unable to reach the workspace'),
      el('p', { role: 'alert' }, error.message)));
  }
}

start();

