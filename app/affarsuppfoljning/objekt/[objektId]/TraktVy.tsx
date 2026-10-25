'use client';

// TRAKTSIDAN — allt om EN trakt på ett ställe (2026-10-25). Förut fanns samma trakt på fyra sidor (Kvalitet → objektet, Rotposter →
// rotposten, Räkna → stämplingen, månaden → objektlistan); nu leder alla hit. Uppifrån, en fråga per kort:
//   1. Hur mycket?          kubiken stort, typ · rotpost · när, stammar och medelstam
//   2. Vad blev det?        timmer, kubb, massaved, övrigt — m³ och procent, "vanligt X %" när det finns trakter att jämföra med,
//                           och EN mening om timret
//   3. Massaveden           medellängden mot Vidas 4,6 m → ?vy=massaved (3 m-stockar, längder, sågbart, trädslag)
//   4. Röta                 granar med röta mot vår median, och timret man förlorar med längre rotbit (rotkap)
//   5. Stämplingen          bara rotposter: stämplingslängden mot skördaren (StamplingDel)
// Varje del läses för sig och ett fel i en del fäller aldrig de andra. Ett fel är ett fel, aldrig noll.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { medAbortRetry } from '@/lib/supabaseRetry';
import { AVSTAND } from '@/lib/design/tokens';
import { sortimentFarg } from '@/components/Sortimentstapel';
import { SIDA, GUL, GRON, nf, nf0, nf1, nf2, manadEtikett, kortObjekt,
         Rubrik, Tillbakarad, Stort, Damp, Mening, Rad, Rader, Laddar, Fel } from '@/components/Ytform';
import { SORTIMENT_NAMN } from '@/lib/medelstam/berakna';
import type { LasFel } from '@/lib/medelstam/las';
import { lasTrakter } from '@/lib/rotpost/las';
import { skillnad, SORTIMENT, type Trakt } from '@/lib/rotpost/uppfoljning';
import StamplingDel from '../../rotposter/StamplingDel';

type Massaved = { namn: string | null; medellangd_m: number | null; onskad_medellangd_m: number; total_m3fub: number };
type Del<T> = { typ: 'laddar' } | { typ: 'fel' } | { typ: 'klar'; v: T };

/** EN mening om timret mot det vanliga. Inom ±2 procentenheter är det "som vanligt". */
export function timmerMening(t: Trakt): string {
  const d = skillnad(t, 'timmer');
  if (d == null) return `För få trakter med medelstam ${nf(t.medelstam, 2)} att jämföra med.`;
  if (Math.abs(d) <= 2) return 'Lika mycket timmer som trakter med samma trädstorlek brukar ge.';
  return d > 0 ? `${d} procentenheter mer timmer än trakter med samma trädstorlek brukar ge.`
    : `${-d} procentenheter mindre timmer än trakter med samma trädstorlek brukar ge.`;
}

