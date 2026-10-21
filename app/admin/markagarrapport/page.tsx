import type { Viewport } from 'next';
import { adminSupabase } from '@/lib/markagarrapport/admin';
import { AVSTAND, FARG, TYP } from '@/lib/design/tokens';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Markägarrapport' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

// Listan bor i layouten (MarkagarRam). Här står bara det som syns i rapportytan på stor skärm innan något är valt;
// under 1100 px är rapportytan dold på den här adressen och listan fyller skärmen.
export default async function Page() {
  await adminSupabase();
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: AVSTAND.xl }}>
      <p style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>Välj en avverkning till vänster</p>
    </div>
  );
}
