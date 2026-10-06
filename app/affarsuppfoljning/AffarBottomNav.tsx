'use client';

// AFFÄRSUPPFÖLJNINGENS FLIKRAD — tre flikar längst ner, på varje sida under /affarsuppfoljning:
//   Översikt   hur går det?          /affarsuppfoljning (och månadsskärmen)
//   Räkna      vad ska jag bjuda?    /affarsuppfoljning/rakna (och stämplingslängd, medelstam)
//   Kvalitet   kör vi bra?           /affarsuppfoljning/kvalitet (och objektskärmen)
//
// Egen bottenrad per sektion, som app/ekonomi/EkonomiBottomNav.tsx — den globala BottomNav monteras inte här. Raden är full bredd
// men flikarna ligger under innehållskolumnen (samma 480 px som components/Ytform.tsx), så de inte hamnar vid fönsterkanterna på
// en dator. Objektskärmen räknas till Kvalitet, oavsett var man kom ifrån.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DAMPAD, TEXT, LINJE } from '@/components/Ytform';
import { medSafeBotten } from '@/lib/design/tokens'; // hemindikatorn på iPhone

/** Samma kolumnbredd som innehållet (BREDD i components/Ytform.tsx). */
const KOLUMN = 480;

type Flik = { href: string; ikon: string; etikett: string; match: (p: string) => boolean };

export const FLIKAR: Flik[] = [
  { href: '/affarsuppfoljning', ikon: 'insights', etikett: 'Översikt',
    match: p => p === '/affarsuppfoljning' || p.startsWith('/affarsuppfoljning/manad') },
  { href: '/affarsuppfoljning/rakna', ikon: 'calculate', etikett: 'Räkna',
    match: p => p.startsWith('/affarsuppfoljning/rakna') || p.startsWith('/affarsuppfoljning/stampling') || p.startsWith('/affarsuppfoljning/medelstam') },
  { href: '/affarsuppfoljning/kvalitet', ikon: 'verified', etikett: 'Kvalitet',
    match: p => p.startsWith('/affarsuppfoljning/kvalitet') || p.startsWith('/affarsuppfoljning/objekt') },
];

export default function AffarBottomNav() {
  const pathname = usePathname() || '';
  return (
    <nav aria-label="Affärsuppföljning" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
      background: '#0c0c0e', borderTop: LINJE,
      paddingBottom: medSafeBotten(8),
      fontFamily: "'Geist', system-ui, sans-serif",
    }}>
      <div style={{ display: 'flex', maxWidth: KOLUMN, margin: '0 auto' }}>
        {FLIKAR.map(f => {
          const aktiv = f.match(pathname);
          return (
            <Link key={f.href} href={f.href} aria-current={aktiv ? 'page' : undefined}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                       minHeight: 56, padding: '6px 0', textDecoration: 'none', color: aktiv ? TEXT : DAMPAD }}>
              <span className="material-symbols-outlined" aria-hidden="true"
                style={{ fontSize: 22, lineHeight: 1, fontVariationSettings: aktiv ? "'FILL' 1" : "'FILL' 0" }}>{f.ikon}</span>
              <span style={{ fontSize: 11, fontWeight: aktiv ? 600 : 500, whiteSpace: 'nowrap' }}>{f.etikett}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
