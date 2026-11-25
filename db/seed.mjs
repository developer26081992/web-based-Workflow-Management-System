import { all, run, transaction, hashPassword, today } from './database.mjs';

transaction(() => {
  if (all('SELECT id FROM users LIMIT 1').length) throw new Error('Seed requires a fresh database.');
  const password = 'MeridianDemo2026!';
  for (const [name, email, role] of [
    ['Manager User','manager@example.test','manager'],
    ['Staff User 1','staff1@example.test','staff'],
    ['Staff User 2','staff2@example.test','staff']
  ]) run('INSERT INTO users(name,email,role,password_hash) VALUES (?,?,?,?)', name,email,role,hashPassword(password));

  const tasks = [
    ['Draft the December client briefing','Review the latest delivery notes and draft the opening section for the December client briefing.','todo',2,'high',2],
    ['Refresh the engagement tracker','Reconcile active engagements with the finance export and flag records that need follow-up.','todo',3,'medium',6],
    ['Schedule regional onboarding','Collect availability from regional leads and propose two time slots.','todo',2,'low',9],
    ['Reconcile the October invoice register','Check outstanding invoices against the ledger and document differences.','in_progress',2,'high',-4],
    ['Update the client handover checklist','Confirm handover owners and add the final data access steps.','in_progress',3,'medium',3],
    ['Validate survey reporting figures','Compare the reported totals to the source workbook and record discrepancies.','in_progress',2,'low',7],
    ['Review the quarterly risk register','Consolidate mitigations from the regional offices and prepare the current risk register for approval.','review',2,'high',-2],
    ['Check the procurement summary','Verify totals and sign-off references in the procurement summary.','review',3,'medium',4],
    ['Publish the meeting notes','Upload the agreed meeting notes and record action owners.','done',2,'low',-6],
    ['Archive the September timesheets','Check that timesheets are complete and archive the final export.','done',3,'medium',-9]
  ];
  for (const [title, description, stage, assignee, priority, offset] of tasks) {
    const date = new Date(today() + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + offset);
    const { lastInsertRowid: id } = run(
      'INSERT INTO tasks(title,description,assignee,creator,due_date,priority,stage) VALUES (?,?,?,?,?,?,?)',
      title,description,assignee,assignee,date.toISOString().slice(0,10),priority,stage
    );
    run('INSERT INTO activity(task_id,actor_id,action,to_stage) VALUES (?,?,?,?)',id,assignee,'Seeded task',stage);
  }
  run('INSERT INTO comments(task_id,author_id,body) VALUES (?,?,?)',7,2,'Regional leads have confirmed their mitigation owners.');
  run('INSERT INTO comments(task_id,author_id,body) VALUES (?,?,?)',7,1,'Please verify that the supporting notes include the updated target dates.');
});
console.log('Seeded three users and ten tasks.');
