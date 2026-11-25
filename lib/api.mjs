import { randomBytes, createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { database } from './prisma.mjs';
import { checkPassword, hashPassword } from './password.mjs';
import { generate, priorityValues } from '../ai.mjs';

const stages = ['todo','in_progress','review','done'];
const labels = { todo:'To Do', in_progress:'In Progress', review:'Review', done:'Done' };
const token = () => randomBytes(32).toString('hex');
const digest = value => createHash('sha256').update(value).digest('hex');
const ttl = 8 * 60 * 60;
const suggestions = new Map();
const userView = { id:true, name:true, email:true, role:true };
const dateValue = value => new Date(value + 'T00:00:00Z');
const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone:process.env.APP_TIME_ZONE || 'Africa/Johannesburg',
  year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date());
const taskOrder = [{ due_date:'asc' },{ id:'asc' }];
const taskInclude = { assignedUser:{ select:{ name:true } } };

class HttpError extends Error {
  constructor(status,message) { super(message); this.status = status; }
}
function requireThat(condition,status,message) {
  if (!condition) throw new HttpError(status,message);
}
function validated(schema,value,message) {
  const result = schema.safeParse(value);
  requireThat(result.success,400,message);
  return result.data;
}
function field(body,key,min,max,trim = true) {
  const input = z.string();
  const schema = (trim ? input.trim() : input).min(min).max(max).refine(value => !value.includes('\0'));
  return validated(schema,body[key],`${key.replaceAll('_',' ')} must be ${min} to ${max} characters.`);
}
function integer(value,label) {
  const input = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return validated(z.number().int().positive().max(2147483647),input,`Invalid ${label}.`);
}
async function readBody(req) {
  if (!req.body) return {};
  const chunks = [];
  const reader = req.body.getReader();
  let size = 0;
  while (true) {
    const { done,value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 24000) {
      await reader.cancel();
      throw new HttpError(413,'Request is too large.');
    }
    chunks.push(value);
  }
  if (!size && !req.headers.has('content-type')) return {};
  requireThat(req.headers.get('content-type')?.split(';')[0] === 'application/json',415,'Send a JSON request.');
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400,'Invalid JSON.'); }
  return validated(z.record(z.string(),z.unknown()),body,'Send a JSON object.');
}
const json = (body,status = 200,headers = {}) => Response.json(body,{
  status, headers:{ 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers }
});

function signingKey() {
  const key = new TextEncoder().encode(process.env.JWT_SECRET ?? '');
  if (key.length < 32) throw new Error('Set JWT_SECRET to at least 32 bytes in .env.');
  return key;
}
async function getSession(db,req) {
  const value = req.headers.get('cookie')?.match(/(?:^|;\s*)meridian_session=([\w.-]+)(?:;|$)/)?.[1];
  if (!value) return null;
  const key = signingKey();
  let payload;
  try { ({ payload } = await jwtVerify(value,key,{ algorithms:['HS256'],issuer:'meridian-workflow' })); }
  catch { return null; }
  if (!payload.jti) return null;
  return db.session.findFirst({
    where:{ token_hash:digest(payload.jti),expires_at:{ gt:Date.now() } },include:{ user:{ select:userView } }
  });
}
async function replaceSession(db,previous,user = null) {
  const id = token(), csrf = token();
  const jwt = await new SignJWT({}).setProtectedHeader({ alg:'HS256' }).setJti(id)
    .setIssuer('meridian-workflow').setExpirationTime(`${ttl}s`).sign(signingKey());
  if (previous) {
    const removed = await db.session.deleteMany({ where:{ token_hash:previous.token_hash,expires_at:{ gt:Date.now() } } });
    requireThat(removed.count === 1,403,'Your session changed. Refresh the page and try again.');
  }
  await db.session.deleteMany({ where:{ expires_at:{ lte:Date.now() } } });
  await db.session.create({ data:{ token_hash:digest(id),user_id:user?.id,csrf,expires_at:Date.now()+ttl*1000 } });
  const cookie = `meridian_session=${jwt}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}` +
    (process.env.SECURE_COOKIES === '1' ? '; Secure' : '');
  return { body:{ user,csrf }, cookie };
}
const sessionResponse = (session,status = 200) => json(session.body,status,{ 'Set-Cookie':session.cookie });

async function authenticate(db,path,body,session) {
  requireThat(!session.user_id,409,'Sign out before switching accounts.');
  const email = field(body,'email',3,254).toLowerCase();
  validated(z.email(),email,'Enter a valid email address.');
  const register = path === '/api/register';
  const password = field(body,'password',register ? 12 : 1,128,false);
  if (!register) {
    const existing = await db.user.findUnique({ where:{ email } });
    const { password_hash, ...user } = existing ?? {};
    const valid = await checkPassword(password,password_hash ??
      'bcrypt-sha256:$2b$12$GY2RAinRha16.MVHd..rUO3jT9De3ep/xhPdBCmlylAxy6ms4GOXm');
    requireThat(existing && valid,401,'The email or password is incorrect.');
    return sessionResponse(await db.$transaction(tx => replaceSession(tx,session,user)));
  }
  const name = field(body,'name',2,100);
  const password_hash = await hashPassword(password);
  try {
    const next = await db.$transaction(async tx => {
      const user = await tx.user.create({ data:{ name,email,password_hash,role:'staff' },select:userView });
      return replaceSession(tx,session,user);
    });
    return sessionResponse(next,201);
  } catch (error) {
    if (error.code === 'P2002') throw new HttpError(409,'This email is already registered.');
    throw error;
  }
}

