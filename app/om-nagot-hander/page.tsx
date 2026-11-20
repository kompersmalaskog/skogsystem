import OmNagotHander from '@/components/arbetsmiljo/OmNagotHander';
import type { Viewport } from 'next';

export const metadata = { title: 'Om något händer' };

export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

export default function Page() {
  return <OmNagotHander />;
}
