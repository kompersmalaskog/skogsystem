import Arbetsmiljo from '@/components/arbetsmiljo/Arbetsmiljo';
import type { Viewport } from 'next';

export const metadata = { title: 'Arbetsmiljö' };

export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

export default function Page() {
  return <Arbetsmiljo />;
}
