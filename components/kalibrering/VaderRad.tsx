'use client';
// Läget › Kontrollerna › "Vädret": temperaturen vid maskinen nu och när den slutade förra arbetsdagen (SMHI:s närmaste station, /api/kalibrering/vader).
// Orange "gör en kontroll" när vädret slagit om (lib/kalibrering/vaderOmslag) och ingen kontroll är gjord sedan maskinen startade idag — samma regel som pushen.
// Ingen position eller ingen station = ingen rad (inget att säga); läsfel = "Kunde inte läsas", aldrig en gissad temperatur.
import { useEffect, useState } from 'react';
import Rad from '@/components/design/Rad';
import { FARG } from '@/lib/design/tokens';
import { vaderRad } from '@/lib/kalibrering/vaderOmslag';
import type { VaderSvar } from '@/lib/kalibrering/vaderServer';

export default function VaderRad({ maskin, sista }: { maskin: string | null; sista?: boolean }) {
  const [svar, setSvar] = useState<VaderSvar | 'laser' | null>(null);
  useEffect(() => {
    if (!maskin) { setSvar(null); return; }
    let aktiv = true;
    setSvar('laser');
    fetch(`/api/kalibrering/vader?maskin_id=${encodeURIComponent(maskin)}`)
      .then(r => r.json() as Promise<VaderSvar>)
      .then(j => { if (aktiv) setSvar(j); })
      .catch(() => { if (aktiv) setSvar({ ok: false, orsak: 'las' }); });
    return () => { aktiv = false; };
  }, [maskin]);

  if (!svar || svar === 'laser') return null; // ingen tom "Läser…"-rad som hoppar bort
  if (!svar.ok) {
    if (svar.orsak !== 'las') return null;
    return <Rad sista={sista} titel="Vädret" pil={false} attr={{ 'data-rad': 'vader' }} hoger={<span style={{ color: FARG.text3 }}>Kunde inte läsas</span>} />;
  }
  const r = vaderRad(svar.lage, svar.slutMs, Date.now(), svar.kontrollIdag);
  if (!r) return null;
  return (
    <Rad sista={sista} titel="Vädret" pil={false} attr={{ 'data-rad': 'vader' }}
      under={svar.station ? `SMHI ${svar.station}` : undefined}
      hoger={<span style={{ color: r.orange ? FARG.orange : FARG.text2 }}>{r.varde}</span>}
      hogerUnder={r.under ?? undefined} />
  );
}
