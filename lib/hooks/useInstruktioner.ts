'use client';

// Instruktioner till föraren (maskinläget): kopplar lib/instruktioner (reglerna) till sidan — samlar områdena med kommentarer, håller förarens "sett",
// ger kortet vid inkörning och listan till genomgången. Allt som avgör VAD som visas ligger i lib/instruktioner (rena funktioner med tester).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  TOMT_INSTRUKTION, arOsedd, attKvittera, instruktionerPaTrakten, kortAttVisa, samlaOmraden, stegaInstruktion,
  type InstruktionKortData, type InstruktionState, type InstruktionerPaTrakten,
} from '../instruktioner/instruktioner';
import { attSkicka, hamtaSett, lasLokaltSett, settKarta, skrivLokaltSett, slaIhopSett, sparaSett, type SettLager, type SparaSettPost } from '../instruktioner/sett';
import type { KommentarVy } from '../kartkommentar';

type LL = { lat: number; lon: number };

export interface InstruktionerIn {
  /** Maskinläge med körvy. Utanför det är hooken helt passiv: ingenting läses, ingenting visas. */
  aktiv: boolean;
  pos: LL | null;
  markers: readonly any[];
  svgToLatLon: (x: number, y: number) => LL;
  typNamn: (typ?: string) => string;
  vida: { features?: any[] } | null;
  /** Vidas traktdirektiv för hela trakten (`objekt.anteckningar`) — instruktion nr 1. */
  direktiv?: string | null;
  /** Alla kommentarer på objektet (kartkommentar, med det som väntar i kön). */
  kommentarer: readonly KommentarVy[];
  objektId: string | null;
  /** Den RIKTIGA inloggade föraren — "sett" skrivs under hens id. */
  forare: { id: string } | null;
  db: { from: (tabell: string) => any };
  /** Ett annat kort har platsen (larmkort eller lossningskortet): instruktionen väntar tills det är borta. Se lib/instruktioner/ordning. */
  blockerad: boolean;
  /** Testläget (/maskin?som=): "sett" gäller bara i minnet, ingenting skrivs. */
  torr?: boolean;
}

export interface InstruktionerUt {
  kort: InstruktionKortData | null;
  /** En instruktion väntar på "Sett" (visas nu eller väntar på larm/lossning). Avläggsraden (målbilden) väntar tills den är kvitterad. */
  vantar: boolean;
  /** Alla instruktioner på trakten — raden "Instruktioner på trakten (N)" i genomgången. */
  paTrakten: InstruktionerPaTrakten;
  /** "✓ Sett" på kortet: kvitterar det kortet visar. */
  settKort: () => void;
  /** "✓ Sett" för de angivna områdena (genomgången, kartkortet, ⓘ). */
  settOmraden: (nycklar: readonly string[]) => void;
  /** Antal osedda instruktioner per områdesnyckel (saknas = 0). Ändras när en kommentar kommer, ändras eller kvitteras — sidan reagerar på den. */
  oseddaPer: Readonly<Record<string, number>>;
}

const samma = (a: InstruktionState, b: InstruktionState): boolean => {
  const ak = Object.keys(a.inne), bk = Object.keys(b.inne);
  return ak.length === bk.length && ak.every((k) => b.inne[k]) && a.vantande.length === b.vantande.length && a.vantande.every((n, i) => n === b.vantande[i]);
};

const TOM_LISTA: InstruktionerPaTrakten = { antal: 0, nya: 0, omraden: [] };

