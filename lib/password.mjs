import { createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import bcrypt from 'bcryptjs';

const derive = promisify(scrypt);
const prefix = 'bcrypt-sha256:';
const passwordInput = password => createHash('sha256').update(password).digest('base64');
export const hashPassword = async password => prefix + await bcrypt.hash(passwordInput(password),12);

export async function checkPassword(password, stored) {
  if (stored.startsWith(prefix)) return bcrypt.compare(passwordInput(password),stored.slice(prefix.length));
  const match = /^([a-f0-9]{32}):([a-f0-9]{128})$/.exec(stored);
  if (!match) return false;
  return timingSafeEqual(await derive(password,match[1],64), Buffer.from(match[2],'hex'));
}