function taskView(task,user) {
  const { version,deleted,assignedUser,due_date,...fields } = task;
  const owner = task.creator === user.id;
  const manager = user.role === 'manager';
  return { ...fields,due_date:due_date.toISOString().slice(0,10),assignee_name:assignedUser.name,
    can_edit:manager || owner || task.assignee===user.id,can_delete:manager || owner };
}
async function findTask(db,id,lock = false) {
  if (lock) await db.$queryRaw`SELECT id FROM tasks WHERE id=${id} FOR UPDATE`;
  const task = await db.task.findFirst({ where:{ id,deleted:false },include:taskInclude });
  requireThat(task,404,'Task not found.');
  return task;
}
async function taskFields(db,body) {
  const title = field(body,'title',1,160);
  const description = field(body,'description',1,4000);
  const assignee = integer(body.assignee,'assignee');
  const date = field(body,'due_date',10,10);
  const due_date = dateValue(date);
  requireThat(/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(+due_date) &&
    due_date.toISOString().slice(0,10)===date && !date.startsWith('0000-'),400,'Enter a valid due date.');
  const priority = validated(z.enum(priorityValues),body.priority,'Select a valid priority.');
  requireThat(await db.user.findUnique({ where:{ id:assignee },select:{ id:true } }),400,'Select a valid assignee.');
  return { title,description,assignee,due_date,priority };
}
const audit = (db,id,user,action,from_stage = null,to_stage = null) => db.activity.create({
  data:{ task_id:id,actor_id:user.id,action,from_stage,to_stage }
});
async function comments(db,id) {
  const rows = await db.comment.findMany({ where:{ task_id:id },orderBy:{ id:'asc' },
    select:{ author:{ select:{ name:true } },body:true,created_at:true } });
  return rows.map(row => ({ ...row,author:row.author.name }));
}
async function details(db,task,user) {
  const where = { task_id:task.id };
  const [notes,activity,subtasks] = await Promise.all([
    comments(db,task.id),
    db.activity.findMany({ where,orderBy:{ id:'desc' },select:{
      actor:{ select:{ name:true } },action:true,created_at:true,from_stage:true,to_stage:true
    } }),
    db.subtask.findMany({ where,orderBy:{ position:'asc' },select:{ title:true } })
  ]);
  return { ...taskView(task,user),comments:notes,
    activity:activity.map(row => ({ ...row,actor:row.actor.name })),subtasks:subtasks.map(row => row.title) };
}
async function transition(db,task,user,stage,action) {
  await db.task.update({ where:{ id:task.id },data:{ stage,version:{ increment:1 } } });
  await audit(db,task.id,user,action,task.stage,stage);
}
async function mutateTask(db,id,operation,body,user) {
  const task = await findTask(db,id,true);
  const rights = taskView(task,user);
  const where = { id };
  const version = { increment:1 };
  if (operation === 'comments') {
    await db.comment.create({ data:{ task_id:id,author_id:user.id,body:field(body,'body',1,1500) } });
  } else if (operation === 'decision') {
    requireThat(user.role === 'manager',403,'Only managers can decide reviews.');
    requireThat(task.stage === 'review',409,'The task must be in Review.');
    const decision = validated(z.enum(['approve','reject']),body.decision,'Select approve or reject.');
    if (decision === 'approve') await transition(db,task,user,'done','Approved review and moved to Done');
    else {
      await db.comment.create({ data:{ task_id:id,author_id:user.id,
        body:'Review rejected: ' + field(body,'comment',1,1500) } });
      await transition(db,task,user,'in_progress','Rejected review and returned to In Progress');
    }
  } else {
    requireThat(operation === 'delete' ? rights.can_delete : rights.can_edit,403,'You do not have permission to change this task.');
    switch (operation) {
      case 'edit':
        requireThat(task.stage !== 'done',409,'Completed tasks are closed for editing.');
        await db.task.update({ where,data:{ ...(await taskFields(db,body)),version } });
        await audit(db,id,user,'Edited task details');
        break;
      case 'delete':
        await db.task.update({ where,data:{ deleted:true,version } });
        await audit(db,id,user,'Deleted task');
        break;
      case 'stage': {
        const next = { todo:'in_progress',in_progress:'review' }[task.stage];
        const stage = validated(z.enum(stages),body.stage,'Select a valid stage.');
        requireThat(stage === next,409,'Tasks progress in order. A manager decides reviews.');
        await transition(db,task,user,stage,`Moved from ${labels[task.stage]} to ${labels[stage]}`);
        break;
      }
      case 'confirm': {
        const candidate = suggestions.get(body.token);
        requireThat(candidate && candidate.user===user.id && candidate.id===id &&
          candidate.version===task.version && candidate.expires>Date.now() && task.stage!=='done',
          409,'This suggestion expired or the task changed. Request a fresh suggestion.');
        await db.task.update({ where,data:{ priority:candidate.priority,version } });
        await db.subtask.deleteMany({ where:{ task_id:id } });
        await db.subtask.createMany({ data:candidate.subtasks.map((title,i) => ({ task_id:id,position:i+1,title })) });
        await audit(db,id,user,'Confirmed AI priority and subtasks');
        break;
      }
    }
  }
  return { id };
}

