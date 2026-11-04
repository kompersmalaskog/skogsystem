import SaGorVi from '@/components/arbetsmiljo/SaGorVi';
import type { Viewport } from 'next';

export const metadata = { title: 'Så gör vi' };

export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

export default function Page() {
  return <SaGorVi />;
}
