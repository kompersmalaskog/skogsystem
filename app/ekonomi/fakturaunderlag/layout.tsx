import type { ReactNode } from 'react';
import type { Viewport } from 'next';
import { redirect } from 'next/navigation';
import EkonomiBottomNav from '../EkonomiBottomNav';
import FakturaRam from '@/components/faktura/FakturaRam';
import FakturaLista from '@/components/faktura/FakturaLista';
import Lasfel from '@/components/faktura/Lasfel';
import { arAdmin, lasOversikt, serverKlient } from '@/lib/faktura/lasOversikt';
import { byggListVy } from '@/lib/faktura/listaVy';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fakturaunderlag' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

// Listan läses HÄR, en gång: på telefon och iPad stående är den egen sida, från
// 1100 px står den till vänster om trakten (som Mail). FakturaRam avgör vad som
// syns utifrån adressen. Spärren ligger också här, så att [vo]-sidan inte blir
// oskyddad — routen är skyddet, men en förare ska inte mötas av en tom sida.
export default async function Layout({ children }: { children: ReactNode }) {
  const sb = await serverKlient();
  if (!(await arAdmin(sb))) redirect('/arbetsrapport');

  const lasning = await lasOversikt(sb);
  const lista = lasning.ok
    ? <FakturaLista vy={byggListVy(lasning.rader, lasning.utanTrakt, lasning.faktura)} />
    : <Lasfel titel="Kunde inte läsa underlagen" text={lasning.fel} />;

  return (
    <>
      <FakturaRam lista={lista}>{children}</FakturaRam>
      <EkonomiBottomNav />
    </>
  );
}