export function useInstruktioner(inp: InstruktionerIn): InstruktionerUt {
  const { aktiv, objektId, torr } = inp;
  const forareId = inp.forare?.id ?? null;
  const [sett, setSett] = useState<SettLager>({});
  // Ladda först när både det lokala och serverns sett är lästa — annars visas en instruktion som redan setts för en stund.
  const [laddad, setLaddad] = useState(false);
  const [state, setState] = useState<InstruktionState>(TOMT_INSTRUKTION);
  const inpRef = useRef(inp);
  inpRef.current = inp;
  const settRef = useRef<SettLager>({});
  settRef.current = sett;

  // Förarens sett på objektet: enhetens kopia direkt, sedan servern (den nyaste per kommentar vinner). Det enheten har och servern saknar skickas.
  useEffect(() => {
    setState(TOMT_INSTRUKTION);
    if (!aktiv || !objektId || !forareId) { setSett({}); setLaddad(false); return; }
    let avbruten = false;
    const lokal = torr ? {} : lasLokaltSett(objektId, forareId);
    setSett(lokal);
    setLaddad(false);
    void hamtaSett(inpRef.current.db, objektId, forareId).then(({ lager, fel }) => {
      if (avbruten) return;
      if (fel) { try { console.warn('[Instruktioner] sett, läsning:', fel); } catch { /* */ } }
      const nu = slaIhopSett(lager, { ...lokal, ...settRef.current });
      setSett(nu);
      setLaddad(true);
      if (!fel && !torr) {
        const skicka = attSkicka(lager, nu);
        if (skicka.length) void sparaSett(inpRef.current.db, objektId, forareId, skicka.map((ref) => ({ ref, nyckel: '', hash: nu[ref].hash })));
      }
    });
    return () => { avbruten = true; };
  }, [aktiv, objektId, forareId, torr]);

  const omraden = useMemo(() => {
    if (!aktiv || !objektId) return [];
    return samlaOmraden({ objektId, vida: inp.vida, direktiv: inp.direktiv, markers: inp.markers, svgToLatLon: inp.svgToLatLon, typNamn: inp.typNamn, kommentarer: inp.kommentarer, pos: inp.pos });
    // typNamn/svgToLatLon byter identitet vid varje rendering; det som påverkar innehållet är markeringarna, geometrin, kommentarerna och positionen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiv, objektId, inp.vida, inp.direktiv, inp.markers, inp.kommentarer, inp.pos?.lat, inp.pos?.lon]);

  const karta = useMemo(() => settKarta(sett), [sett]);

  useEffect(() => {
    if (!aktiv || !laddad) return;
    setState((prev) => { const n = stegaInstruktion(prev, omraden, karta); return samma(prev, n) ? prev : n; });
  }, [aktiv, laddad, omraden, karta]);

  // Kön fylls bara när sett är läst (effekten ovan), så kortet behöver ingen egen spärr: det finns inget att visa innan dess.
  const kort = useMemo(() => (aktiv ? kortAttVisa(state, omraden, karta, inp.blockerad) : null), [aktiv, state, omraden, karta, inp.blockerad]);
  const vantar = useMemo(() => (aktiv ? kortAttVisa(state, omraden, karta, false) != null : false), [aktiv, state, omraden, karta]);
  const paTrakten = useMemo(() => (aktiv && laddad ? instruktionerPaTrakten(omraden, karta) : TOM_LISTA), [aktiv, laddad, omraden, karta]);

  const kvittera = useCallback((poster: readonly SparaSettPost[]) => {
    const i = inpRef.current;
    if (!poster.length || !i.objektId || !i.forare) return;
    const tid = new Date().toISOString();
    const nytt: SettLager = { ...settRef.current };
    for (const p of poster) nytt[p.ref] = { hash: p.hash, tid };
    settRef.current = nytt;
    setSett(nytt);
    if (i.torr) return;   // testläget skriver varken i databasen eller på enheten
    skrivLokaltSett(i.objektId, i.forare.id, nytt);
    void sparaSett(i.db, i.objektId, i.forare.id, poster).then((fel) => { if (fel) { try { console.warn('[Instruktioner] sett, sparning:', fel); } catch { /* */ } } });
  }, []);

  const settOmraden = useCallback((nycklar: readonly string[]) => {
    if (!nycklar.length) return;
    const k = settKarta(settRef.current);
    kvittera(attKvittera(omradenRef.current, nycklar, k).map((x) => ({ ref: x.i.ref, nyckel: x.nyckel, hash: x.i.hash })));
  }, [kvittera]);
  const omradenRef = useRef(omraden);
  omradenRef.current = omraden;

  const settKort = useCallback(() => {
    if (!kort) return;
    // Bara det kortet visade (osedda just nu) kvitteras — en kommentar som kom in medan kortet stod uppe är osedd och får ett eget kort.
    kvittera(kort.instruktioner.map((x) => ({ ref: x.ref, nyckel: kort.nyckel, hash: x.hash })));
  }, [kort, kvittera]);

  const oseddaPer = useMemo(() => {
    const ut: Record<string, number> = {};
    if (!aktiv || !laddad) return ut;
    for (const o of omraden) { const n = o.instruktioner.filter((x) => arOsedd(x, karta)).length; if (n) ut[o.nyckel] = n; }
    return ut;
  }, [aktiv, laddad, omraden, karta]);

  return { kort, vantar, paTrakten, settKort, settOmraden, oseddaPer };
}
