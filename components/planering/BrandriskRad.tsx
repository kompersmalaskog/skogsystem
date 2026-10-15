'use client';

// Brandrisk i objektkortet: fem dagar som små färgstreck (idag först). SAMMA data (SMHI fwif1g via lib/smhi-brandrisk) och SAMMA färger
// (MCF_COLORS i brandriskpanelen) som panelen. Tryck öppnar den befintliga brandriskpanelen. Färgen bär aldrig ensam: varje streck har dagen och
// SMHI-klassen (1–6) som siffra, och raden säger i ord hur det är idag. Misslyckas hämtningen står det — appen gissar aldrig en brandrisk.

import React, { useEffect, useState } from 'react';
import { fetchSmhiFwi } from '@/lib/smhi-brandrisk';
import { MCF_COLORS } from '@/app/planering/brandrisk-panel';
import { AVSTAND, FARG, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { brandKlassText, femDagar, type BrandDag } from '@/lib/objektKort';
import { Pil } from './infoDelar';

const CACHE_MS = 30 * 60 * 1000;   // som panelens omhämtning
const cache = new Map<string, { t: number; dagar: BrandDag[] }>();
const nyckel = (lat: number, lng: number) => `${lat.toFixed(2)}_${lng.toFixed(2)}`;
const idagIso = () => new Date().toISOString().split('T')[0];

type Lage = { typ: 'laddar' } | { typ: 'fel' } | { typ: 'klar'; dagar: BrandDag[] };

export default function BrandriskRad({ lat, lng, onOppna }: { lat: number; lng: number; onOppna: () => void }) {
  const [lage, setLage] = useState<Lage>(() => {
    const c = cache.get(nyckel(lat, lng));
    return c && Date.now() - c.t < CACHE_MS ? { typ: 'klar', dagar: c.dagar } : { typ: 'laddar' };
  });

  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const k = nyckel(lat, lng);
    const c = cache.get(k);
    if (c && Date.now() - c.t < CACHE_MS) { setLage({ typ: 'klar', dagar: c.dagar }); return; }
    let avbruten = false;
    setLage({ typ: 'laddar' });
    fetchSmhiFwi(lat, lng).then((d) => {
      if (avbruten) return;
      const dagar = femDagar(d.daily, idagIso());
      if (dagar.length === 0) { setLage({ typ: 'fel' }); return; }
      cache.set(k, { t: Date.now(), dagar });
      setLage({ typ: 'klar', dagar });
    }).catch(() => { if (!avbruten) setLage({ typ: 'fel' }); });
    return () => { avbruten = true; };
  }, [lat, lng]);

  const idag = lage.typ === 'klar' ? lage.dagar[0] : null;
  return (
    <button type="button" data-testid="info-brandrisk" onClick={onOppna} className="press-row"
      style={{ width: '100%', minHeight: TRAFFYTA.primar + AVSTAND.s, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, display: 'block', background: 'transparent', border: 'none', borderTop: `1px solid ${FARG.linje}`,
        color: FARG.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
        <span style={{ flex: 1, minWidth: 0, ...TYP.text }}>
          Brandrisk
          <span style={{ display: 'block', ...TYP.meta, color: FARG.text2 }}>
            {lage.typ === 'laddar' ? 'Hämtar brandrisk från SMHI …'
              : lage.typ === 'fel' ? 'Kunde inte hämtas — öppna för att försöka igen'
              : idag ? `Idag: ${brandKlassText(idag.klass).toLowerCase()}` : ''}
          </span>
        </span>
        <Pil />
      </span>
      {lage.typ === 'klar' && (
        <span data-testid="info-brandrisk-dagar" style={{ display: 'flex', gap: AVSTAND.s, marginTop: AVSTAND.s }}>
          {lage.dagar.map((d, i) => (
            <span key={`${d.dag}-${i}`} data-testid="info-brandrisk-dag" data-klass={d.klass} aria-label={`${d.dag}: ${brandKlassText(d.klass)} (klass ${d.klass})`}
              style={{ flex: 1, minWidth: 0, display: 'block', textAlign: 'center' }}>
              <span aria-hidden="true" style={{ display: 'block', height: AVSTAND.s, borderRadius: RADIE.stapel, background: MCF_COLORS[d.klass] ?? FARG.text3 }} />
              <span style={{ display: 'block', marginTop: AVSTAND.xs, ...TYP.meta, color: i === 0 ? FARG.text : FARG.text2, ...TNUM }}>{d.dag} {d.klass}</span>
            </span>
          ))}
        </span>
      )}
    </button>
  );
}
