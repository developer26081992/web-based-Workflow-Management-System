import { readFileSync } from 'node:fs';
import { close, one, run, transaction } from './database.mjs';

try {
  await transaction(async () => {
    await run('SELECT pg_advisory_xact_lock(260038)');
    await run('CREATE TABLE IF NOT EXISTS meridian_migrations (version INTEGER PRIMARY KEY)');
    if (await one('SELECT version FROM meridian_migrations WHERE version=$1',1)) return;
    await run(readFileSync(new URL('schema.sql',import.meta.url),'utf8'));
    await run('INSERT INTO meridian_migrations(version) VALUES ($1)',1);
  });
  console.log('Meridian database schema is ready.');
} finally {
  await close();
}
