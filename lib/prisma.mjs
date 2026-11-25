import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

let client;
export function database() {
  if (client) return client;
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env.');
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname.endsWith('.neon.tech')) url.searchParams.set('sslmode','verify-full');
  client = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url.toString(), connectionTimeoutMillis: 15000, enableChannelBinding: true
    }),
    transactionOptions: { maxWait: 15000 }
  });
  return client;
}
