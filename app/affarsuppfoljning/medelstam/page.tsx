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
import { SIDA, Tillbakarad, Laddar, Fel } from '@/components/Ytform';
import { lasMedelstamUnderlag, type MedelstamUnderlag, type LasFel } from '@/lib/medelstam/las';
import MedelstamVy, { BAS, type Vy } from './MedelstamVy';

function Innehall() {
  const sp = useSearchParams();
  const router = useRouter();
  const vyParam = sp.get('vy');
  const vy: Vy = vyParam === 'objekt' || vyParam === 'kurva' || vyParam === 'utanfor' || vyParam === 'sa-raknas' ? vyParam : 'huvud';
  const franParam = sp.get('fran');
  const fran: Vy | undefined = franParam === 'objekt' || franParam === 'kurva' || franParam === 'huvud' ? franParam : undefined;
  // ?ms=0,50 — en rad i Räknas tabell öppnar sidan på just den medelstammen (slutavverkning).
  const msAdress = sp.get('ms');

  const [d, setD] = useState<MedelstamUnderlag | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<LasFel | null>(null);

  const hamta = useCallback(async () => {
    setLaddar(true); setFel(null);
    const res = await lasMedelstamUnderlag();
    if (res.ok) setD(res.d); else { setFel(res.fel); setD(null); }
    setLaddar(false);
  }, []);

  useEffect(() => { hamta(); }, [hamta]);

  if (laddar) return <div style={SIDA}><Tillbakarad href="/affarsuppfoljning/rakna" text="Räkna" /><Laddar vad="utfallet" /></div>;
  if (fel) return <div style={SIDA}><Tillbakarad href="/affarsuppfoljning/rakna" text="Räkna" /><Fel rubrik="Utfallet kunde inte hämtas" fel={fel} igen={hamta} /></div>;
  if (!d) return <div style={SIDA} />;

  return (
    <MedelstamVy alla={d.alla} meta={d.meta} uppdaterad={d.uppdaterad} rotLasbar={d.rotLasbar} vy={vy} fran={fran} msAdress={msAdress}
      gaTill={(v, f) => router.push(v === 'huvud' ? BAS : `${BAS}?vy=${v}${f && f !== 'huvud' ? `&fran=${f}` : ''}`)} />
  );
}

export default function UtfallPerMedelstam() {
  return (
    <Suspense fallback={<div style={SIDA} />}>
      <Innehall />
    </Suspense>
  );
}
