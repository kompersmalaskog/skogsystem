'use client';

// RÄKNA — "vad ska jag bjuda?" Affärsuppföljningens andra flik.
//
// Ett stort val överst: ladda upp stämplingslängden (PDF). Ett tryck öppnar filväljaren, rapporten läses och kontrolleras, och
// stämplingssidan tar vid (?vy=pdf&id=…&kor=1: stämmer allt räknar den direkt, annars visar den vad som avviker).
// Under: "Bara medelstam" (utan stämplingslängd), "Mata in" (längden för hand — reserv) och de sparade posterna, senaste först.
//
// Räkna filtreras INTE på bolag: en stämplingslängd är en post oavsett köpare.
//
// Själva räknandet bor kvar på /affarsuppfoljning/stampling och /medelstam — den här sidan är bara ingången.

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { AVSTAND, FARG, IKON, KNAPP, KORT, TYP } from '@/lib/design/tokens';
import Ikon from '@/components/design/Ikon';
import { SIDA, GUL, GRON, nf0, Rad, Rader, Rubrik, Damp } from '@/components/Ytform';
import { laddaUppOchLas, listaRapporter, type Rapport } from '@/lib/stampling/pdf/klient';

const STAMPLING = '/affarsuppfoljning/stampling';
const STATUS_ORD: Record<string, string> = { stammer: 'stämmer', avviker: 'åtgärd behövs', fel: 'misslyckades', lasning: 'läses', uppladdad: 'ej läst' };

function Innehall() {
  const router = useRouter();
  const valjFil = useRef<HTMLInputElement>(null);
  const [fas, setFas] = useState<'vilar' | 'laddar-upp' | 'laser'>('vilar');
  const [fel, setFel] = useState<string | null>(null);
  const [lista, setLista] = useState<Rapport[] | null>(null);

  useEffect(() => { listaRapporter().then(l => setLista([...l].sort((a, b) => b.skapad.localeCompare(a.skapad)))); }, []);

  async function valdFil(f: File | null | undefined) {
    if (!f) return;
    setFel(null);
    const res = await laddaUppOchLas(f, s => setFas(s));
    if (valjFil.current) valjFil.current.value = '';
    if (!res.ok) { setFel(res.fel); setFas('vilar'); return; }
    router.push(`${STAMPLING}?vy=pdf&id=${res.rapport.id}&kor=1`);
  }

  if (fas !== 'vilar') {
    return (
      <div style={SIDA}>
        <div style={{ ...KORT, margin: `${AVSTAND.l}px ${AVSTAND.l}px 0` }}>
          <div style={{ ...TYP.listtitel }}>{fas === 'laddar-upp' ? 'Laddar upp rapporten…' : 'Läser rapporten…'}</div>
          <Damp>{fas === 'laser' ? 'Kan ta en minut — stäng inte sidan.' : 'Filen skickas till lagringen.'}</Damp>
        </div>
      </div>
    );
  }

  return (
    <div style={SIDA}>
      <Rubrik>Räkna</Rubrik>
      {/* 1. Det stora valet: skärmens EN handling (KNAPP.primar). Ett tryck öppnar filväljaren (kan inte ske efter en navigering —
          webbläsaren kräver ett tryck). */}
      <input ref={valjFil} type="file" accept="application/pdf,.pdf" hidden onChange={e => valdFil(e.target.files?.[0])} />
      <div style={{ margin: `${AVSTAND.m}px ${AVSTAND.l}px 0` }}>
        <button onClick={() => valjFil.current?.click()} style={KNAPP.primar}>
          <Ikon namn="upload_file" storlek={IKON.rad} farg="inherit" />Ladda upp stämplingslängd
        </button>
      </div>

      {fel && (
        <div role="alert" style={{ ...KORT, margin: `${AVSTAND.m}px ${AVSTAND.l}px 0` }}>
          <div style={{ ...TYP.meta, color: FARG.rod }}>{fel}</div>
          <div style={{ marginTop: AVSTAND.xs, ...TYP.meta, color: FARG.text2 }}>Försök igen, eller mata in stämplingslängden.</div>
        </div>
      )}

      {/* 2. De två andra vägarna in. */}
      <Rader>
        <Rad text="Jag har bara medelstam" href="/affarsuppfoljning/medelstam" />
        <Rad text="Mata in för hand" href={`${STAMPLING}?vy=langd`} dampad />
      </Rader>

      {/* 3. Sparade poster, senaste först. */}
      {lista && lista.length > 0 && (
        <>
          <Rader rubrik="Sparade">
            {lista.map(r => (
              <Rad key={r.id} text={r.namn ?? r.filnamn} tal={STATUS_ORD[r.status]}
                farg={r.status === 'stammer' ? GRON : r.status === 'avviker' ? GUL : undefined}
                hoger={r.datum ?? new Date(r.skapad).toLocaleDateString('sv-SE')}
                sub={[r.forrattare, r.total_volym_m3sk != null ? `${nf0(r.total_volym_m3sk)} m³sk` : null].filter(Boolean).join(' · ') || undefined}
                href={`${STAMPLING}?vy=pdf&id=${r.id}&kor=1`} />
            ))}
          </Rader>
        </>
      )}
    </div>
  );
}

export default function Rakna() {
  return (
    <Suspense fallback={<div style={SIDA} />}>
      <Innehall />
    </Suspense>
  );
}
