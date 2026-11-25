import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in the server environment or .env.');
const url = new URL(process.env.DATABASE_URL);
if (url.hostname.endsWith('.neon.tech')) url.searchParams.set('sslmode','verify-full');
const pool = new pg.Pool({
  connectionString: url.toString(),
  enableChannelBinding: true,
  connectionTimeoutMillis: 15000
});
pool.on('error', error => console.error('Idle database connection error:',error.code ?? error.name));

const current = new AsyncLocalStorage();
export const run = (sql, ...args) => (current.getStore() ?? pool).query(sql,args);
export const all = async (sql, ...args) => (await run(sql,...args)).rows;
export const one = async (sql, ...args) => (await all(sql,...args))[0];
export const close = () => pool.end();

export async function transaction(work) {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    const result = await current.run(client,work);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { discard = true; }
    throw error;
  } finally {
    client.release(discard);
  }
}

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
