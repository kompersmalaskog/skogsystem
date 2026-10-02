'use client';

// UTFALL PER MEDELSTAM — datahämtning. Visningen och räkningen bor i MedelstamVy.tsx och
// lib/medelstam/berakna.ts (en page.tsx får inte exportera annat än sidan).
//
// Källa: utfall_objekt (förberäknad efter import, ett objekt = en rad) ⋈ dim_objekt (namn, huvudtyp).
// ALDRIG detalj_stock live — det gav 57014 statement timeout som authenticated innan tabellen kom.
// Objektens rötaandel (stamplings_objekt.rot20) läses om den går: utan läsrätt görs ingen
// rötajustering och sidan säger det rakt ut i stället för att låtsas.

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { medAbortRetry, arAbortFel } from '@/lib/supabaseRetry';
import { SIDA, Tillbakarad, Laddar, Fel } from '@/components/Ytform';
import { MIN_STAMMAR, type Objekt, type Typ } from '@/lib/medelstam/berakna';
import MedelstamVy, { BAS, type Vy, type Meta } from './MedelstamVy';

type Rad = Record<string, unknown>;
type Data = { alla: Objekt[]; meta: Meta; uppdaterad: string | null; rotLasbar: boolean };

const num = (v: unknown): number => Number(v);
const numEllerNull = (v: unknown): number | null => (v == null ? null : Number(v));

/** Alla rader, sida för sida. Sorterat på en unik nyckel — utan .order() kan PostgREST skippa eller dubblera rader mellan sidorna. */
async function allaRader(tabell: string, select: string, nyckel: string, filter?: (q: any) => any): Promise<{ data: Rad[]; error: { code?: string; message?: string } | null }> {
  const ut: Rad[] = [];
  for (let fran = 0; ; fran += 1000) {
    const { data, error } = await medAbortRetry(() => {
      let q: any = supabase.from(tabell).select(select).order(nyckel, { ascending: true }).range(fran, fran + 999);
      if (filter) q = filter(q);
      return q;
    });
    if (error) return { data: ut, error };
    const sida = (data ?? []) as Rad[];
    ut.push(...sida);
    if (sida.length < 1000) return { data: ut, error: null };
  }
}

function Innehall() {
  const sp = useSearchParams();
  const router = useRouter();
  const vyParam = sp.get('vy');
  const vy: Vy = vyParam === 'objekt' || vyParam === 'kurva' ? vyParam : 'huvud';

  const [d, setD] = useState<Data | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<{ kod: string; text: string } | null>(null);

  const hamta = useCallback(async () => {
    setLaddar(true); setFel(null);
    const [u, o, r, m] = await Promise.all([
      allaRader('utfall_objekt', 'objekt_id,forsta,stammar,volym,timmer_m3,kubb_m3,massa_m3,lov_m3,medelstam,kontrollerad', 'objekt_id'),
      allaRader('dim_objekt', 'objekt_id,object_name,huvudtyp', 'objekt_id', q => q.in('huvudtyp', ['Slutavverkning', 'Gallring'])),
      // Rötan är ett tillägg: går den inte att läsa (ingen policy, tabellen saknas) är det ett eget läge, inte ett fel.
      allaRader('stamplings_objekt', 'objekt_id,stammar20,rot20', 'objekt_id'),
      medAbortRetry(() => supabase.from('stamplings_meta').select('nyckel,varde')),
    ]);
    const e = u.error ?? o.error;
    if (e) {
      setFel({ kod: e.code ?? (arAbortFel(e) ? 'ABORT' : 'OKÄND'), text: e.message ?? String(e) });
      setD(null);
    } else {
      const namn = new Map(o.data.map(x => [String(x.objekt_id), x]));
      const rot = new Map((r.error ? [] : r.data).map(x => [String(x.objekt_id), x]));
      let uppdaterad: string | null = null;
      const alla: Objekt[] = [];
      for (const x of u.data) {
        const dim = namn.get(String(x.objekt_id));
        if (!dim) continue;                                   // annan huvudtyp (grot m.m.) — inte med
        const typ = dim.huvudtyp as Typ;
        const volym = num(x.volym), stammar = num(x.stammar), medelstam = numEllerNull(x.medelstam);
        const k = x.kontrollerad ? String(x.kontrollerad) : null;
        if (k && (!uppdaterad || k > uppdaterad)) uppdaterad = k;
        if (stammar < MIN_STAMMAR || !(volym > 0) || medelstam == null) continue;
        const rr = typ === 'Slutavverkning' ? rot.get(String(x.objekt_id)) : undefined;
        alla.push({
          id: String(x.objekt_id), namn: (dim.object_name as string | null) ?? null, typ, forsta: x.forsta ? String(x.forsta) : null,
          stammar, volym, timmer: num(x.timmer_m3), kubb: num(x.kubb_m3), massa: num(x.massa_m3), medelstam,
          rot20: rr ? numEllerNull(rr.rot20) : null, stammar20: rr ? numEllerNull(rr.stammar20) : null,
          lov: numEllerNull(x.lov_m3),
        });
      }
      const meta: Meta = {};
      for (const x of ((m.data ?? []) as { nyckel: string; varde: string | number | null }[])) meta[x.nyckel] = x.varde == null ? null : Number(x.varde);
      setD({ alla, meta, uppdaterad, rotLasbar: alla.some(a => a.rot20 != null) });
    }
    setLaddar(false);
  }, []);

  useEffect(() => { hamta(); }, [hamta]);

  if (laddar) return <div style={SIDA}><Tillbakarad href="/affarsuppfoljning" text="Affärsuppföljning" /><Laddar vad="utfallet" /></div>;
  if (fel) return <div style={SIDA}><Tillbakarad href="/affarsuppfoljning" text="Affärsuppföljning" /><Fel rubrik="Utfallet kunde inte hämtas" fel={fel} igen={hamta} /></div>;
  if (!d) return <div style={SIDA} />;

  return (
    <MedelstamVy alla={d.alla} meta={d.meta} uppdaterad={d.uppdaterad} rotLasbar={d.rotLasbar} vy={vy}
      gaTill={v => router.push(v === 'huvud' ? BAS : `${BAS}?vy=${v}`)} />
  );
}

export default function UtfallPerMedelstam() {
  return (
    <Suspense fallback={<div style={SIDA} />}>
      <Innehall />
    </Suspense>
  );
}
