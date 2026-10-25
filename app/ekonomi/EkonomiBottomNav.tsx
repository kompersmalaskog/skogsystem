'use client';

// Ekonomins meny — FEM flikar (iOS har högst fem): Översikt · Ackord ·
// Resultat · Faktura · Mer. Priser och Inställningar öppnas sällan och
// ligger under Mer. Per klass är inte en egen flik längre: det är samma
// data som Ackord ur en annan vinkel (skillen: tabbar är vinklar av samma
// data, inte navigation), så den är en växel inne i Ackord.
//
// Telefon och iPad: appens Bottenmeny längst ner (components/design).
// Från 1100 px (dator, iPad liggande): samma val som en kolumn till
// vänster, och sidans innehåll flyttas åt höger — som Mail. En komponent,
// två lägen, valet görs med CSS så att ingenting blinkar vid laddning.

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Bottenmeny, { type BottenmenyPost } from '@/components/design/Bottenmeny';
import Ark from '@/components/design/Ark';
import Rad from '@/components/design/Rad';
import Ikon from '@/components/design/Ikon';
import { AVSTAND, FARG, IKON, RADIE, TRAFFYTA, TYP, VIKT, underTopbar } from '@/lib/design/tokens';

type Flik = 'oversikt' | 'ackord' | 'resultat' | 'faktura' | 'mer';

export const EKONOMI_FLIKAR: readonly BottenmenyPost<Flik>[] = [
  { id: 'oversikt', etikett: 'Översikt', ikon: 'insights' },
  { id: 'ackord', etikett: 'Ackord', ikon: 'balance' },
  { id: 'resultat', etikett: 'Resultat', ikon: 'account_balance' },
  { id: 'faktura', etikett: 'Faktura', ikon: 'receipt_long' },
  { id: 'mer', etikett: 'Mer', ikon: 'more_horiz' },
];

const HREF: Record<Exclude<Flik, 'mer'>, string> = {
  oversikt: '/ekonomi',
  ackord: '/ekonomi/mot-ackord',
  resultat: '/ekonomi/resultat',
  faktura: '/ekonomi/fakturaunderlag',
};

/** Det som ligger under Mer. */
export const MER_SIDOR = [
  { href: '/ekonomi/prislista', titel: 'Priser', under: 'Vad vi får betalt per kubik och per timme' },
  { href: '/ekonomi/installningar', titel: 'Inställningar', under: 'Kostnadsställen och synk med Fortnox' },
] as const;

/** Vilken flik en adress hör till. Okänd ekonomiadress = Översikt. */
export function aktivFlik(pathname: string): Flik {
  if (pathname.startsWith('/ekonomi/mot-ackord') || pathname.startsWith('/ekonomi/per-klass')) return 'ackord';
  if (pathname.startsWith('/ekonomi/resultat')) return 'resultat';
  if (pathname.startsWith('/ekonomi/fakturaunderlag')) return 'faktura';
  if (MER_SIDOR.some(s => pathname.startsWith(s.href))) return 'mer';
  return 'oversikt';
}

/** Sidokolumnens bredd från 1100 px. */
export const SIDOMENY_BREDD = 240;
export const SIDOMENY_FRAN_PX = 1100;

// Inga citattecken i selektorerna: React escapar dem i <style> vid serverrendering.
// !important: rotlayoutens <body> har style={{padding:0}} inline, som annars vinner
// och lägger sidomenyn OVANPÅ innehållet (Faktura-listan hamnade under menyn).
const CSS = `
.ek-sidomeny{display:none}
@media (min-width:${SIDOMENY_FRAN_PX}px){
  .ek-bottenmeny{display:none}
  .ek-sidomeny{display:block}
  body{padding-left:${SIDOMENY_BREDD}px !important}
}
`;

export default function EkonomiBottomNav() {
  const pathname = usePathname() || '';
  const router = useRouter();
  const [merOppen, setMerOppen] = useState(false);
  const aktiv = aktivFlik(pathname);

  const valj = (id: Flik) => {
    if (id === 'mer') { setMerOppen(true); return; }
    router.push(HREF[id]);
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="ek-bottenmeny">
        <Bottenmeny poster={EKONOMI_FLIKAR} aktiv={aktiv} onVal={valj} etikett="Ekonomi" />
      </div>

      <nav className="ek-sidomeny" aria-label="Ekonomi"
        style={{
          position: 'fixed', left: 0, top: underTopbar(), bottom: 0, width: SIDOMENY_BREDD, zIndex: 40,
          boxSizing: 'border-box', padding: `${AVSTAND.l}px ${AVSTAND.s}px`, background: FARG.kort,
          borderRight: `1px solid ${FARG.linje}`, overflowY: 'auto',
        }}>
        <div style={{ ...TYP.micro, color: FARG.text2, margin: `0 ${AVSTAND.s}px ${AVSTAND.s}px` }}>Ekonomi</div>
        {[...EKONOMI_FLIKAR.filter(f => f.id !== 'mer').map(f => ({ id: f.id as Flik, href: HREF[f.id as Exclude<Flik, 'mer'>], titel: f.etikett, ikon: f.ikon })),
          ...MER_SIDOR.map(s => ({ id: 'mer' as Flik, href: s.href, titel: s.titel, ikon: s.href.endsWith('prislista') ? 'sell' : 'settings' }))]
          .map(p => {
            const vald = p.id === 'mer' ? pathname.startsWith(p.href) : p.id === aktiv;
            return (
              <button key={p.href} type="button" aria-current={vald ? 'page' : undefined} onClick={() => router.push(p.href)}
                style={{
                  display: 'flex', alignItems: 'center', gap: AVSTAND.m, width: '100%', minHeight: TRAFFYTA.min,
                  padding: `0 ${AVSTAND.s}px`, border: 'none', borderRadius: RADIE.rad, cursor: 'pointer', fontFamily: 'inherit',
                  background: vald ? FARG.upphojt : 'transparent', color: vald ? FARG.bla : FARG.text,
                  ...TYP.text, fontWeight: vald ? VIKT.halvfet : VIKT.normal, textAlign: 'left',
                }}>
                <Ikon namn={p.ikon} storlek={IKON.text} farg="inherit" fylld={vald} />
                {p.titel}
              </button>
            );
          })}
      </nav>

      {merOppen && (
        <Ark rubrik="Mer" stang="Klar" onStang={() => setMerOppen(false)}>
          {MER_SIDOR.map((s, i) => (
            <Rad key={s.href} titel={s.titel} under={s.under} href={s.href} sista={i === MER_SIDOR.length - 1} />
          ))}
        </Ark>
      )}
    </>
  );
}
