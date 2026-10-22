'use client';
// Listan över objekt: sök överst, sedan Pågår, Planerade och de avslutade per månad. En rad = namn, "Slutavverkning ·
// 21 aug" och objektets tid till höger. Samma komponent är egen sida på telefon och sidokolumn på stor skärm (OversiktRam).
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AVSTAND, FARG, IKON, KNAPP, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import { grupperaPoster, sokPoster, type ListPost } from '@/lib/objektoversikt/vy';

const BAS = '/admin/objektoversikt';

export default function Lista({ poster, fel, valt }: { poster: ListPost[]; fel: string | null; valt: string | null }) {
  const router = useRouter();
  const [fraga, setFraga] = useState('');
  const grupper = useMemo(() => grupperaPoster(sokPoster(poster, fraga)), [poster, fraga]);

  if (fel) {
    return (
      <div data-lista-fel="">
        <p style={{ margin: 0, ...TYP.listtitel }}>Kunde inte läsa {fel}</p>
        <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Listan visas när läsningen går igenom.</p>
        <button type="button" onClick={() => router.refresh()} style={{ ...KNAPP.lank, marginTop: AVSTAND.s }}>Försök igen</button>
      </div>
    );
  }
  if (poster.length === 0) {
    return <p style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>Inga objekt än. De kommer hit när ett objekt är planerat.</p>;
  }

  return (
    <div>
      <style>{`.oo-sida [aria-current=page] { background: ${FARG.upphojt}; width: calc(100% + ${2 * AVSTAND.l}px) !important; margin: 0 -${AVSTAND.l}px; padding-left: ${AVSTAND.l}px !important; padding-right: ${AVSTAND.l}px !important; border-radius: ${RADIE.rad}px; }`}</style>
      <div style={{ position: 'relative', marginBottom: AVSTAND.xl }}>
        <span className="material-symbols-outlined" aria-hidden="true"
          style={{ position: 'absolute', left: AVSTAND.m, top: '50%', transform: 'translateY(-50%)', fontSize: IKON.rad, color: FARG.text3, pointerEvents: 'none' }}>search</span>
        <input type="search" value={fraga} onChange={e => setFraga(e.target.value)} placeholder="Sök objekt" aria-label="Sök objekt"
          style={{ width: '100%', boxSizing: 'border-box', minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px 0 ${AVSTAND.xxl + AVSTAND.s}px`, background: FARG.kort, border: 'none', borderRadius: RADIE.rad, color: FARG.text, ...TYP.text, fontFamily: 'inherit', colorScheme: 'dark' }} />
      </div>
      {grupper.length === 0 && (
        <p style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>Inget objekt matchar &ldquo;{fraga.trim()}&rdquo;.</p>
      )}
      {grupper.map(g => (
        <Sektion key={g.nyckel} rubrik={g.rubrik} inset>
          {g.poster.map((p, i) => (
            <Rad
              key={p.id}
              titel={p.namn}
              under={p.under || undefined}
              hoger={p.hoger}
              href={`${BAS}/${encodeURIComponent(p.id)}`}
              sista={i === g.poster.length - 1}
              attr={p.id === valt ? { 'aria-current': 'page', 'data-objekt': p.id } : { 'data-objekt': p.id }}
            />
          ))}
        </Sektion>
      ))}
    </div>
  );
}