async function taskRoute(db,method,path,body,user) {
  const match = path.match(/^\/api\/tasks\/(\d+)(?:\/(stage|decision|comments|summary|suggest|confirm))?$/);
  requireThat(match,404,'API route not found.');
  const id = integer(match[1],'task');
  const operation = match[2];
  if (!operation && method==='GET') return json(await details(db,await findTask(db,id),user));
  if (!operation && ['PATCH','DELETE'].includes(method)) {
    return json(await db.$transaction(tx => mutateTask(tx,id,method==='PATCH'?'edit':'delete',body,user)));
  }
  requireThat(operation && method==='POST',405,'Method not allowed.');
  if (operation==='summary' || operation==='suggest') {
    const task = await findTask(db,id);
    const result = await generate(operation,task,operation==='summary' ? await comments(db,id) : []);
    if (operation==='summary') return json(result);
    for (const [key,value] of suggestions) if (value.expires<=Date.now()) suggestions.delete(key);
    if (suggestions.size>=1000) suggestions.delete(suggestions.keys().next().value);
    const confirmation = token();
    suggestions.set(confirmation,{ ...result,id,user:user.id,version:task.version,expires:Date.now()+600000 });
    return json({ ...result,token:confirmation });
  }
  const result = await db.$transaction(tx => mutateTask(tx,id,operation,body,user));
  if (operation==='confirm') suggestions.delete(body.token);
  return json(result);
}

async function api(req) {
  const db = database();
  const url = new URL(req.url);
  const path = url.pathname;
  const { method } = req;
  const session = await getSession(db,req);
  const user = session?.user ?? null;
  if (path==='/api/session' && method==='GET') {
    return session ? json({ csrf:session.csrf,user })
      : sessionResponse(await db.$transaction(tx => replaceSession(tx,null)));
  }
  const mutation = ['POST','PATCH','DELETE'].includes(method);
  const authEntry = ['/api/register','/api/login'].includes(path) && method==='POST';
  requireThat(authEntry || user,401,'Sign in to continue.');
  if (mutation) requireThat(session && req.headers.get('x-csrf-token')===session.csrf,403,'Refresh the page and try again.');
  const body = mutation ? await readBody(req) : {};
  if (mutation) {
    const valid = await db.session.findFirst({ where:{ token_hash:session.token_hash,expires_at:{ gt:Date.now() } },select:{ token_hash:true } });
    requireThat(valid,403,'Your session changed. Refresh the page and try again.');
  }
  if (authEntry) return authenticate(db,path,body,session);
  if (path==='/api/logout' && method==='POST') return sessionResponse(await db.$transaction(tx => replaceSession(tx,session)));
  if (path==='/api/users' && method==='GET') return json(await db.user.findMany({
    select:{ id:true,name:true },orderBy:[{ name:'asc' },{ id:'asc' }]
  }));
  if (path==='/api/dashboard' && method==='GET') {
    const counts = Object.fromEntries(stages.map(stage => [stage,0]));
    const [rows,overdue] = await Promise.all([
      db.task.groupBy({ by:['stage'],where:{ deleted:false },_count:{ _all:true } }),
      db.task.findMany({ where:{ deleted:false,stage:{ not:'done' },due_date:{ lt:dateValue(today()) } },
        include:taskInclude,orderBy:taskOrder })
    ]);
    for (const row of rows) counts[row.stage] = row._count._all;
    return json({ counts,overdue:overdue.map(task => taskView(task,user)) });
  }
  if (path==='/api/tasks' && method==='GET') {
    const where = { deleted:false };
    for (const [name,values] of [['stage',stages],['assignee',null],['priority',priorityValues]]) {
      const value = url.searchParams.get(name);
      if (value) where[name] = values ? validated(z.enum(values),value,`Invalid ${name} filter.`) : integer(value,name);
    }
    const tasks = await db.task.findMany({ where,include:taskInclude,orderBy:taskOrder });
    return json(tasks.map(task => taskView(task,user)));
  }
  if (path==='/api/tasks' && method==='POST') {
    const id = await db.$transaction(async tx => {
      const task = await tx.task.create({ data:{ ...(await taskFields(tx,body)),creator:user.id } });
      await audit(tx,task.id,user,'Created task',null,'todo');
      return task.id;
    });
    return json({ id },201);
  }
  return taskRoute(db,method,path,body,user);
}

export async function handle(req) {
  try { return await api(req); }
  catch (error) {
    if (!error.status) console.error(error);
    return json({ error:error.status ? error.message : 'Unexpected server error.' },error.status || 500);
  }
}
