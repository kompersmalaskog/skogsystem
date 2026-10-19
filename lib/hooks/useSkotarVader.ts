'use client';

// Väder för skotarläget: kommande dagar bakom ⓘ, och morgonkortet (högst ett per dag, bara om något gäller — lib/skotarLass/vader).
// Inget väder på kartan i övrigt. Går hämtningen inte (ingen täckning) visas inget kort — vi gissar aldrig.

import { useCallback, useEffect, useState } from 'react';
import { serverNu } from '@/lib/serverKlocka';
import { lokaltDatumStockholm } from '@/lib/hyttspar';
import { fetchSmhiFwi } from '@/lib/smhi-brandrisk';
import { morgonkort, morgonkortProv, MORGONKORT_NYCKEL, regnMm, vaderPerDag, type Morgonkort, type PmpTimeSeries, type VaderDag } from '@/lib/skotarLass/vader';

export interface SkotarVader {
  dagar: VaderDag[];
  regn24h: number | null;
  brandklass: number | null;
  laddar: boolean;
  /** Morgonkortet som ska visas nu, eller null. */
  kort: Morgonkort | null;
  stangKort: () => void;
  /** Bara testläget (admin): visar morgonkortet nu, med riktiga värden — räknas aldrig som "visat idag". */
  provkorKort: () => void;
}

const lasVisat = (): string | null => { try { return localStorage.getItem(MORGONKORT_NYCKEL); } catch { return null; } };
const skrivVisat = (datum: string) => { try { localStorage.setItem(MORGONKORT_NYCKEL, datum); } catch { /* */ } };

/**
 * `pos` = traktens position (väder för trakten, inte för där telefonen råkar vara). `test` (testläget /maskin?som=): dagarna hämtas som vanligt, men
 * morgonkortet visas inte av sig självt och förbrukar aldrig dagens kort — det provkörs med `provkorKort`.
 */
export function useSkotarVader(aktiv: boolean, pos: { lat: number; lon: number } | null, test: boolean = false): SkotarVader {
  const [dagar, setDagar] = useState<VaderDag[]>([]);
  const [regn24h, setRegn24h] = useState<number | null>(null);
  const [brandklass, setBrandklass] = useState<number | null>(null);
  const [laddar, setLaddar] = useState(false);
  const [kort, setKort] = useState<Morgonkort | null>(null);
  // Hämtas en gång per start (positionen räcker på en trakt); sedan inte om, så kortet inte dyker upp mitt i dagen.
  const harPos = !!pos;
  const lat = pos?.lat ?? null, lon = pos?.lon ?? null;
  // Ny trakt = ny position = ny hämtning (avrundat så GPS-brus aldrig ger en hämtning per fix).
  const platsNyckel = lat == null || lon == null ? '' : `${lat.toFixed(3)},${lon.toFixed(3)}`;

  useEffect(() => {
    if (!aktiv || lat == null || lon == null) return;
    let avbruten = false;
    setLaddar(true);
    (async () => {
      let regn: number | null = null;
      let serie: PmpTimeSeries[] | null = null;
      try {
        const url = `https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/${lon.toFixed(4)}/lat/${lat.toFixed(4)}/data.json`;
        const r = await fetch(url);
        if (r.ok) { serie = ((await r.json()).timeSeries ?? []) as PmpTimeSeries[]; regn = regnMm(serie, serverNu()); }
      } catch { /* offline: inget väder, inget kort */ }
      let klass: number | null = null;
      try { klass = (await fetchSmhiFwi(lat, lon)).peakIdx; } catch { /* */ }
      if (avbruten) return;
      setRegn24h(regn); setBrandklass(klass);
      setDagar(vaderPerDag(serie, (ms) => lokaltDatumStockholm(ms)));
      setLaddar(false);
      if (test) return;   // testläget: inget automatiskt kort, inget förbrukat
      const idag = lokaltDatumStockholm(serverNu());
      const k = morgonkort({ regnMm: regn, brandklass: klass, redanVisatIdag: lasVisat() === idag });
      // Räknas som visat först när kortet faktiskt visas: ett fel eller en stängd app innan dess ger inget "förbrukat" kort.
      if (k) { setKort(k); skrivVisat(idag); }
    })();
    return () => { avbruten = true; };
    // Hämtas när positionen först finns (inte vid varje fix).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiv, harPos, platsNyckel, test]);

  const stangKort = useCallback(() => setKort(null), []);
  const provkorKort = useCallback(() => { if (test) setKort(morgonkortProv(regn24h, brandklass)); }, [test, regn24h, brandklass]);
  return { dagar, regn24h, brandklass, laddar, kort, stangKort, provkorKort };
}
