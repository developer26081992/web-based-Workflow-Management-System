# Submission evidence

| Task | Evidence |
|---|---|
| 1 | [ERD image](erd.png), [ERD source](erd.svg), [pages and API routes](pages-and-api.md) |
| 2 | [PostgreSQL schema](../db/schema.sql), [migration runner](../db/migrate.mjs), [seed script](../db/seed.mjs) |
| 3 | [Sign-in screen](01-sign-in.png), [registration form](02-register.png), [registered Staff session](03-registration-success.png), [Staff view of a task in Review](19-staff-review-view.png), [protected task after signing out](20-after-sign-out.png) |
| 4 | [Create](06-create-task.png), [stage and audit history](07-stage-and-activity.png), [edit](08-edit-task.png), [combined filters](09-task-filters.png), [deletion confirmation](10-delete-confirmation.png), [list after deletion](11-task-deleted.png) |
| 5 | [Manager decision controls](15-manager-review.png), [rejection and comment](16-rejection.png), [approval](17-approval.png), [dashboard](04-dashboard-desktop.png) |
| 6 | [Summary](12-ai-summary.png), [suggestion preview](13-ai-suggestions.png), [confirmed subtasks](14-ai-confirmed.png) |
| 7 | [Desktop dashboard](04-dashboard-desktop.png), [mobile dashboard](05-dashboard-mobile.png), [server validation feedback](18-validation.png), [server validation and ORM operations](../lib/api.mjs) |
| 8 | [Git history](git-log.txt), [project setup and sample logins](../README.md), [AI tools used during development](../README.md#ai-tools-used-during-development), [reflection draft](../reflection.md) |

[API verification](verify.mjs) exercises role enforcement, task changes, audit events and AI confirmation. Run it with `node evidence/verify.mjs` against a freshly migrated and seeded disposable PostgreSQL database. It creates a verification account and records reversible demo task changes and deletion.

Screenshots 01–18 use disposable PostgreSQL sample data. Screenshots 19–20 show the same production build connected to Neon.
