import type { Metadata, Viewport } from 'next';
import SkotarSida from '@/components/skotarlank/SkotarSida';

// Skotarlänken för en EXTERN skotare. Öppen utan inloggning via en lång slumpad token (middleware släpper igenom exakt /skotare/<token>). Aldrig indexerad.
// Eget appmanifest per länk: installerad på maskindatorn öppnas den i helskärm på just den här trakten.
export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { token: string } }): Metadata {
  return {
    title: 'Skotning — Kompersmåla Skog',
    robots: { index: false, follow: false, nocache: true },
    manifest: `/api/skotare/${params.token}/manifest`,
    appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Skotning' },
  };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#000000' };

export default function Page({ params }: { params: { token: string } }) {
  return <SkotarSida token={params.token} />;
}
