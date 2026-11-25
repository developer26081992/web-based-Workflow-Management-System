# Meridian Workflow

Meridian Consulting Group's internal task tracker. Built for WDE-40-02, candidate folder WDE-R260038a.

## Run locally

Install Node.js 24 or newer. From this folder run:

```powershell
npm.cmd run seed
npm.cmd start
```

Open http://127.0.0.1:3000. On macOS or Linux, use `npm` in place of `npm.cmd`. There are no third-party runtime dependencies. SQLite is created automatically in `data/meridian.sqlite`. Run the seed command once against a fresh database. Use a different `DB_PATH` to create another demonstration database.

| Role | Email |
|---|---|
| Manager | manager@example.test |
| Staff | staff1@example.test |
| Staff | staff2@example.test |

All three sample users use the demo-only password `MeridianDemo2026!`. Public registration creates Staff accounts. Seed credentials are for the local demonstration.

## Demonstration

1. Sign in as Staff User 1, create a task, and advance it to In Progress and Review.
2. Open the quarterly risk register task and check its comments and activity. Use Summarise and Suggest, then confirm the suggestion to save its priority and subtasks.
3. Sign in as Manager User. Reject a task with a comment, then approve another task in Review. Compare the dashboard totals and overdue list.
4. Filter tasks by stage, assignee and priority. Edit a task and delete a disposable task.

## Configuration and technology

The backend uses Node HTTP, SQLite, scrypt password hashing, database-backed sessions and CSRF validation. The frontend uses HTML, CSS and JavaScript. The server uses prepared statements, and the browser renders user content as text.

The built-in AI mock returns fixed demonstration responses and works offline. To connect a centre-supplied model gateway, set `AI_URL` and optionally `AI_KEY` in the ignored server-side `.env` file. The gateway accepts a JSON POST with `action` (`summary` or `suggest`), `task` (`title` and `description`), and for summaries a `comments` array of up to 20 recent comment strings. It returns either `{"summary":"..."}` or `{"priority":"high","subtasks":["..."]}`. The server sends the key as a Bearer token. Requests time out after eight seconds. Confirmations expire after ten minutes or when a task changes, and update the priority and subtask list together.

Optional settings are `PORT`, `HOST`, `DB_PATH`, `APP_TIME_ZONE` (default `Africa/Johannesburg`), and `SECURE_COOKIES=1` when deployed over HTTPS. Keep provider keys in server-side configuration.

## Evidence and AI use

See [evidence](evidence/) for the ERD, page and API inventory, and demonstration captures. [Reflection](reflection.md) records the development trade-offs. OpenAI Codex (ChatGPT) was used for implementation, documentation, and verification. The application itself uses the fixed mock by default.
