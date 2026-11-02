import Skyddsrond from '@/components/arbetsmiljo/Skyddsrond';
import type { Viewport } from 'next';

export const metadata = { title: 'Skyddsrond' };

export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

export default function Page() {
  return <Skyddsrond />;
}
