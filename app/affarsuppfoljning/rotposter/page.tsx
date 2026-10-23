'use client';

// ROTPOSTER — uppföljning av trakterna vi köpt på rot (dim_objekt.avtalsform = 'Rp'), utan pengar (Martin 2026-10-23).
//   (ingen ?id)   listan: en rad per rotpost, nyast först — timmerandelen mot det vanliga vid samma medelstam
//   ?id=<objekt>  en trakt: vad det blev per sortiment mot det vanliga, rötan mot vår median, länk till rotkapet
// Räkningen bor i lib/rotpost/uppfoljning.ts (samma utfall() som Räkna och medelstamssidan); den här filen hämtar och visar.
// Stämplingen mot skördaren: StamplingDel.tsx (stämplingslängden Vidas import sparat, läst med samma verktyg som Räkna).

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { medAbortRetry, arAbortFel } from '@/lib/supabaseRetry';
import { SIDA, nf, nf0, kortObjekt, Rubrik, Tillbakarad, Stort, Damp, Rad, Rader, Laddar, Fel } from '@/components/Ytform';
import { sortimentFarg } from '@/components/Sortimentstapel';
import { SORTIMENT_NAMN } from '@/lib/medelstam/berakna';
import { lasMedelstamUnderlag, type MedelstamUnderlag, type LasFel } from '@/lib/medelstam/las';
import { rotposter, skillnad, SORTIMENT } from '@/lib/rotpost/uppfoljning';
import StamplingDel from './StamplingDel';

const BAS = '/affarsuppfoljning/rotposter';
const pct = (v: number) => `${v} %`;
const pe = (d: number) => (d === 0 ? '±0' : d > 0 ? `+${d}` : `−${-d}`);

