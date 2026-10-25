'use client';

// TRAKTER — "hur gick det på en trakt?" Affärsuppföljningens tredje flik (2026-10-25, ersätter Kvalitet och Rotposter som egna ställen).
// En rad per avverkad trakt (Vidas slutavverkningar och gallringar), nyast först, grupperad på månaden avverkningen började.
// Växeln Alla | Rotposter visar bara trakterna köpta på rot. Ett tryck öppnar TRAKTSIDAN (/affarsuppfoljning/objekt/<id>), där allt
// om trakten står: vad det blev, massavedens längd, rötan och stämplingen.
//
// Raden: namnet, under det typen (och "Rotpost"), till höger kubiken. Inget annat — talen bor på traktsidan.
// Adressen bär växeln: ?visa=rot.

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AVSTAND } from '@/lib/design/tokens';
import Flikkontroll from '@/components/design/Flikkontroll';
import { SIDA, nf0, stor, manadEtikett, kortObjekt, Rubrik, Rad, Rader, Laddar, Fel } from '@/components/Ytform';
import type { LasFel } from '@/lib/medelstam/las';
import { lasTrakter } from '@/lib/rotpost/las';
import { perManad, type Trakt } from '@/lib/rotpost/uppfoljning';

const BAS = '/affarsuppfoljning/trakter';
type Visa = 'alla' | 'rot';
const traktHref = (id: string) => `/affarsuppfoljning/objekt/${encodeURIComponent(id)}`;

function Innehall() {
  const sp = useSearchParams();
  const router = useRouter();
  const visa: Visa = sp.get('visa') === 'rot' ? 'rot' : 'alla';
  const [lista, setLista] = useState<Trakt[] | null>(null);
  const [fel, setFel] = useState<LasFel | null>(null);

  const hamta = useCallback(async () => {
    setFel(null); setLista(null);
    const r = await lasTrakter();
    if (!r.ok) { setFel(r.fel); return; }
    setLista(r.d.trakter);
  }, []);
  useEffect(() => { hamta(); }, [hamta]);

  const synliga = useMemo(() => (lista ?? []).filter(t => visa === 'alla' || t.rotpost), [lista, visa]);
  const grupper = useMemo(() => perManad(synliga), [synliga]);

  return (
    <div style={SIDA}>
      <Rubrik>Trakter</Rubrik>
      <div style={{ margin: `0 ${AVSTAND.l}px` }}>
        <Flikkontroll flikar={[['alla', 'Alla'], ['rot', 'Rotposter']] as const} aktiv={visa}
          onVal={v => router.replace(v === 'rot' ? `${BAS}?visa=rot` : BAS, { scroll: false })} />
      </div>

      {fel && <Fel rubrik="Trakterna kunde inte hämtas" fel={fel} igen={hamta} />}
      {!fel && !lista && <Laddar vad="trakterna" />}
      {lista && synliga.length === 0 && (
        <Rader><Rad text={visa === 'rot' ? 'Ingen rotpost har skördats än' : 'Inga trakter än'} dampad /></Rader>
      )}
      {grupper.map(g => (
        <Rader key={g.manad} rubrik={g.manad ? stor(manadEtikett(g.manad)) : 'Utan datum'}>
          {g.trakter.map(t => (
            <Rad key={t.id} text={kortObjekt(t.namn)} sub={t.rotpost ? `${t.typ} · Rotpost` : t.typ}
              tal={`${nf0(t.volym)} m³`} href={traktHref(t.id)} />
          ))}
        </Rader>
      ))}
    </div>
  );
}

export default function Trakter() {
  return (
    <Suspense fallback={<div style={SIDA} />}>
      <Innehall />
    </Suspense>
  );
}
