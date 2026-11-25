import assert from 'node:assert/strict';

const base = process.env.TEST_URL || 'http://127.0.0.1:3000';
function client() {
  let cookie, csrf;
  return async (path, method = 'GET', body, status = 200) => {
    const response = await fetch(base + '/api/' + path, {
      method, headers: {
        ...(cookie && { cookie }), ...(csrf && { 'X-CSRF-Token':csrf }),
        ...(body !== undefined && { 'Content-Type':'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const value = await response.json();
    assert.equal(response.status,status,method + ' ' + path + ' ' + JSON.stringify(value));
    cookie = response.headers.getSetCookie()[0]?.split(';')[0] ?? cookie;
    csrf = value.csrf ?? csrf;
    return value;
  };
}
const staff = client(), manager = client(), guest = client(), secondStaff = client();
const password = 'MeridianDemo2026!';
await guest('tasks','GET',undefined,401);
await guest('session');
await guest('register','POST',{ name:'Temporary Staff',email:'verification-'+Date.now()+'@example.test',password,role:'manager' },201);
assert.equal((await guest('session')).user.role,'staff');
await guest('logout','POST',{});
await guest('dashboard','GET',undefined,401);
for (const [request,email] of [[staff,'staff1'],[manager,'manager'],[secondStaff,'staff2']]) {
  await request('session');
  await request('login','POST',{email:email+'@example.test',password:'incorrect'},401);
  await request('login','POST',{email:email+'@example.test',password});
}
const initial = await staff('dashboard');
assert.deepEqual(initial.counts,{ todo:3,in_progress:3,review:2,done:2 });
assert.equal(initial.overdue.length,2);
const fields = { title:'Verify regional handover',description:'Collect the outstanding delivery notes.', assignee:2,due_date:'2027-02-28',priority:'low' };
await staff('tasks','POST',{...fields,due_date:'2027-02-29'},400);
await staff('tasks','POST',{...fields,assignee:9999},400);
await staff('tasks','POST',{...fields,assignee:2147483648},400);
await staff('tasks','POST',{...fields,title:'Invalid\0title'},400);
const { id } = await staff('tasks','POST',fields,201);
const path = 'tasks/'+id;
await staff(path,'PATCH',{...fields,title:'Verify regional handover edits'});
await secondStaff(path,'PATCH',fields,403);
await staff(path+'/stage','POST',{stage:'done'},409);
await staff(path+'/stage','POST',{stage:'in_progress'});
assert.equal((await staff('tasks?stage=in_progress&assignee=2&priority=low')).some(t => t.id===id),true);
await secondStaff(path+'/comments','POST',{body:'Review the final delivery notes.'});
assert.equal((await staff(path)).comments.length,1);
assert.ok((await staff(path+'/summary','POST',{})).summary);
const preview = await staff(path+'/suggest','POST',{});
assert.equal((await staff(path)).priority,'low');
assert.deepEqual((await staff(path)).subtasks,[]);
await secondStaff(path+'/confirm','POST',{token:preview.token},403);
await staff(path+'/confirm','POST',{token:preview.token});
assert.deepEqual((await staff(path)).subtasks,preview.subtasks);
await staff(path+'/confirm','POST',{token:preview.token},409);
await staff(path+'/stage','POST',{stage:'review'});
await staff(path+'/decision','POST',{decision:'approve'},403);
await manager(path+'/decision','POST',{decision:'reject',comment:' '},400);
await manager(path+'/decision','POST',{decision:'reject',comment:'Add the updated delivery notes.'});
let details = await manager(path);
assert.equal(details.stage,'in_progress');
assert.match(details.comments.at(-1).body,/updated delivery notes/);
await staff(path+'/stage','POST',{stage:'review'});
await manager(path+'/decision','POST',{decision:'approve'});
details = await manager(path);
assert.equal(details.stage,'done');
assert.equal(details.activity[0].actor,'Manager User');
assert.equal(details.activity[0].from_stage,'review');
assert.ok(details.activity[0].created_at);
await staff(path,'PATCH',fields,409);
await secondStaff(path,'DELETE',undefined,403);
await staff(path,'DELETE');
await staff(path,'GET',undefined,404);
assert.deepEqual((await manager('dashboard')).counts,initial.counts);
console.log('Pass: registration, sign-in/out, access control, CRUD, filters, validation, workflow, audit, dashboard, comments and AI confirmation.');
