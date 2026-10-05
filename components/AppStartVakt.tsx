'use client';

// Startvakten: vad gör appen när den öppnas på en maskindator? (Beslutet är rent och testat i lib/appStart.)
//
//   maskin vald                         → /planering i maskinläge (startsekvensen tar över)
//   serial-GPS men ingen maskin vald    → helskärmsfråga "Vilken maskin är det här?" — valet sparas, sedan som ovan
//   annars                              → appens meny / översikten, som idag
//
// Gäller startsidan "/" (alltid) och "/oversikt" bara vid app-START: manifestets start_url är /oversikt, så en installerad
// app (maskindatorns "Installera på skrivbordet") öppnar den och aldrig "/". Övriga sidor rörs inte.
// "Till appen" ger tillbaka menyn och startbeslutet lämnar användaren ifred resten av sessionen.
//
// Vakten ritar aldrig en svart skärm utan innehåll i mer än 1 s (vaktVy): efter 1 s syns granen, och tar inte /planering över
// inom OMDIRIGERA_MAX_MS står det vad som hänt med en väg vidare.

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { hamtaEnhetMaskin, sattEnhetMaskin } from '@/lib/enhetMaskin';
import { serialGpsVald, harWebSerial, antalBeviljadeSerialPortar } from '@/lib/gpsSerialFlagga';
import {
  avgorAppStart, harSerialGps, startbeslutGaller, vaktVy,
  MENY_PARAM, START_SETT_NYCKEL, MENY_VALD_NYCKEL, FRAGA_HOPPAD_NYCKEL, type VaktSteg,
} from '@/lib/appStart';
import { valbaraMaskiner } from '@/lib/maskinFraga';
import { useMaskinRegister } from '@/lib/useMaskinRegister';
import { StartSvartSkarm, MaskinFelSkarm } from '@/components/maskin/StartSkarmar';
import { VilkenMaskinSkarm } from '@/components/maskin/VilkenMaskinSkarm';

// Layout-effekt: körs före första målningen → en omdirigering/svart täckning hinner före menyn (ingen blinkning). På
// servern finns ingen layout-effekt att köra → vanlig useEffect där (utan SSR-varning).
const useFore = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const sessionLas = (k: string): boolean => { try { return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(k) === '1'; } catch { return false; } };
const sessionSatt = (k: string): void => { try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(k, '1'); } catch { /* */ } };
const idagISO = (): string => new Date().toISOString().slice(0, 10);

export default function AppStartVakt() {
  const pathname = usePathname();
  const router = useRouter();
  // Steg + när steget började i ETT tillstånd, och starttiden ändras BARA när steget byts — en omrendering får aldrig starta om
  // klockan (annars nås OMDIRIGERA_MAX_MS aldrig och felskärmen uteblir).
  const [vakt, setVakt] = useState<{ steg: VaktSteg; startMs: number }>({ steg: 'inte-aktuellt', startMs: 0 });
  const steg = vakt.steg;
  const [, setTick] = useState(0);
  const forstaBedomningenRef = useRef(true);   // bara den allra första bedömningen i ett fönster kan vara en app-START
  // Routern hålls i en ref: effekten ska köras när SIDAN byts, inte varje gång routerobjektet byter identitet.
  const routerRef = useRef(router);
  routerRef.current = router;

  const bytSteg = useCallback((s: VaktSteg) => {
    setVakt((prev) => (prev.steg === s ? prev : { steg: s, startMs: Date.now() }));
  }, []);

  useFore(() => {
    let avbruten = false;
    const startSettRedan = sessionLas(START_SETT_NYCKEL);
    const arForstaBedomningen = forstaBedomningenRef.current;
    forstaBedomningenRef.current = false;
    sessionSatt(START_SETT_NYCKEL);
    const menyParam = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has(MENY_PARAM);
    if (menyParam) sessionSatt(MENY_VALD_NYCKEL);

    const galler = startbeslutGaller({
      pathname,
      menyParam,
      menyValdISessionen: sessionLas(MENY_VALD_NYCKEL),
      // en app-START = första bedömningen i fönstret OCH ingen tidigare start sedd i sessionen (en omladdning är ingen start)
      appStartSettRedan: !(arForstaBedomningen && !startSettRedan),
    });
    if (!galler) { bytSteg('inte-aktuellt'); return; }

    const enhetMaskinId = hamtaEnhetMaskin();
    const flagga = serialGpsVald();
    const fragaHoppad = sessionLas(FRAGA_HOPPAD_NYCKEL);
    const avgor = (beviljadePortar: number) => {
      const val = avgorAppStart({ enhetMaskinId, serialGps: harSerialGps({ flagga, beviljadePortar }), fragaHoppad });
      if (val.typ === 'planering') { bytSteg('omdirigerar'); routerRef.current.replace('/planering'); }
      else if (val.typ === 'fraga-maskin') bytSteg('fraga');
      else bytSteg('inte-aktuellt');
    };
    // Synkront när svaret redan är känt (maskin vald / flagga satt / ingen Web Serial = telefon) → inget extra svart steg.
    if (enhetMaskinId || flagga || !harWebSerial()) { avgor(0); return; }
    // Annars: finns en redan beviljad port? (asynkront, men snabbt) — täck med svart tills vi vet.
    bytSteg('avgor');
    void antalBeviljadeSerialPortar().then((n) => { if (!avbruten) avgor(n); });
    return () => { avbruten = true; };
  }, [pathname, bytSteg]);

  // Tickar medan vi väntar, så vaktVy kan byta från svart → gran → felskärm på sin tid.
  useEffect(() => {
    if (steg !== 'avgor' && steg !== 'omdirigerar') return;
    const iv = setInterval(() => setTick((t) => t + 1), 400);
    return () => clearInterval(iv);
  }, [steg]);

  // Frågans maskinlista — laddas bara när frågan visas.
  const { register, status, laddaOm } = useMaskinRegister(steg === 'fraga');

  const tillAppen = useCallback(() => {
    sessionSatt(MENY_VALD_NYCKEL);
    sessionSatt(FRAGA_HOPPAD_NYCKEL);
    bytSteg('inte-aktuellt');   // visa sidan under (menyn / översikten)
  }, [bytSteg]);

  const vy = vaktVy(steg, steg === 'inte-aktuellt' ? 0 : Date.now() - vakt.startMs);

  if (vy === 'inget') return null;
  if (vy === 'svart' || vy === 'svart-med-gran') return <StartSvartSkarm zIndex={9500} />;
  if (vy === 'fraga') {
    return (
      <VilkenMaskinSkarm
        zIndex={9500}
        maskiner={valbaraMaskiner(register, idagISO())}
        status={status}
        onVald={(maskinId) => { sattEnhetMaskin(maskinId); bytSteg('omdirigerar'); routerRef.current.replace('/planering'); }}
        onForsokIgen={laddaOm}
        onTillAppen={tillAppen}
      />
    );
  }
  // 'fel': /planering tog inte över i tid
  return (
    <MaskinFelSkarm
      zIndex={9500}
      text="Det gick inte att öppna maskinläget. Kontrollera nätet och försök igen."
      knappar={[
        { etikett: 'Försök igen', onClick: () => { window.location.reload(); } },
        { etikett: 'Till appen', onClick: tillAppen, primar: false },
      ]}
    />
  );
}
