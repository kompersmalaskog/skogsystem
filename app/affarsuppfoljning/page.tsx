'use client';

// AFFÄRSUPPFÖLJNINGENS ÖVERSIKT — "hur går året för Vida?". Datahämtning; visningen bor i StartsidaVy.tsx.
//
// Källa: RPC affar_oversikt(p_ar) (migration 20261006_affar_oversikt_vida*.sql, i prod). Den är hårdkodad till Vida,
// räknar bort hemved och ger barr (grantimmer, talltimmer, kubb, massaved, energi och övrigt), löv, industrierna för de
// sågbara sortimenten, tolv månadsvolymer och objekten — i ETT anrop. Ingen bolags- eller åtgärdsväljare (beslut Martin
// 2026-10-05: översikten är Vidas volymer, alla åtgärder).
//
// Adressen bär valen: ?ar=2026, ?s=grantimmer (ett sortiment öppnat: industrierna), ?s=lov (lövet), ?vy=sa-raknas.

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { medAbortRetry, medTimeoutRetry, arAbortFel } from '@/lib/supabaseRetry';
import { SIDA, Laddar, Fel, Rubrikrad } from '@/components/Ytform';
import StartsidaVy, { BAS, type Oversikt, type Vy } from './StartsidaVy';

/** Första året med data i appen. */
const FORSTA_AR = 2025;

function Innehall() {
  const sp = useSearchParams();
  const router = useRouter();
  const idag = useMemo(() => new Date(), []);
  const nuAr = idag.getFullYear();
  const arP = Number(sp.get('ar'));
  const ar = Number.isInteger(arP) && arP >= FORSTA_AR && arP <= nuAr ? arP : nuAr;
  const s = sp.get('s');
  const vy: Vy = sp.get('vy') === 'sa-raknas' ? 'sa-raknas' : s ? 'sortiment' : 'ar';

  const [d, setD] = useState<Oversikt | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<{ kod: string; text: string } | null>(null);

  const hamta = useCallback(async () => {
    setLaddar(true); setFel(null);
    const { data, error } = await medTimeoutRetry(() => medAbortRetry(() => supabase.rpc('affar_oversikt', { p_ar: ar })));
    if (error) {
      setFel({ kod: (error as { code?: string }).code ?? (arAbortFel(error) ? 'ABORT' : 'OKÄND'), text: error.message ?? String(error) });
      setD(null);
    } else setD(data as Oversikt);
    setLaddar(false);
  }, [ar]);

  useEffect(() => { hamta(); }, [hamta]);

  const aren: number[] = [];
  for (let a = nuAr; a >= FORSTA_AR; a--) aren.push(a);
  const gaTill = useCallback((href: string, ersatt = false) => (ersatt ? router.replace(href, { scroll: false }) : router.push(href)), [router]);

  if (laddar || fel || !d) {
    return (
      <div style={SIDA}>
        <Rubrikrad text={String(ar)} value={String(ar)} label="År" onChange={v => gaTill(`${BAS}?ar=${v}`, true)}>
          {aren.map(a => <option key={a} value={a}>{a}</option>)}
        </Rubrikrad>
        {laddar && <Laddar vad={`Vidas volymer för ${ar}`} />}
        {!laddar && fel && <Fel rubrik="Året kunde inte hämtas" fel={fel} igen={hamta} />}
      </div>
    );
  }
  return <StartsidaVy d={d} ar={ar} aren={aren} idag={idag} vy={vy} sortiment={s} gaTill={gaTill} />;
}

export default function Affarsuppfoljning() {
  return (
    <Suspense fallback={<div style={SIDA} />}>
      <Innehall />
    </Suspense>
  );
}
