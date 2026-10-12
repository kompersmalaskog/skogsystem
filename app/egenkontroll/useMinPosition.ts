'use client';

// Din position, LEVANDE.
//
// Forut las kartan positionen EN gang nar rundan oppnades (getCurrentPosition),
// sa avstand och ordning aldrig rorde sig nar man gick. Hela flodet "narmaste
// obesvarade" faller utan en levande position, sa den bor har: en watchPosition
// som sidan ager och delar ut till kartan, kortet och listan.
//
// REGLERNA (lib/egenkontrollFlode.ts - bedomPosition avgor, den har kroken bara
// matar den):
//   - samre an 100 m raknas som ingen position
//   - 10 s vantan pa FORSTA fixen, sedan "saknas"
//   - en fix aldre an 60 s ar inte langre var man ar
//   - bevakningen pausas nar sidan ar dold (batteri) och startar om nar den syns
//
// FORSOK IGEN MASTE START SYNKRONT I TRYCKET. I en installerad PWA pa iOS ges
// ingen platsprompt utan en riktig gest, och en watchPosition som startas fran en
// effekt (efter renderingen) raknas inte som en. Darfor anropar forsokIgen
// navigator.geolocation direkt, inte via setState.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FIX_GAMMAL_MS,
  FORSTA_FIX_MS,
  bedomPosition,
  type Fix,
  type PositionFelKod,
  type PositionSkal,
  type PositionStatus,
} from '@/lib/egenkontrollFlode';

export type LevandePosition = {
  status: PositionStatus;
  /** Bara satt nar status === 'ok' - aldrig en position som inte dugar. */
  position: { lat: number; lng: number; noggrannhet: number | null } | null;
  skal: PositionSkal | null;
  /** Ratt noggrannhet pa senaste fixen, aven nar den var for dalig - till felraden. */
  senasteNoggrannhet: number | null;
  /** Anropas direkt i ett tryck. Startar om bevakningen och vantan pa forsta fixen. */
  forsokIgen: () => void;
};

const KOLL_MS = 5000;

export function useLevandePosition(): LevandePosition {
  const [fix, setFix] = useState<Fix | null>(null);
  const [felKod, setFelKod] = useState<PositionFelKod>(null);
  const [forstaFixUte, setForstaFixUte] = useState(false);
  const [gammal, setGammal] = useState(false);

  const bevakning = useRef<number | null>(null);
  const forstaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const harFix = useRef(false);
  const fixRef = useRef<Fix | null>(null);
  fixRef.current = fix;

  const stoppa = useCallback(() => {
    if (bevakning.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(bevakning.current);
    }
    bevakning.current = null;
  }, []);

  const starta = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setFelKod('ej_stod'); return; }
    if (bevakning.current != null) return;
    bevakning.current = navigator.geolocation.watchPosition(
      (p) => {
        const nu = Date.now();
        // Positionens egen tid, men aldrig i framtiden. 0 = enheten angav ingen.
        const t = p.timestamp > 0 ? Math.min(p.timestamp, nu) : nu;
        harFix.current = true;
        setFelKod(null);
        setForstaFixUte(false);
        setGammal(nu - t > FIX_GAMMAL_MS);
        setFix({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          noggrannhet: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null,
          t,
        });
      },
      (e) => {
        // Bara NEKAD ar ett beslut. TIMEOUT och POSITION_UNAVAILABLE betyder "inte an" -
        // bevakningen fortsatter, och forsta-fix-timern respektive gammal-kollen avgor
        // nar det ar dags att saga att positionen saknas.
        if (e.code === e.PERMISSION_DENIED) setFelKod('nekad');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }, []);

  const armaForstaFix = useCallback(() => {
    if (forstaTimer.current) clearTimeout(forstaTimer.current);
    setForstaFixUte(false);
    forstaTimer.current = setTimeout(() => {
      if (!harFix.current) setForstaFixUte(true);
    }, FORSTA_FIX_MS);
  }, []);

  // Start vid mount, stopp vid unmount.
  useEffect(() => {
    armaForstaFix();
    starta();
    return () => {
      stoppa();
      if (forstaTimer.current) clearTimeout(forstaTimer.current);
    };
  }, [armaForstaFix, starta, stoppa]);

  // Pausa nar sidan ar dold. En fix som blev gammal under pausen markeras direkt vid atergang.
  useEffect(() => {
    const vid = () => {
      if (document.hidden) { stoppa(); return; }
      const f = fixRef.current;
      if (f) setGammal(Date.now() - f.t > FIX_GAMMAL_MS);
      starta();
    };
    document.addEventListener('visibilitychange', vid);
    return () => document.removeEventListener('visibilitychange', vid);
  }, [starta, stoppa]);

  // Gammal-kollen. Satter BARA nar svaret byter varde - ingen omrendering varje tick.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      const f = fixRef.current;
      const nuGammal = !!f && Date.now() - f.t > FIX_GAMMAL_MS;
      setGammal((g) => (g === nuGammal ? g : nuGammal));
    }, KOLL_MS);
    return () => clearInterval(id);
  }, []);

  const forsokIgen = useCallback(() => {
    // SYNKRONT i trycket - se filhuvudet.
    stoppa();
    harFix.current = false;
    setFix(null);
    setGammal(false);
    setFelKod(null);
    armaForstaFix();
    starta();
  }, [armaForstaFix, starta, stoppa]);

  // "nu" for bedomningen: gammal -> strax over granssen, annars fixens egen tid
  // (aldern 0). Sa ger kroken ett stabilt svar utan en klocka i state.
  const nuForBedomning = fix ? (gammal ? fix.t + FIX_GAMMAL_MS + 1 : fix.t) : 0;
  const b = bedomPosition(fix, felKod, forstaFixUte, nuForBedomning);

  // STABIL identitet: positionsobjektet byter bara med en ny fix eller ett nytt
  // status. Annars skulle kartans prick och avstandsberakningen ritas om varje render.
  const position = useMemo(() => b.position, [b.status, fix]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    status: b.status,
    position,
    skal: b.skal,
    senasteNoggrannhet: fix?.noggrannhet ?? null,
    forsokIgen,
  };
}
