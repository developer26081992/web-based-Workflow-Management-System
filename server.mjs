import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { all, one, run, transaction, hashPassword, checkPassword, today } from './db/database.mjs';
import { generate, priorityValues } from './ai.mjs';

const stages = ['todo','in_progress','review','done'];
const labels = { todo:'To Do', in_progress:'In Progress', review:'Review', done:'Done' };
const routes = { '/':'index.html', '/style.css':'style.css', '/app.js':'app.js' };
const mime = { '/':'text/html', '/style.css':'text/css', '/app.js':'text/javascript' };
const token = () => randomBytes(32).toString('hex');
const digest = value => createHash('sha256').update(value).digest('hex');
const dummyHash = hashPassword(token());
const ttl = 8 * 60 * 60;
const suggestions = new Map();

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function requireThat(condition, status, message) {
  if (!condition) throw new HttpError(status, message);
}
function field(body, key, min, max, trim = true) {
  const input = body[key];
  const value = typeof input === 'string' && trim ? input.trim() : input;
  requireThat(typeof value === 'string' && value.length >= min && value.length <= max,
    400, `${key.replaceAll('_',' ')} must be ${min} to ${max} characters.`);
  return value;
}
function integer(value, label) {
  const id = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  requireThat(Number.isSafeInteger(id) && id > 0, 400, `Invalid ${label}.`);
  return id;
}
function json(res, value, status = 200) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}
async function readBody(req) {
  const type = req.headers['content-type']?.split(';')[0];
  if (!type && !req.headers['content-length'] && !req.headers['transfer-encoding']) return {};
  requireThat(type === 'application/json', 415, 'Send a JSON request.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 24000) chunks.push(chunk);
  }
  requireThat(size <= 24000, 413, 'Request is too large.');
  let body;
  try { body = JSON.parse(Buffer.concat(chunks)); } catch { throw new HttpError(400, 'Invalid JSON.'); }
  requireThat(body && typeof body === 'object' && !Array.isArray(body), 400, 'Send a JSON object.');
  return body;
}
function getSession(req) {
  const value = req.headers.cookie?.match(/(?:^|;\s*)meridian_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  return value && one('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?', digest(value), Date.now());
}
function replaceSession(res, previous, userId = null) {
  const value = token();
  const csrf = token();
  const tokenHash = digest(value);
  run('DELETE FROM sessions WHERE expires_at<=? OR token_hash=?', Date.now(), previous?.token_hash ?? '');
  run('INSERT INTO sessions VALUES (?,?,?,?)', tokenHash, userId, csrf, Date.now() + ttl * 1000);
  res.setHeader('Set-Cookie', `meridian_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}` +
    (process.env.SECURE_COOKIES === '1' ? '; Secure' : ''));
  return { csrf, user: userId ? userById(userId) : null };
}
function userById(id) {
  return one('SELECT id,name,email,role FROM users WHERE id=?', id);
}
function authenticate(path, body, session, res) {
  requireThat(!session.user_id, 409, 'Sign out before switching accounts.');
  const email = field(body,'email',3,254).toLowerCase();
  requireThat(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),400,'Enter a valid email address.');
  const password = field(body,'password',path === '/api/register' ? 12 : 1,128,false);
  const existing = one('SELECT id,password_hash FROM users WHERE email=?', email);
  if (path === '/api/login') {
    const valid = checkPassword(password, existing?.password_hash ?? dummyHash);
    requireThat(existing && valid, 401, 'The email or password is incorrect.');
    return json(res, transaction(() => replaceSession(res, session, existing.id)));
  }
  const name = field(body,'name',2,100);
  const passwordHash = hashPassword(password);
  const result = transaction(() => {
    requireThat(!one('SELECT id FROM users WHERE email=?', email),409,'This email is already registered.');
    const inserted = run("INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,'staff')",name,email,passwordHash);
    return replaceSession(res, session, inserted.lastInsertRowid);
  });
  json(res, result, 201);
}

const taskQuery = `SELECT t.id,t.title,t.description,t.assignee,t.creator,t.due_date,t.priority,t.stage,
  t.version,u.name AS assignee_name FROM tasks t JOIN users u ON t.assignee=u.id WHERE t.deleted=0`;
