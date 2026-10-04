'use client';

// AFFÄRSUPPFÖLJNINGENS STARTSIDA — datahämtning. Visningen bor i StartsidaVy.tsx och räkningen i
// lib/affarsuppfoljning/ar.ts (en page.tsx får inte exportera annat än sidan).
//
// Källor, alla FÖRBERÄKNADE: utfall_manad (en rad per objekt och månad, fylld av berakna_utfall_objekt efter
// import), dim_objekt (bolag, åtgärd, namn, vo_nummer — filtreras här, så en rättad bolagsuppgift syns utan
// omräkning) och massaved_mal() (önskad medellängd ur kravprofilen). Aldrig detalj_stock, aldrig en RPC som
// läser stockar.
//
// Saknas tabellen (migrationen 20261004_utfall_manad.sql inte körd) säger sidan det rakt ut i stället för att
// visa nollor. Tom tabell är ett eget tillstånd: "inget räknat ännu".

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { medAbortRetry, arAbortFel } from '@/lib/supabaseRetry';
import { SIDA, Stort, Damp, Laddar, Fel } from '@/components/Ytform';
import { ATGARDER, BOLAGEN, type Atgard, type Bolag, type ManadRad, type ObjektInfo } from '@/lib/affarsuppfoljning/ar';
import StartsidaVy, { RaknaPaEnPost, BAS, type Vy } from './StartsidaVy';

type Rad = Record<string, unknown>;
type Fe = { code?: string; message?: string };
type Data = { rader: ManadRad[]; objekt: Map<string, ObjektInfo>; uppdaterad: string | null; massaMal: number };

const num = (v: unknown): number => Number(v ?? 0);
const MASSAMAL_FALLBACK = 4.6;

/** Alla rader, sida för sida, sorterade på en unik nyckel — utan .order() kan PostgREST skippa eller dubblera rader mellan sidorna. */
async function allaRader(tabell: string, select: string, ordning: string[]): Promise<{ data: Rad[]; error: Fe | null }> {
  const ut: Rad[] = [];
  for (let fran = 0; ; fran += 1000) {
    const { data, error } = await medAbortRetry(() => {
      let q: any = supabase.from(tabell).select(select);
      for (const kol of ordning) q = q.order(kol, { ascending: true });
      return q.range(fran, fran + 999);
    });
    if (error) return { data: ut, error };
    const sida = (data ?? []) as Rad[];
    ut.push(...sida);
    if (sida.length < 1000) return { data: ut, error: null };
  }
}

const saknasTabell = (e: Fe | null) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /schema cache|does not exist/i.test(e.message ?? ''));

