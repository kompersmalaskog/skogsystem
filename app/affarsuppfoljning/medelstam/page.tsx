'use client';

// UTFALL PER MEDELSTAM — vad kan man vänta sig vid en given medelstam?
//
// Ett kalkylverktyg för att värdera en post före köp, inte en uppföljning av
// vem som köpt vad. Samma form som rotkap, affärsuppföljningen och massaved
// (components/Ytform.tsx): sammanhanget överst, talet stort och vänsterställt,
// ordrad, dämpad rad, kontroll som text, rader med › och ett tal.
//
// SPANNET FÅR ALDRIG DÖLJAS. Vid samma stamstorlek har objekt fallit ut tio
// procentenheter isär i timmer. Medianen och spannet står alltid ihop: i
// den dämpade raden under talet, och på varje rad för kubb och massaved.
//
// Underlaget är tunt — ett tjugotal objekt, tre till fem per klass — och det
// står på skärmen: fingervisning, inte facit. Raden uppdaterar sig själv när
// fler objekt kommer in, RPC:n räknar live.
//
// Ingen jämförelse mellan inköpare: bolaget finns inte ens i svaret.
// Skillnaderna som syns är skillnader i skogen, inte i skickligheten.

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { medAbortRetry, arAbortFel } from '@/lib/supabaseRetry';
import { SIDA, DAMPAD, nf0, nf1, nf2, kortObjekt,
         Tillbakarad, Stort, Damp, Kontroll, Mening, Rad, Rader, Laddar, Fel } from '@/components/Ytform';

type Andel = { median: number | null; min: number | null; max: number | null };
type Objekt = {
  objekt_id: string; namn: string | null; medelstam: number;
  timmer: number; kubb: number; massa: number; stammar: number; volym: number; forsta: string;
};
type Klass = { fran: number; till: number; antal: number; timmer: Andel; kubb: Andel; massa: Andel; objekt: Objekt[] };
type Utfall = { min_stammar: number; antal_objekt: number; utanfor: number; sedan_ar: number | null; klasser: Klass[] };

const klassNamn = (k: Klass) => `${nf1(k.fran)}–${nf1(k.till)}`;
const spann = (a: Andel) => (a.min == null || a.max == null ? '–' : `${nf0(a.min)}–${nf0(a.max)} %`);

