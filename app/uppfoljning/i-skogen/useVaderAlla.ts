'use client';
// Vädret för alla trakter på sidan "Ligger i skogen" — fyra hämtningar åt gången mot
// /api/uppfoljning/vader (samma rutt som traktens egen vy). Ett fel blir ett fel i kartan,
// aldrig 0 mm.
import { useEffect, useState } from 'react';
import type { SkogKort } from '../lib/iSkogenSida';
import type { VaderSvar } from '../lib/vader';

const SAMTIDIGT = 4;

/** Vädret för alla trakter, fyra åt gången. Saknas en nyckel i kartan hämtas den fortfarande. */
export function useVaderAlla(kort: SkogKort[]) {
  const [vader, setVader] = useState<Map<string, VaderSvar>>(new Map());
  const [forsok, setForsok] = useState(0);
  const nyckel = kort.map(k => `${k.nyckel}|${k.period?.fran}|${k.period?.till}`).join(',');
  useEffect(() => {
    let avbruten = false;
    setVader(new Map());
    const ko = [...kort];
    const satt = (k: SkogKort, s: VaderSvar) => { if (!avbruten) setVader(m => new Map(m).set(k.nyckel, s)); };
    const arbetare = async () => {
      for (let k = ko.shift(); k; k = ko.shift()) {
        if (!k.vo) { satt(k, { ok: false, orsak: 'saknar_plats' }); continue; }
        if (!k.period) { satt(k, { ok: false, orsak: 'saknar_datum' }); continue; }
        try {
          const r = await fetch(`/api/uppfoljning/vader?vo=${encodeURIComponent(k.vo)}&fran=${k.period.fran}&till=${k.period.till}`);
          satt(k, (await r.json()) as VaderSvar);
        } catch (e) {
          satt(k, { ok: false, orsak: 'las', fel: String(e) });
        }
      }
    };
    void Promise.all(Array.from({ length: SAMTIDIGT }, arbetare));
    return () => { avbruten = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nyckel, forsok]);
  return { vader, forsokIgen: () => setForsok(n => n + 1) };
}
