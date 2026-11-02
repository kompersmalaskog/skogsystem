import MaskinRisker from '@/components/arbetsmiljo/MaskinRisker';
import type { Viewport } from 'next';

export const metadata = { title: 'Riskbedömning' };

export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

export default function Page() {
  return <MaskinRisker />;
}
