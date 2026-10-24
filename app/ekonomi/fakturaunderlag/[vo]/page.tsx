import TraktKlient from '@/components/faktura/TraktKlient';
import { lasManuelltArbete } from '@/lib/faktura/lasManuellt';
import { serverKlient } from '@/lib/faktura/lasOversikt';

export const dynamic = 'force-dynamic';

// Spärren ligger i layouten. Raderna (priserna) hämtas i klienten mot
// /api/faktura/underlag med dry_run — ingenting sparas och ingenting skickas
// till Fortnox härifrån. Det manuella arbetet läses HÄR, eftersom radbyggaren
// inte prissätter det än: det ska synas på trakten utan att låtsas vara en
// fakturarad.
export default async function Page({ params }: { params: Promise<{ vo: string }> }) {
  const { vo } = await params;
  const vonr = decodeURIComponent(vo);
  const sb = await serverKlient();
  const manuellt = await lasManuelltArbete(sb, vonr);
  return <TraktKlient vo={vonr} manuellt={manuellt} />;
}
