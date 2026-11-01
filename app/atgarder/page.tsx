import Atgarder from '@/components/arbetsmiljo/Atgarder';
import type { Viewport } from 'next';

export const metadata = { title: 'Åtgärder' };

export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

export default function Page() {
  return <Atgarder />;
}
