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
import { SIDA, TAL, DAMPAD, GUL, GRON, LINJE, nf0, Rad, Rader, Damp } from '@/components/Ytform';
import { laddaUppOchLas, listaRapporter, type Rapport } from '@/lib/stampling/pdf/klient';

const STAMPLING = '/affarsuppfoljning/stampling';
const ROD = 'rgba(255,120,110,0.95)';
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
        <div style={{ padding: '24px 16px', lineHeight: 1.6 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{fas === 'laddar-upp' ? 'Laddar upp rapporten…' : 'Läser rapporten…'}</div>
          <Damp>{fas === 'laser' ? 'Kan ta en minut — stäng inte sidan.' : 'Filen skickas till lagringen.'}</Damp>
        </div>
      </div>
    );
  }

  return (
    <div style={SIDA}>
      {/* 1. Det stora valet. Ett tryck öppnar filväljaren (kan inte ske efter en navigering — webbläsaren kräver ett tryck). */}
      <input ref={valjFil} type="file" accept="application/pdf,.pdf" hidden onChange={e => valdFil(e.target.files?.[0])} />
      <div style={{ padding: '14px 16px 0' }}>
        <button onClick={() => valjFil.current?.click()}
          style={{ ...TAL, display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                   minHeight: 88, padding: 0, background: 'none', border: 'none', borderBottom: LINJE, color: 'inherit',
                   fontSize: 30, lineHeight: 1.15, fontWeight: 500, textAlign: 'left', cursor: 'pointer' }}>
          <span>Ladda upp<br />stämplingslängd</span>
          <span style={{ color: DAMPAD, fontSize: 20 }}>›</span>
        </button>
      </div>

      {fel && (
        <div role="alert" style={{ margin: '14px 16px 0', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(255,120,110,0.35)', background: 'rgba(255,120,110,0.06)' }}>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: ROD }}>{fel}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: DAMPAD }}>Försök igen, eller mata in stämplingslängden.</div>
        </div>
      )}

      {/* 2. De två andra vägarna in. */}
      <Rader>
        <Rad text="Bara medelstam" href="/affarsuppfoljning/medelstam" />
        <Rad text="Mata in" href={`${STAMPLING}?vy=langd`} dampad />
      </Rader>

      {/* 3. Sparade poster, senaste först. */}
      {lista && lista.length > 0 && (
        <>
          <div style={{ margin: '24px 16px 0', fontSize: 13, fontWeight: 600 }}>Sparade poster</div>
          <Rader>
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
