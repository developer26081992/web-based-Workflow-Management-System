CREATE TABLE roles (id TEXT PRIMARY KEY CHECK (id IN ('staff','manager')), label TEXT NOT NULL UNIQUE);
CREATE TABLE stages (id TEXT PRIMARY KEY, label TEXT NOT NULL UNIQUE, position INTEGER NOT NULL UNIQUE);
CREATE TABLE users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE CHECK (email=lower(email)),
  password_hash TEXT NOT NULL, role TEXT NOT NULL REFERENCES roles(id)
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL, expires_at BIGINT NOT NULL
);
CREATE TABLE tasks (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
  assignee INTEGER NOT NULL REFERENCES users(id), creator INTEGER NOT NULL REFERENCES users(id),
  due_date DATE NOT NULL,
  priority TEXT NOT NULL CHECK(priority IN ('low','medium','high')),
  stage TEXT NOT NULL DEFAULT 'todo' REFERENCES stages(id),
  version INTEGER NOT NULL DEFAULT 0,
  deleted BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE comments (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id),
  author_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL CHECK(length(trim(body))>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE activity (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id),
  actor_id INTEGER NOT NULL REFERENCES users(id), action TEXT NOT NULL,
  from_stage TEXT REFERENCES stages(id), to_stage TEXT REFERENCES stages(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE subtasks (
  task_id INTEGER NOT NULL REFERENCES tasks(id), position INTEGER NOT NULL,
  title TEXT NOT NULL, PRIMARY KEY(task_id,position)
);
CREATE INDEX tasks_filter ON tasks(deleted,stage,assignee,priority);
CREATE INDEX comments_task ON comments(task_id,id);
CREATE INDEX activity_task ON activity(task_id,id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
INSERT INTO roles VALUES ('staff','Staff'),('manager','Manager');
INSERT INTO stages VALUES ('todo','To Do',1),('in_progress','In Progress',2),('review','Review',3),('done','Done',4);
