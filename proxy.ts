import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString('base64');
  const development = process.env.NODE_ENV === 'development';
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${development ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' ${development ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    `connect-src 'self'${development ? ' ws: wss:' : ''}`,
    "img-src 'self' data:", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'"
  ].join('; ');
  const headers = new Headers(request.headers);
  headers.set('Content-Security-Policy',policy);
  const response = NextResponse.next({ request:{ headers } });
  response.headers.set('Content-Security-Policy',policy);
  response.headers.set('Referrer-Policy','no-referrer');
  response.headers.set('X-Content-Type-Options','nosniff');
  return response;
}

export const config = { matcher: ['/'] };
