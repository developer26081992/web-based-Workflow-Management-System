import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const file = resolve(process.env.DB_PATH || 'data/meridian.sqlite');
mkdirSync(dirname(file), { recursive: true });
export const db = new DatabaseSync(file);
db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
export const one = (sql, ...args) => db.prepare(sql).get(...args);
export const all = (sql, ...args) => db.prepare(sql).all(...args);
export const run = (sql, ...args) => db.prepare(sql).run(...args);
export function transaction(work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
transaction(() => {
  if (!one('PRAGMA user_version').user_version) {
    db.exec(readFileSync(new URL('schema.sql', import.meta.url), 'utf8'));
  }
});

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
export function checkPassword(password, stored) {
  const [salt] = stored.split(':');
  return timingSafeEqual(Buffer.from(stored), Buffer.from(hashPassword(password, salt)));
}
export const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: process.env.APP_TIME_ZONE || 'Africa/Johannesburg',
  year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());