function taskView(task, user) {
  const { version, ...fields } = task;
  const owner = task.creator === user.id;
  const manager = user.role === 'manager';
  return { ...fields, can_edit: manager || owner || task.assignee === user.id, can_delete: manager || owner };
}
function findTask(id) {
  const task = one(taskQuery + ' AND t.id=?', id);
  requireThat(task,404,'Task not found.');
  return task;
}
function taskFields(body) {
  const title = field(body,'title',1,160);
  const description = field(body,'description',1,4000);
  const assignee = integer(body.assignee,'assignee');
  const date = field(body,'due_date',10,10);
  const parsed = new Date(date + 'T00:00:00Z');
  requireThat(/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(+parsed) &&
    parsed.toISOString().slice(0,10) === date && !date.startsWith('0000-'),400,'Enter a valid due date.');
  requireThat(priorityValues.includes(body.priority),400,'Select a valid priority.');
  requireThat(userById(assignee),400,'Select a valid assignee.');
  return [title,description,assignee,date,body.priority];
}
function audit(id,user,action,from = null,to = null) {
  run('INSERT INTO activity(task_id,actor_id,action,from_stage,to_stage) VALUES (?,?,?,?,?)',
    id,user.id,action,from,to);
}
function comments(id) {
  return all(`SELECT u.name AS author,c.body,c.created_at FROM comments c JOIN users u ON u.id=c.author_id
    WHERE c.task_id=? ORDER BY c.id`,id);
}
function details(task,user) {
  const id = task.id;
  return { ...taskView(task,user), comments: comments(id),
    activity: all(`SELECT u.name AS actor,a.action,a.created_at,a.from_stage,a.to_stage
      FROM activity a JOIN users u ON u.id=a.actor_id WHERE a.task_id=? ORDER BY a.id DESC`,id),
    subtasks: all('SELECT title FROM subtasks WHERE task_id=? ORDER BY position',id).map(row => row.title) };
}
function transition(task, user, stage, action) {
  run('UPDATE tasks SET stage=?, version=version+1 WHERE id=?',stage,task.id);
  audit(task.id,user,action,task.stage,stage);
}

function mutateTask(id, operation, body, user) {
  const task = findTask(id);
  const rights = taskView(task,user);
  if (operation === 'comments') {
    run('INSERT INTO comments(task_id,author_id,body) VALUES (?,?,?)',id,user.id,field(body,'body',1,1500));
  } else if (operation === 'decision') {
    requireThat(user.role === 'manager',403,'Only managers can decide reviews.');
    requireThat(task.stage === 'review',409,'The task must be in Review.');
    requireThat(['approve','reject'].includes(body.decision),400,'Select approve or reject.');
    if (body.decision === 'approve') transition(task,user,'done','Approved review and moved to Done');
    else {
      run('INSERT INTO comments(task_id,author_id,body) VALUES (?,?,?)',id,user.id,
        'Review rejected: ' + field(body,'comment',1,1500));
      transition(task,user,'in_progress','Rejected review and returned to In Progress');
    }
  } else {
    requireThat(operation === 'delete' ? rights.can_delete : rights.can_edit,403,'You do not have permission to change this task.');
    switch (operation) {
      case 'edit':
        requireThat(task.stage !== 'done',409,'Completed tasks are closed for editing.');
        run('UPDATE tasks SET title=?,description=?,assignee=?,due_date=?,priority=?,version=version+1 WHERE id=?',...taskFields(body),id);
        audit(id,user,'Edited task details');
        break;
      case 'delete':
        run('UPDATE tasks SET deleted=1, version=version+1 WHERE id=?',id);
        audit(id,user,'Deleted task');
        break;
      case 'stage': {
        const next = { todo:'in_progress', in_progress:'review' }[task.stage];
        requireThat(stages.includes(body.stage),400,'Select a valid stage.');
        requireThat(body.stage === next,409,'Tasks progress in order. A manager decides reviews.');
        transition(task,user,next,`Moved from ${labels[task.stage]} to ${labels[next]}`);
        break;
      }
      case 'confirm': {
        const candidate = suggestions.get(body.token);
        requireThat(candidate && candidate.user === user.id && candidate.id === id &&
          candidate.version === task.version && candidate.expires > Date.now() && task.stage !== 'done',
          409,'This suggestion expired or the task changed. Request a fresh suggestion.');
        run('UPDATE tasks SET priority=?,version=version+1 WHERE id=?',candidate.priority,id);
        run('DELETE FROM subtasks WHERE task_id=?',id);
        candidate.subtasks.forEach((title,i) => run('INSERT INTO subtasks VALUES (?,?,?)',id,i + 1,title));
        audit(id,user,'Confirmed AI priority and subtasks');
        break;
      }
    }
  }
  return { id };
}