export default function TraktVy({ objektId }: { objektId: string }) {
  const [t, setT] = useState<Trakt | null | undefined>(undefined);   // undefined = läses, null = finns inte i underlaget
  const [medianRota, setMedianRota] = useState<number | null>(null);
  const [fel, setFel] = useState<LasFel | null>(null);
  const [mv, setMv] = useState<Del<Massaved>>({ typ: 'laddar' });
  const [rotkap, setRotkap] = useState(false);

  const hamta = useCallback(async () => {
    setFel(null); setT(undefined);
    const r = await lasTrakter();
    if (!r.ok) { setFel(r.fel); return; }
    setT(r.d.trakter.find(x => x.id === objektId) ?? null);
    setMedianRota(r.d.medianRota);
  }, [objektId]);

  const hamtaMassaved = useCallback(async () => {
    setMv({ typ: 'laddar' });
    const { data, error } = await medAbortRetry(() => supabase.rpc('massaved_niva2', { p_objekt_id: objektId, p_manad: null }));
    setMv(error ? { typ: 'fel' } : { typ: 'klar', v: data as Massaved });
  }, [objektId]);

  useEffect(() => { hamta(); hamtaMassaved(); }, [hamta, hamtaMassaved]);
  // Rotkapet är ett tillägg: finns ingen simulering finns bara ingen rad.
  useEffect(() => {
    supabase.from('sim_rotkap').select('objekt_id').eq('objekt_id', objektId).eq('kaplangd_cm', 300).maybeSingle()
      .then(({ data }) => setRotkap(!!data));
  }, [objektId]);

  const bas = `/affarsuppfoljning/objekt/${encodeURIComponent(objektId)}`;
  const namn = kortObjekt(t?.namn ?? (mv.typ === 'klar' ? mv.v.namn : null) ?? objektId);
  const tillbaka = <Tillbakarad href={t?.rotpost ? '/affarsuppfoljning/trakter?visa=rot' : '/affarsuppfoljning/trakter'} text="Trakter" />;

  if (fel) return <div style={SIDA}>{tillbaka}<Fel rubrik="Trakten kunde inte hämtas" fel={fel} igen={hamta} /></div>;
  if (t === undefined) return <div style={SIDA}>{tillbaka}<Laddar vad={namn} /></div>;

  const m = mv.typ === 'klar' ? mv.v : null;
  const under = m?.medellangd_m != null && m.medellangd_m < m.onskad_medellangd_m;
  const visaMassaved = mv.typ !== 'klar' || m?.medellangd_m != null;

  return (
    <div style={SIDA}>
      {tillbaka}
      <Rubrik>{namn}</Rubrik>

      {t ? (
        <>
          <Stort tal={nf0(t.volym)} enhet="m³" ordrad="skördat">
            <Damp>{[t.typ, t.rotpost ? 'Rotpost' : null, t.forsta ? `från ${manadEtikett(t.forsta.slice(0, 7))}` : null].filter(Boolean).join(' · ')}</Damp>
            <Damp>{nf0(t.stammar)} träd · medelstam {nf(t.medelstam, 2)} m³</Damp>
          </Stort>

          <Rader rubrik="Vad det blev">
            {SORTIMENT.map(s => (
              <Rad key={s} prick={sortimentFarg(s)} text={SORTIMENT_NAMN[s]} tal={`${nf0(t.m3[s])} m³`} dampad={s === 'ovrigt'}
                hoger={t.vanligt ? `${t.andel[s]} % · vanligt ${t.vanligt[s]} %` : `${t.andel[s]} %`} />
            ))}
          </Rader>
          <div style={{ padding: `0 ${AVSTAND.l}px` }}><Mening>{timmerMening(t)}</Mening></div>
        </>
      ) : (
        <Stort tal="–" ordrad="ingen skördardata att visa">
          <Damp>Trakten är för liten, inte Vidas, eller inte avverkad än.</Damp>
        </Stort>
      )}

      {visaMassaved && (
        <Rader rubrik="Massaveden">
          {mv.typ === 'laddar' && <Rad text="Hämtar längderna…" dampad />}
          {mv.typ === 'fel' && <Rad text="Längderna kunde inte hämtas · Försök igen" onClick={hamtaMassaved} />}
          {m && m.medellangd_m != null && (
            <Rad text="Medellängd" tal={`${nf2(m.medellangd_m)} m`} farg={under ? GUL : GRON}
              hoger={`Vida vill ha ${nf1(m.onskad_medellangd_m)} m`} href={`${bas}?vy=massaved&manad=alla`} />
          )}
        </Rader>
      )}

      {((t && t.typ === 'Slutavverkning') || rotkap) && (
        <Rader rubrik="Röta">
          {t && t.typ === 'Slutavverkning' && (t.rota != null
            ? <Rad text="Granar med röta i rotändan" tal={`${Math.round(100 * t.rota)} %`}
                hoger={medianRota != null ? `vanligt ${Math.round(100 * medianRota)} %` : undefined} />
            : <Rad text="Rötan är inte mätt på trakten" dampad />)}
          {rotkap && <Rad text="Timmer du förlorar med längre rotbit" href={`${bas}/rotkap`} />}
        </Rader>
      )}

      {t?.rotpost && <StamplingDel r={t} />}
    </div>
  );
}
