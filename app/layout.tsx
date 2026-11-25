import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '../public/style.css';
import './tailwind.css';

export const metadata: Metadata = { title: 'Meridian Workflow' };
export const viewport: Viewport = { themeColor: '#191c31' };
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}<noscript>Enable JavaScript to use Meridian Workflow.</noscript></body></html>;
}
