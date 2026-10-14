'use client';

// Planeringsvyns objekt: vilket objekt som öppnas vid start, objektet i adressen och minnet av senast valda.
//
//  START (en gång):  ?objekt=<id> i adressen → annars senaste objektet (minnet) → annars inget (listan öppnas).
//                    Finns objektet inte längre rensas minnet/parametern och listan öppnas. Ett hämtfel (nätet) rensar ingenting.
//  OBJEKT → ADRESS:  valt objekt skrivs till ?objekt=. Från "inget objekt" till ett objekt = replaceState (bakåtknappen går till föregående sida);
//                    från ett objekt till ett annat = pushState (bakåt tar tillbaka förra objektet).
//  BAKÅT/FRAMÅT:     popstate på samma sida följer adressen. Lämnar man sidan (startsidan) sker ingenting.
//  MINNE:            varje valt objekt sparas (lib/senastePlanering, per enhet och medarbetare).
//
// `aktiv=false` (maskinläge, /maskin, maskinfrågan) → hooken gör ingenting alls. Hooken känner inte till kartan; sidan äger valt objekt.

import { useEffect, useRef, useState } from 'react';
import { hamtaSenastePlanering, objektIdUrUrl, planeringsUrl, rensaSenastePlanering, sattSenastePlanering } from '../senastePlanering';

export type HamtaObjektSvar<T> = { typ: 'hittad'; objekt: T } | { typ: 'saknas' } | { typ: 'fel' };

export interface PlaneringsObjektOpts<T extends { id: string }> {
  aktiv: boolean;
  /** inloggad medarbetare; null = ännu okänd (hooken väntar) */
  anvandarId: string | null;
  /** auto-uppdateringen återställer objektet (pendingRestore) → hoppa startvalet, men adress och minne följer med som vanligt */
  hoppaStartval?: boolean;
  valtObjektId: string | null;
  hamtaObjekt: (id: string) => Promise<HamtaObjektSvar<T>>;
  /** sidans setValtObjekt */
  onValj: (o: T | null) => void;
}

const HAMTA_TIDSGRANS_MS = 8000;

function medTidsgrans<T>(p: Promise<HamtaObjektSvar<T>>): Promise<HamtaObjektSvar<T>> {
  return new Promise((klar) => {
    const t = setTimeout(() => klar({ typ: 'fel' }), HAMTA_TIDSGRANS_MS);
    p.then((v) => { clearTimeout(t); klar(v); }, () => { clearTimeout(t); klar({ typ: 'fel' }); });
  });
}

function skrivUrl(id: string | null, sattning: 'push' | 'replace') {
  try {
    const url = planeringsUrl(window.location.pathname, window.location.search, id);
    if (url === window.location.pathname + window.location.search) return;
    if (sattning === 'push') window.history.pushState(null, '', url);
    else window.history.replaceState(window.history.state, '', url);
  } catch { /* ignore */ }
}

export function usePlaneringsObjekt<T extends { id: string }>(opts: PlaneringsObjektOpts<T>): { startKlar: boolean } {
  const { aktiv, anvandarId, hoppaStartval, valtObjektId } = opts;
  const [startKlar, setStartKlar] = useState(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const levande = useRef(true);
  const startGjord = useRef(false);
  const forraId = useRef<string | null>(null);
  const startPath = useRef<string | null>(null);

  useEffect(() => { levande.current = true; return () => { levande.current = false; }; }, []);

  // 1. START
  useEffect(() => {
    if (!aktiv || !anvandarId || startGjord.current) return;
    startGjord.current = true;
    startPath.current = window.location.pathname;
    if (hoppaStartval) { setStartKlar(true); return; }
    const urlId = objektIdUrUrl(window.location.search);
    const id = urlId ?? hamtaSenastePlanering(anvandarId);
    if (!id) { setStartKlar(true); return; }
    (async () => {
      const r = await medTidsgrans(optsRef.current.hamtaObjekt(id));
      if (!levande.current) return;
      if (r.typ === 'hittad') {
        forraId.current = null;           // null → objekt: adressen skrivs med replaceState nedan
        optsRef.current.onValj(r.objekt);
      } else if (r.typ === 'saknas') {
        rensaSenastePlanering(anvandarId, id);
        if (urlId) skrivUrl(null, 'replace');
      }
      setStartKlar(true);
    })();
  }, [aktiv, anvandarId, hoppaStartval]);

  // 2. VALT OBJEKT → adress + minne
  useEffect(() => {
    if (!aktiv || !anvandarId) return;
    const id = valtObjektId;
    if (id === forraId.current) return;
    const tidigare = forraId.current;
    forraId.current = id;
    if (id) {
      sattSenastePlanering(anvandarId, id);
      skrivUrl(id, tidigare ? 'push' : 'replace');
    } else if (objektIdUrUrl(window.location.search)) {
      skrivUrl(null, 'replace');
    }
  }, [aktiv, anvandarId, valtObjektId]);

  // 3. BAKÅT / FRAMÅT på samma sida
  useEffect(() => {
    if (!aktiv) return;
    const vidPop = async () => {
      if (startPath.current && window.location.pathname !== startPath.current) return;   // vi lämnar sidan → rör inget
      const id = objektIdUrUrl(window.location.search);
      if (id === optsRef.current.valtObjektId) return;
      if (!id) { optsRef.current.onValj(null); return; }
      const r = await medTidsgrans(optsRef.current.hamtaObjekt(id));
      if (!levande.current || objektIdUrUrl(window.location.search) !== id) return;
      if (r.typ === 'hittad') optsRef.current.onValj(r.objekt);
      else if (r.typ === 'saknas') { skrivUrl(null, 'replace'); optsRef.current.onValj(null); }
    };
    window.addEventListener('popstate', vidPop);
    return () => window.removeEventListener('popstate', vidPop);
  }, [aktiv]);

  return { startKlar };
}