function Innehall() {
  const sp = useSearchParams();
  const router = useRouter();
  const idag = useMemo(() => new Date(), []);
  const [d, setD] = useState<Data | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<{ kod: string; text: string } | null>(null);
  const [tabellSaknas, setTabellSaknas] = useState(false);

  const hamta = useCallback(async () => {
    setLaddar(true); setFel(null); setTabellSaknas(false);
    const [m, o, mal] = await Promise.all([
      allaRader('utfall_manad', 'objekt_id,manad,volym,timmer_m3,kubb_m3,massa_m3,massa_barr_m3,massa_barr_lm,beraknad', ['objekt_id', 'manad']),
      allaRader('dim_objekt', 'objekt_id,object_name,vo_nummer,huvudtyp,bolag', ['objekt_id']),
      medAbortRetry(() => supabase.rpc('massaved_mal')),
    ]);
    if (saknasTabell(m.error)) { setTabellSaknas(true); setD(null); setLaddar(false); return; }
    const e = m.error ?? o.error;
    if (e) {
      setFel({ kod: e.code ?? (arAbortFel(e) ? 'ABORT' : 'OKÄND'), text: e.message ?? String(e) });
      setD(null);
    } else {
      let uppdaterad: string | null = null;
      const rader: ManadRad[] = m.data.map(x => {
        const b = x.beraknad ? String(x.beraknad) : null;
        if (b && (!uppdaterad || b > uppdaterad)) uppdaterad = b;
        return { objekt_id: String(x.objekt_id), manad: String(x.manad).slice(0, 7), volym: num(x.volym), timmer: num(x.timmer_m3),
                 kubb: num(x.kubb_m3), massa: num(x.massa_m3), barr: num(x.massa_barr_m3), barrLm: num(x.massa_barr_lm) };
      });
      const objekt = new Map<string, ObjektInfo>(o.data.map(x => [String(x.objekt_id), {
        objekt_id: String(x.objekt_id), namn: (x.object_name as string | null) ?? null, vo_nummer: (x.vo_nummer as string | null) ?? null,
        huvudtyp: (x.huvudtyp as string | null) ?? null, bolag: (x.bolag as string | null) ?? null }]));
      const malNum = Number(mal.data);
      setD({ rader, objekt, uppdaterad, massaMal: !mal.error && Number.isFinite(malNum) && malNum > 0 ? malNum : MASSAMAL_FALLBACK });
    }
    setLaddar(false);
  }, []);

  useEffect(() => { hamta(); }, [hamta]);

  // Adressen bär valen, så tillbakaknappen och en delad länk hamnar på samma vy.
  const atgardP = sp.get('atgard') as Atgard;
  const atgard: Atgard = ATGARDER.includes(atgardP) ? atgardP : 'Allt';
  const bolagP = sp.get('bolag') as Bolag;
  const bolag: Bolag = BOLAGEN.includes(bolagP) ? bolagP : 'Alla';
  const arP = Number(sp.get('ar'));
  const vy: Vy = sp.get('vy') === 'rakna' ? 'rakna' : 'ar';
  const ar = Number.isInteger(arP) && arP > 2000 ? arP : idag.getFullYear();

  const byt = useCallback((q: { ar?: number; atgard?: Atgard; bolag?: Bolag }) => {
    const p = new URLSearchParams();
    p.set('ar', String(q.ar ?? ar)); p.set('atgard', q.atgard ?? atgard); p.set('bolag', q.bolag ?? bolag);
    router.replace(`${BAS}?${p.toString()}`, { scroll: false });
  }, [router, ar, atgard, bolag]);

  if (laddar) return <div style={SIDA}><div style={{ height: 56 }} /><Laddar vad="året" /></div>;
  if (fel) return <div style={SIDA}><Fel rubrik="Året kunde inte hämtas" fel={fel} igen={hamta} /></div>;
  if (tabellSaknas || !d || d.rader.length === 0) {
    if (vy === 'rakna') return <RaknaPaEnPost />;
    return (
      <div style={SIDA}>
        <div style={{ height: 56 }} />
        <Stort tal="–" ordrad="inget räknat ännu">
          <Damp>
            {tabellSaknas
              ? 'Månadstabellen finns inte ännu — migrationen 20261004_utfall_manad.sql är inte körd.'
              : 'Tabellen fylls efter nästa import (berakna_utfall_objekt).'}
            {' '}Månadssidan och räknaverktygen går att nå redan nu.
          </Damp>
        </Stort>
        <StartsidaLankar />
      </div>
    );
  }
  return (
    <StartsidaVy rader={d.rader} objekt={d.objekt} massaMal={d.massaMal} uppdaterad={d.uppdaterad} idag={idag}
      ar={ar} atgard={atgard} bolag={bolag} vy={vy} byt={byt} gaTill={href => router.push(href)} />
  );
}

/** När årsvyn inte kan visas: ingångarna som inte beror på månadstabellen. */
function StartsidaLankar() {
  return (
    <div style={{ margin: '16px 16px 0' }}>
      <a href="/affarsuppfoljning?vy=rakna" style={{ display: 'block', padding: '14px 0', minHeight: 48, fontSize: 13, color: 'inherit', textDecoration: 'none', borderTop: '1px solid rgba(255,255,255,0.08)' }}>Räkna på en post ›</a>
      <a href="/affarsuppfoljning/manad?atgard=Allt&bolag=Vida" style={{ display: 'block', padding: '14px 0', minHeight: 48, fontSize: 13, color: 'inherit', textDecoration: 'none', borderTop: '1px solid rgba(255,255,255,0.08)' }}>Månadssidan ›</a>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} />
    </div>
  );
}

export default function Affarsuppfoljning() {
  return (
    <Suspense fallback={<div style={SIDA} />}>
      <Innehall />
    </Suspense>
  );
}
