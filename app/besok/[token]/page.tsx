import type { Metadata, Viewport } from 'next';
import BesokKlient from '@/components/besok/BesokKlient';

// Besökssidan för markägaren. Öppen utan inloggning via en lång slumpad token (middleware släpper igenom exakt /besok/<token>). Aldrig indexerad.
export const metadata: Metadata = {
  title: 'Följ arbetet — Kompersmåla Skog',
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#000000' };

export const dynamic = 'force-dynamic';

export default function Page({ params }: { params: { token: string } }) {
  return <BesokKlient token={params.token} />;
}