function Innehall() {
  const sp = useSearchParams();
  const valt = sp.get('id');
  const [d, setD] = useState<MedelstamUnderlag | null>(null);
  const [rp, setRp] = useState<Set<string> | null>(null);
  const [medRotkap, setMedRotkap] = useState<Set<string>>(new Set());
  const [fel, setFel] = useState<LasFel | null>(null);

  const hamta = useCallback(async () => {
    setFel(null); setD(null);
    const [u, a, s] = await Promise.all([
      lasMedelstamUnderlag(),
      medAbortRetry(() => supabase.from('dim_objekt').select('objekt_id').eq('bolag', 'Vida').ilike('avtalsform', 'rp')),
      medAbortRetry(() => supabase.from('sim_rotkap').select('objekt_id').eq('kaplangd_cm', 300)),
    ]);
    if (!u.ok) { setFel(u.fel); return; }
    if (a.error) { setFel({ kod: a.error.code ?? (arAbortFel(a.error) ? 'ABORT' : 'OKÄND'), text: a.error.message }); return; }
    setRp(new Set(((a.data ?? []) as { objekt_id: string }[]).map(x => String(x.objekt_id))));
    // Rotkapet är ett tillägg: går det inte att läsa finns bara ingen länk.
    if (!s.error) setMedRotkap(new Set(((s.data ?? []) as { objekt_id: string }[]).map(x => String(x.objekt_id))));
    setD(u.d);
  }, []);
  useEffect(() => { hamta(); }, [hamta]);

  const lista = useMemo(() => (d && rp ? rotposter(d.alla, rp) : []), [d, rp]);
  const medianRota = d?.meta.rot20_median ?? null;

  if (fel) return <div style={SIDA}><Tillbakarad href="/affarsuppfoljning/kvalitet" text="Kvalitet" /><Fel rubrik="Rotposterna kunde inte hämtas" fel={fel} igen={hamta} /></div>;
  if (!d || !rp) return <div style={SIDA}><Tillbakarad href="/affarsuppfoljning/kvalitet" text="Kvalitet" /><Laddar vad="rotposterna" /></div>;

  // ── En trakt ────────────────────────────────────────────────────────────
  const r = valt ? lista.find(x => x.id === valt) : null;
  if (valt) {
    if (!r) return (
      <div style={SIDA}>
        <Tillbakarad href={BAS} text="Rotposter" />
        <Stort tal="–" ordrad="trakten finns inte bland rotposterna"><Damp>Den saknar skördardata eller är inte markerad som Rp.</Damp></Stort>
      </div>
    );
    const dT = skillnad(r, 'timmer');
    return (
      <div style={SIDA}>
        <Tillbakarad href={BAS} text="Rotposter" />
        <Rubrik>{kortObjekt(r.namn)}</Rubrik>
        <Stort tal={String(r.andel.timmer)} enhet="%" ordrad="timmer">
          <Damp>
            {r.vanligt
              ? `vanligt vid medelstam ${nf(r.medelstam, 2)} är ${r.vanligt.timmer} % · ${pe(dT ?? 0)} procentenheter`
              : `för få trakter med medelstam ${nf(r.medelstam, 2)} att jämföra med`}
          </Damp>
          <Damp>{nf0(r.volym)} m³ · {r.vanligt ? `jämfört med ${r.jamfordaTrakter} andra trakter` : ''}</Damp>
        </Stort>

        <Rader rubrik="Vad det blev">
          {SORTIMENT.map(s => (
            <Rad key={s} prick={sortimentFarg(s)} text={SORTIMENT_NAMN[s]} tal={`${nf0(r.m3[s])} m³`}
              hoger={r.vanligt ? `${pct(r.andel[s])} · vanligt ${pct(r.vanligt[s])}` : pct(r.andel[s])} dampad={s === 'ovrigt'} />
          ))}
        </Rader>

        <Rader rubrik="Röta">
          {r.rota != null
            ? <Rad text="Granar med röta i rotändan" tal={pct(Math.round(100 * r.rota))}
                hoger={medianRota != null ? `vanligt ${pct(Math.round(100 * medianRota))}` : undefined} />
            : <Rad text="Rötan är inte mätt på trakten" dampad />}
          {medRotkap.has(r.id) && <Rad text="Timmer du förlorar med längre rotbit" href={`/affarsuppfoljning/objekt/${encodeURIComponent(r.id)}/rotkap`} />}
        </Rader>

        <StamplingDel r={r} />
      </div>
    );
  }

  // ── Listan ──────────────────────────────────────────────────────────────
  const summa = lista.reduce((a, x) => a + Math.round(x.volym), 0);
  const jamforbara = lista.filter(x => x.vanligt);
  const over = jamforbara.filter(x => (skillnad(x, 'timmer') ?? 0) > 0).length;
  return (
    <div style={SIDA}>
      <Tillbakarad href="/affarsuppfoljning/kvalitet" text="Kvalitet" />
      <Rubrik>Rotposter</Rubrik>
      <Stort tal={nf0(lista.length)} ordrad={lista.length === 1 ? 'rotpost' : 'rotposter'}>
        <Damp>{nf0(summa)} m³{jamforbara.length > 0 ? ` · mer timmer än vanligt på ${over} av ${jamforbara.length}` : ''}</Damp>
      </Stort>
      {lista.length > 0 ? (
        <Rader rubrik="Timmer · mot det vanliga vid samma medelstam">
          {lista.map(x => {
            const dx = skillnad(x, 'timmer');
            return (
              <Rad key={x.id} text={kortObjekt(x.namn)} sub={`${nf0(x.volym)} m³ · medelstam ${nf(x.medelstam, 2)}`}
                tal={pct(x.andel.timmer)} hoger={dx == null ? 'kan inte jämföras' : `${pe(dx)} mot vanligt`}
                href={`${BAS}?id=${encodeURIComponent(x.id)}`} />
            );
          })}
        </Rader>
      ) : (
        <Rader><Rad text="Inga trakter är markerade som Rp än" dampad /></Rader>
      )}
      <Rader>
        <Rad text="Rotpost = avtalsform Rp på trakten. Ändras i Redigering." dampad />
      </Rader>
    </div>
  );
}

export default function Rotposter() {
  return (
    <Suspense fallback={<div style={SIDA} />}>
      <Innehall />
    </Suspense>
  );
}