async function taskRoute(req,res,path,body,user) {
  const match = path.match(/^\/api\/tasks\/(\d+)(?:\/(stage|decision|comments|summary|suggest|confirm))?$/);
  requireThat(match,404,'API route not found.');
  const id = integer(match[1],'task');
  const operation = match[2];
  if (!operation && req.method === 'GET') return json(res,details(findTask(id),user));
  if (!operation && ['PATCH','DELETE'].includes(req.method)) {
    return json(res,transaction(() => mutateTask(id,req.method === 'PATCH' ? 'edit' : 'delete',body,user)));
  }
  requireThat(operation && req.method === 'POST',405,'Method not allowed.');
  if (operation === 'summary' || operation === 'suggest') {
    const task = findTask(id);
    const result = await generate(operation,task,operation === 'summary' ? comments(id) : []);
    if (operation === 'summary') return json(res,result);
    for (const [key,value] of suggestions) if (value.expires <= Date.now()) suggestions.delete(key);
    if (suggestions.size >= 1000) suggestions.delete(suggestions.keys().next().value);
    const confirmation = token();
    suggestions.set(confirmation,{ ...result,id,user:user.id,version:task.version,expires:Date.now()+600000 });
    return json(res,{ ...result,token:confirmation });
  }
  const result = transaction(() => mutateTask(id,operation,body,user));
  if (operation === 'confirm') suggestions.delete(body.token);
  json(res,result);
}

async function api(req,res,url) {
  const path = url.pathname;
  const session = getSession(req);
  if (path === '/api/session' && req.method === 'GET') {
    return json(res,session ? { csrf:session.csrf,user:userById(session.user_id) ?? null }
      : transaction(() => replaceSession(res,null)));
  }
  const mutation = ['POST','PATCH','DELETE'].includes(req.method);
  const authEntry = ['/api/register','/api/login'].includes(path) && req.method === 'POST';
  requireThat(authEntry || session?.user_id,401,'Sign in to continue.');
  if (mutation) requireThat(session && req.headers['x-csrf-token'] === session.csrf,403,'Refresh the page and try again.');
  const body = mutation ? await readBody(req) : {};
  if (authEntry) return authenticate(path,body,session,res);
  if (path === '/api/logout' && req.method === 'POST') return json(res,transaction(() => replaceSession(res,session)));
  const user = userById(session.user_id);
  if (path === '/api/users' && req.method === 'GET') return json(res,all('SELECT id,name FROM users ORDER BY name,id'));
  if (path === '/api/dashboard' && req.method === 'GET') {
    const counts = Object.fromEntries(stages.map(stage => [stage,0]));
    for (const row of all('SELECT stage,COUNT(*) AS total FROM tasks WHERE deleted=0 GROUP BY stage')) counts[row.stage] = row.total;
    const overdue = all(taskQuery + " AND t.stage<>'done' AND t.due_date<? ORDER BY t.due_date,t.id",today());
    return json(res,{ counts,overdue:overdue.map(task => taskView(task,user)) });
  }
  if (path === '/api/tasks' && req.method === 'GET') {
    const args = [];
    let query = taskQuery;
    for (const [name,values] of [['stage',stages],['assignee',null],['priority',priorityValues]]) {
      const value = url.searchParams.get(name);
      if (!value) continue;
      requireThat(!values || values.includes(value),400,`Invalid ${name} filter.`);
      query += ` AND t.${name}=?`;
      args.push(values ? value : integer(value,name));
    }
    return json(res,all(query + ' ORDER BY t.due_date,t.id',...args).map(task => taskView(task,user)));
  }
  if (path === '/api/tasks' && req.method === 'POST') {
    const id = transaction(() => {
      const result = run('INSERT INTO tasks(title,description,assignee,due_date,priority,creator) VALUES (?,?,?,?,?,?)',
        ...taskFields(body),user.id);
      audit(result.lastInsertRowid,user,'Created task',null,'todo');
      return result.lastInsertRowid;
    });
    return json(res,{ id },201);
  }
  return taskRoute(req,res,path,body,user);
}

const server = createServer(async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    const url = new URL(req.url,'http://localhost');
    if (url.pathname.startsWith('/api/')) return await api(req,res,url);
    requireThat(req.method === 'GET' && Object.hasOwn(routes,url.pathname),404,'Page not found.');
    const content = readFileSync(new URL('public/' + routes[url.pathname], import.meta.url));
    res.writeHead(200,{ 'Content-Type':mime[url.pathname] + '; charset=utf-8' });
    res.end(content);
  } catch (error) {
    if (!error.status) console.error(error);
    if (!res.headersSent) json(res,{ error:error.status ? error.message : 'Unexpected server error.' },error.status || 500);
  }
});
server.requestTimeout = 15000;
server.listen(Number(process.env.PORT || 3000),process.env.HOST || '127.0.0.1',() => {
  console.log('Meridian Workflow listening on ' + JSON.stringify(server.address()));
});