function Innehall() {
  const sp = useSearchParams();
  const router = useRouter();
  const klassParam = sp.get('klass');
  const vy = sp.get('vy');
  const [d, setD] = useState<Utfall | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<{ kod: string; text: string } | null>(null);

  const hamta = useCallback(async () => {
    setLaddar(true); setFel(null);
    const { data, error } = await medAbortRetry(() => supabase.rpc('utfall_per_medelstam'));
    if (error) {
      setFel({ kod: (error as { code?: string }).code ?? (arAbortFel(error) ? 'ABORT' : 'OKÄND'),
               text: error.message ?? String(error) });
      setD(null);
    } else setD(data as Utfall);
    setLaddar(false);
  }, []);

  useEffect(() => { hamta(); }, [hamta]);

  if (laddar) return <div style={SIDA}><Tillbakarad href="/affarsuppfoljning" text="Affärsuppföljning" /><Laddar vad="utfallet" /></div>;
  if (fel) return <div style={SIDA}><Tillbakarad href="/affarsuppfoljning" text="Affärsuppföljning" /><Fel rubrik="Utfallet kunde inte hämtas" fel={fel} igen={hamta} /></div>;
  if (!d) return <div style={SIDA} />;

  // Förvald klass: den med flest objekt — där talet betyder mest.
  const klasser = d.klasser;
  const forvald = [...klasser].sort((a, b) => b.antal - a.antal || a.fran - b.fran)[0];
  const k = klasser.find(x => nf1(x.fran) === klassParam || String(x.fran) === klassParam) ?? forvald;
  const bas = '/affarsuppfoljning/medelstam';
  const url = (q: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (k) p.set('klass', String(k.fran));
    for (const [key, v] of Object.entries(q)) if (v) p.set(key, v);
    return `${bas}?${p.toString()}`;
  };
  const underlag = (
    <Damp>
      Bygger på {nf0(d.antal_objekt)} objekt{d.sedan_ar ? ` sedan ${d.sedan_ar}` : ''}, minst {nf0(d.min_stammar)} stammar var. Fingervisning, inte facit.
    </Damp>
  );

  // ── Objekten i klassen ────────────────────────────────────────────────
  if (vy === 'objekt' && k) {
    return (
      <div style={SIDA}>
        <Tillbakarad href={url({})} text={`Medelstam ${klassNamn(k)}`} />
        <Stort tal={nf0(k.antal)} ordrad={`objekt med medelstam ${klassNamn(k)} m³`}>
          <Damp>timmer {spann(k.timmer)} · kubb {spann(k.kubb)} · massaved {spann(k.massa)}</Damp>
          <Mening>Sorterade på timmerandel, så kanterna syns. Andelarna är av objektets volym utan hemved.</Mening>
        </Stort>
        <Rader>
          {k.objekt.map(o => (
            <Rad key={o.objekt_id} text={kortObjekt(o.namn ?? o.objekt_id)}
              sub={`kubb ${nf0(o.kubb)} % · massaved ${nf0(o.massa)} % · ${nf0(o.stammar)} stammar · ${nf0(o.volym)} m³`}
              tal={`${nf0(o.timmer)} %`} hoger={`${nf2(o.medelstam)} m³/stam`} />
          ))}
        </Rader>
      </div>
    );
  }

  // ── Klassen ───────────────────────────────────────────────────────────
  return (
    <div style={SIDA}>
      <Tillbakarad href="/affarsuppfoljning" text="Affärsuppföljning" />
      {!k || k.antal === 0 ? (
        <Stort tal="–" ordrad={k ? `inga objekt med medelstam ${klassNamn(k)}` : 'inga klasser'}>
          {k && (
            <Kontroll text={`medelstam ${klassNamn(k)}`} value={String(k.fran)} label="Medelstamsklass"
              onChange={v => router.replace(`${bas}?klass=${v}`, { scroll: false })}>
              {klasser.map(x => <option key={x.fran} value={x.fran}>{klassNamn(x)} · {x.antal} objekt</option>)}
            </Kontroll>
          )}
          {underlag}
        </Stort>
      ) : (
        <>
          <Stort tal={k.timmer.median == null ? '–' : nf0(k.timmer.median)} enhet="%" ordrad="av volymen blir timmer">
            {/* Medianen och spannet ihop, alltid. En inköpare som räknar på
                medianen utan att se spannet betalar för mycket. */}
            <Damp>{spann(k.timmer)} på {nf0(k.antal)} objekt</Damp>
            <Kontroll text={`medelstam ${klassNamn(k)}`} value={String(k.fran)} label="Medelstamsklass"
              onChange={v => router.replace(`${bas}?klass=${v}`, { scroll: false })}>
              {klasser.map(x => <option key={x.fran} value={x.fran}>{klassNamn(x)} · {x.antal} objekt</option>)}
            </Kontroll>
            {underlag}
          </Stort>
          <Rader>
            <Rad text="Kubb" tal={k.kubb.median == null ? '–' : `${nf0(k.kubb.median)} %`} hoger={spann(k.kubb)} />
            <Rad text="Massaved" tal={k.massa.median == null ? '–' : `${nf0(k.massa.median)} %`} hoger={spann(k.massa)} />
            <Rad text="Objekten i klassen" tal={nf0(k.antal)} onClick={() => router.push(url({ vy: 'objekt' }))} />
          </Rader>
          {d.utanfor > 0 && (
            <div style={{ margin: '14px 16px 0', fontSize: 11, color: DAMPAD, lineHeight: 1.6 }}>
              {d.utanfor} objekt ligger utanför 0,2–0,8 och är inte med i någon klass.
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function UtfallPerMedelstam() {
  return (
    <Suspense fallback={<div style={SIDA} />}>
      <Innehall />
    </Suspense>
  );
}
