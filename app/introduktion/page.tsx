import Introduktion from '@/components/arbetsmiljo/Introduktion';
import type { Viewport } from 'next';

export const metadata = { title: 'Introduktion' };

export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

export default function Page() {
  return <Introduktion />;
}
