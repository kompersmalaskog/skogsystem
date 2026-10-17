'use client';

// Brandrisk: EN rad, och bara när någon av de fem dagarna är 3 eller högre. "Brandrisk 3 på onsdag", 4 orange, 5 röd, 5E "Brandrisk 5E på torsdag – inga band".
// Står direkt under Faror — i ⓘ-kortet och i Om trakten. SAMMA data (SMHI fwif1g via lib/smhi-brandrisk) och SAMMA färger (MCF_COLORS) som brandriskpanelen,
// som öppnas av ett tryck och visar dagarna i detalj. Färgen bär aldrig ensam: klassen och dagen står som ord. Misslyckas hämtningen står det (appen gissar aldrig en
// brandrisk); låg risk (1–2) eller laddning ger ingen rad alls — då finns inget att se upp för.

import React, { useEffect, useState } from 'react';
import { fetchSmhiFwi } from '@/lib/smhi-brandrisk';
import { MCF_COLORS } from '@/app/planering/brandrisk-panel';
import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { femDagar, type BrandDag } from '@/lib/objektKort';
import { brandRadText } from '@/lib/omTrakten';
import { Gruppkort, Pil } from './infoDelar';

const CACHE_MS = 30 * 60 * 1000;   // som panelens omhämtning
const cache = new Map<string, { t: number; dagar: BrandDag[] }>();
const nyckel = (lat: number, lng: number) => `${lat.toFixed(2)}_${lng.toFixed(2)}`;
const idagIso = () => new Date().toISOString().split('T')[0];

type Lage = { typ: 'laddar' } | { typ: 'fel' } | { typ: 'klar'; dagar: BrandDag[] };

export default function BrandriskRad({ lat, lng, onOppna, luftUnder = 0 }: { lat: number; lng: number; onOppna: () => void; /** luft under raden — bara när raden finns */ luftUnder?: number }) {
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

  if (lage.typ === 'laddar') return null;
  const rad = lage.typ === 'klar' ? brandRadText(lage.dagar, idagIso()) : null;
  if (lage.typ === 'klar' && !rad) return null;   // låg risk: ingen rad
  const farg = !rad ? FARG.orange : rad.ton === 'rod' ? FARG.rod : rad.ton === 'orange' ? FARG.orange : FARG.text;
  return (
    <div style={{ marginBottom: luftUnder }}>
    <Gruppkort testid="info-brandrisk-kort">
      <button type="button" data-testid="info-brandrisk" data-klass={rad?.klass ?? ''} data-ton={rad?.ton ?? 'fel'} onClick={onOppna} className="press-row"
        style={{ width: '100%', minHeight: TRAFFYTA.primar + AVSTAND.s, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.m, background: 'transparent', border: 'none',
          color: farg, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation', ...TYP.listtitel }}>
        {rad && <span aria-hidden="true" style={{ flexShrink: 0, width: AVSTAND.m, height: AVSTAND.m, borderRadius: RADIE.cirkel, background: MCF_COLORS[rad.klass] ?? FARG.text3 }} />}
        <span data-testid="info-brandrisk-text" style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{rad ? rad.text : 'Brandrisk kunde inte hämtas — öppna för att försöka igen'}</span>
        <Pil />
      </button>
    </Gruppkort>
    </div>
  );
}
