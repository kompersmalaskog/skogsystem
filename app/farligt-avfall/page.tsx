import Avfall from '@/components/arbetsmiljo/Avfall';
import type { Viewport } from 'next';

export const metadata = { title: 'Farligt avfall' };

export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

export default function Page() {
  return <Avfall />;
}
