import Maskinkoll from '@/components/maskinkoll/Maskinkoll';
import type { Viewport } from 'next';

export const metadata = { title: 'Maskinkoll' };

export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

export default function Page() {
  return <Maskinkoll />;
}
