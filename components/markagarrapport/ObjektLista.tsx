'use client';
// Listan över avverkningar: sök överst, sedan en grupp per månad (nyast först). En rad = namn, "13 okt · markägare"
// och volymen till höger. Samma komponent är egen sida på telefon och sidokolumn på stor skärm (MarkagarRam).
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AVSTAND, FARG, IKON, KNAPP, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import { grupperaPerManad, sok, underText, type ListRad } from '@/lib/markagarrapport/lista';
import { heltal } from '@/lib/markagarrapport/vy';

const BAS = '/admin/markagarrapport';

export default function ObjektLista({ rader, fel, valt }: { rader: ListRad[]; fel: string | null; valt: string | null }) {
  const router = useRouter();
  const [fraga, setFraga] = useState('');
  const grupper = useMemo(() => grupperaPerManad(sok(rader, fraga)), [rader, fraga]);

  if (fel) {
    return (
      <div data-lista-fel="">
        <p style={{ margin: 0, ...TYP.listtitel }}>Kunde inte läsa {fel}</p>
        <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Listan visas när läsningen går igenom.</p>
        <button type="button" onClick={() => router.refresh()} style={{ ...KNAPP.lank, marginTop: AVSTAND.s }}>Försök igen</button>
      </div>
    );
  }
  if (rader.length === 0) {
    return (
      <p style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>
        Inga slutavverkningar med inlästa träd än. De kommer hit när skördarens filer har lästs in.
      </p>
    );
  }

  return (
    <div>
      <style>{`.mr-sida [aria-current=page] { background: ${FARG.upphojt}; margin: 0 -${AVSTAND.l}px; padding-left: ${AVSTAND.l}px !important; padding-right: ${AVSTAND.l}px !important; border-radius: ${RADIE.rad}px; }`}</style>
      <div style={{ position: 'relative', marginBottom: AVSTAND.xl }}>
        <span className="material-symbols-outlined" aria-hidden="true"
          style={{ position: 'absolute', left: AVSTAND.m, top: '50%', transform: 'translateY(-50%)', fontSize: IKON.rad, color: FARG.text3, pointerEvents: 'none' }}>search</span>
        <input type="search" value={fraga} onChange={e => setFraga(e.target.value)} placeholder="Sök avverkning eller markägare" aria-label="Sök avverkning eller markägare"
          style={{ width: '100%', boxSizing: 'border-box', minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px 0 ${AVSTAND.xxl + AVSTAND.s}px`, background: FARG.kort, border: 'none', borderRadius: RADIE.rad, color: FARG.text, ...TYP.text, fontFamily: 'inherit', colorScheme: 'dark' }} />
      </div>
      {grupper.length === 0 && (
        <p style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>Ingen avverkning matchar &ldquo;{fraga.trim()}&rdquo;.</p>
      )}
      {grupper.map(g => (
        <Sektion key={g.nyckel} rubrik={g.rubrik} inset>
          {g.rader.map((r, i) => (
            <Rad
              key={r.objekt_id}
              titel={r.namn}
              under={underText(r) || undefined}
              hoger={`${heltal(r.volym_m3)} m³`}
              href={`${BAS}/${encodeURIComponent(r.objekt_id)}`}
              sista={i === g.rader.length - 1}
              attr={r.objekt_id === valt ? { 'aria-current': 'page', 'data-objekt': r.objekt_id } : { 'data-objekt': r.objekt_id }}
            />
          ))}
        </Sektion>
      ))}
    </div>
  );
}
