'use client';

// AFFÄRSUPPFÖLJNINGENS FLIKRAD — tre flikar längst ner, på varje sida under /affarsuppfoljning:
//   Räkna      vad ger det?          /affarsuppfoljning/rakna (och stämplingslängd, medelstam) — först, hemkortet öppnar hit
//   Översikt   hur går året?         /affarsuppfoljning (och månadsskärmen)
//   Kvalitet   kör vi bra?           /affarsuppfoljning/kvalitet (och objektskärmen)
//
// SAMMA bottenrad som arbetsrapporten (BottomNavBar i components/arbetsrapport/Arbetsrapport.tsx): halvgenomskinlig och
// suddig, rundade övre hörn, ikonerna i appens kolumn, blå för vald flik. Den globala BottomNav monteras inte här.
// Objektskärmen räknas till Kvalitet, oavsett var man kom ifrån.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AVSTAND, FARG, FONT, IKON, KOLUMN, RADIE, TRAFFYTA, VIKT, medSafeBotten } from '@/lib/design/tokens';
import Ikon from '@/components/design/Ikon';

type Flik = { href: string; ikon: string; etikett: string; match: (p: string) => boolean };

export const FLIKAR: Flik[] = [
  { href: '/affarsuppfoljning/rakna', ikon: 'calculate', etikett: 'Räkna',
    match: p => p.startsWith('/affarsuppfoljning/rakna') || p.startsWith('/affarsuppfoljning/stampling') || p.startsWith('/affarsuppfoljning/medelstam') },
  { href: '/affarsuppfoljning', ikon: 'insights', etikett: 'Översikt',
    match: p => p === '/affarsuppfoljning' || p.startsWith('/affarsuppfoljning/manad') },
  { href: '/affarsuppfoljning/kvalitet', ikon: 'verified', etikett: 'Kvalitet',
    match: p => p.startsWith('/affarsuppfoljning/kvalitet') || p.startsWith('/affarsuppfoljning/objekt') || p.startsWith('/affarsuppfoljning/rotposter') },
];

export default function AffarBottomNav() {
  const pathname = usePathname() || '';
  return (
    <nav aria-label="Affärsuppföljning" style={{
      position: 'fixed', bottom: 0, left: 0, width: '100%', zIndex: 50, boxSizing: 'border-box',
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      padding: `${AVSTAND.m}px max(${AVSTAND.l}px, calc((100% - ${KOLUMN.smal}px) / 2)) ${medSafeBotten(AVSTAND.xl)}`,
      background: 'rgba(31,31,31,0.7)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      borderRadius: `${RADIE.kort}px ${RADIE.kort}px 0 0`, fontFamily: FONT,
    }}>
      {FLIKAR.map(f => {
        const aktiv = f.match(pathname);
        return (
          <Link key={f.href} href={f.href} aria-current={aktiv ? 'page' : undefined}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                     minHeight: TRAFFYTA.primar, minWidth: 64, textDecoration: 'none', color: aktiv ? FARG.bla : FARG.text2 }}>
            <Ikon namn={f.ikon} storlek={IKON.rad} farg="inherit" fylld={aktiv} />
            <span style={{ fontSize: 10, fontWeight: aktiv ? VIKT.halvfet : VIKT.normal, whiteSpace: 'nowrap' }}>{f.etikett}</span>
          </Link>
        );
      })}
    </nav>
  );
}
