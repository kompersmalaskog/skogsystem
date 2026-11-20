import Kemikalier from '@/components/arbetsmiljo/Kemikalier';
import type { Viewport } from 'next';

export const metadata = { title: 'Kemikalier' };

export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

export default function Page() {
  return <Kemikalier />;
}
