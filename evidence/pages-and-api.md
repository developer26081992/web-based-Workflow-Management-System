# Pages and API routes

The browser uses hash routes. All signed-in users may see the dashboard, task list and details. Managers can decide reviews. Staff may edit and move tasks they created or are assigned, and may delete tasks they created.

| Screen | Browser route | Purpose |
|---|---|---|
| Sign in | `/#login` | Start a session with an email and password |
| Register | `/#register` | Create a Staff account |
| Dashboard | `/#dashboard` | View counts for all four stages and open overdue work |
| Tasks | `/#tasks` | Browse tasks and combine stage, assignee and priority filters |
| New task | `/#tasks/new` | Set the task details and start it in To Do |
| Task details | `/#tasks/:id` | View or update work, leave comments, see history, move forward and access AI |
| Edit task | `/#tasks/:id/edit` | Update title, description, assignee, due date and priority |
| Review controls | `/#tasks/:id` for managers reviewing a task | Approve or reject a task in Review |

| Method and route | Purpose |
|---|---|
| GET /api/session | Return current user and session CSRF token |
| POST /api/register | Register Staff and start a session |
| POST /api/login | Validate credentials and rotate the session |
| POST /api/logout | End the authenticated session |
| GET /api/users | List assignee IDs and names |
| GET /api/dashboard | Return stage counts and overdue tasks |
| GET /api/tasks | List tasks with optional stage, assignee and priority filters |
| POST /api/tasks | Create a task and log its creation |
| GET /api/tasks/:id | Fetch one task, comments, activity and subtasks |
| PATCH /api/tasks/:id | Edit fields on an open task |
| DELETE /api/tasks/:id | Hide a task while retaining its audit history |
| POST /api/tasks/:id/stage | Advance To Do to In Progress or In Progress to Review |
| POST /api/tasks/:id/decision | Approve to Done or reject with a comment to In Progress |
| POST /api/tasks/:id/comments | Add a task comment |
| POST /api/tasks/:id/summary | Request a short task and comment summary |
| POST /api/tasks/:id/suggest | Preview a priority and subtasks |
| POST /api/tasks/:id/confirm | Apply a suggestion after confirmation |
