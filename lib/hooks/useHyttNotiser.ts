'use client';

// Notiser i hytten (maskinläget): visar Windows-notiser för fara, besök och område när appen INTE är framme, och stänger dem när föraren kommer tillbaka till appen.
// Allt avgörande är rena funktioner (lib/hytt/notiser, lib/hytt/notisFonster); den här hooken bara läser fönstret, matar dem och visar resultatet. Den är ett TILLÄGG: larmkortet,
// besökskortet och instruktionskortet i appen fungerar precis som förut, med eller utan notiser, och ett fel här får aldrig fälla något av dem (allt är tyst vid fel).
//
// Passiv (gör ingenting) när `aktiv` är false — enhetsbrytaren i Inställningar är PÅ från start på en maskin (lib/hytt/notisInstallning), och maskinläget krävs.

import { useEffect, useRef, useState } from 'react';
import { lasFonsterLage, type FonsterLage } from '@/lib/hytt/notisFonster';
import { stegaNotiser, TOMT_NOTISLAGE, type BesokIn, type FaraIn, type NotisState, type OmradeIn, type Roll } from '@/lib/hytt/notiser';
import { stangHyttNotiser, visaHyttNotis } from '@/lib/hytt/notisVisa';
import { lasHyttNotiserPa } from '@/lib/hytt/notisInstallning';
import { ENHET_MASKIN_ANDRAD } from '@/lib/enhetMaskin';

/** Hur ofta klockan kontrolleras medan appen är borta och ett besök väntar (påminnelsen efter 5 min). Chrome kan strypa timers i ett dolt fönster – påminnelsen kan då dröja upp till en minut. */
export const NOTIS_TICK_MS = 15000;

export type HyttNotiserIn = {
  aktiv: boolean;
  roll: Roll;
  trakt: string;
  maskinId: string | null;
  /** admin som provar som maskin (?som=): kvittens från notisen märks som test av servern. */
  test: boolean;
  fara: FaraIn[];
  /** Besök den här maskinen inte kvitterat. */
  besok: BesokIn[];
  omrade: OmradeIn | null;
};

const nyckelFara = (f: FaraIn[]) => f.map((x) => x.id).sort().join('|');
const nyckelBesok = (b: BesokIn[]) => b.map((x) => x.id).sort().join('|');
const nyckelOmrade = (o: OmradeIn | null) => (o ? `${o.nyckel}|${o.instruktioner.map((x) => x.hash).join(',')}` : '');

export function useHyttNotiser(a: HyttNotiserIn): void {
  const [lage, setLage] = useState<FonsterLage>(() => (typeof document === 'undefined' ? 'borta' : lasFonsterLage()));
  const [tick, setTick] = useState(0);
  const stateRef = useRef<NotisState>(TOMT_NOTISLAGE);
  const inRef = useRef(a);
  inRef.current = a;
  /** Det kan finnas notiser från hytten uppe som inte stängts än – bara då behöver "framme" stänga något. Börjar sant: en server-push (public/sw.js) kan ha lagt en notis medan appen var stängd. */
  const uppeRef = useRef(true);
  /** Seriella anrop: en notis i taget i rätt ordning (Windows lägger den senast skapade överst). */
  const kedja = useRef<Promise<unknown>>(Promise.resolve());

  // Fönstrets läge: synligt OCH vald = framme. Allt annat (minimerat, täckt, ett annat program valt) = borta.
  useEffect(() => {
    if (!a.aktiv) return;
    const las = () => setLage(lasFonsterLage());
    las();
    document.addEventListener('visibilitychange', las);
    window.addEventListener('focus', las);
    window.addEventListener('blur', las);
    window.addEventListener('pageshow', las);
    return () => {
      document.removeEventListener('visibilitychange', las);
      window.removeEventListener('focus', las);
      window.removeEventListener('blur', las);
      window.removeEventListener('pageshow', las);
    };
  }, [a.aktiv]);

  // Server-push till maskinen (lib/hytt/maskinPush) kan lägga en notis uppe utan att den här hooken skapat den – då ska "framme" stänga den också.
  useEffect(() => {
    if (!a.aktiv) return;
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    const vid = (e: MessageEvent) => { if ((e.data as { typ?: string } | null)?.typ === 'hytt-push') { uppeRef.current = true; setTick((n) => n + 1); } };
    sw?.addEventListener('message', vid);
    return () => sw?.removeEventListener('message', vid);
  }, [a.aktiv]);

  // Klocka: påminnelsen efter 5 min kräver en omräkning även när inget annat ändras. Bara medan appen är borta och ett besök väntar.
  const harBesok = a.besok.length > 0;
  useEffect(() => {
    if (!a.aktiv || lage !== 'borta' || !harBesok) return;
    const t = setInterval(() => setTick((n) => n + 1), NOTIS_TICK_MS);
    return () => clearInterval(t);
  }, [a.aktiv, lage, harBesok]);

  // Av → rensa: brytaren stängd eller maskinläget lämnat. Notiser som ligger kvar stängs, minnet nollas.
  useEffect(() => {
    if (a.aktiv) return;
    stateRef.current = TOMT_NOTISLAGE;
    if (uppeRef.current) { uppeRef.current = false; void stangHyttNotiser(); }
  }, [a.aktiv]);

  const fk = nyckelFara(a.fara), bk = nyckelBesok(a.besok), ok = nyckelOmrade(a.omrade);
  useEffect(() => {
    if (!a.aktiv) return;
    const i = inRef.current;
    let url = '/';
    try { url = `${window.location.pathname}${window.location.search}`; } catch { /* */ }
    const ut = stegaNotiser(stateRef.current, {
      lage, nu: Date.now(), roll: i.roll, trakt: i.trakt, maskinId: i.maskinId, test: i.test, url,
      fara: i.fara, besok: i.besok, omrade: i.omrade,
    });
    stateRef.current = ut.state;
    if (ut.visa.length === 0 && ut.stang.length === 0 && !(ut.stangAlla && uppeRef.current)) return;
    kedja.current = kedja.current.then(async () => {
      try {
        if (ut.stangAlla) {
          if (uppeRef.current) { uppeRef.current = false; await stangHyttNotiser(); }
        } else if (ut.stang.length) {
          await stangHyttNotiser(ut.stang);
        }
        for (const n of ut.visa) { if (await visaHyttNotis(n)) uppeRef.current = true; }
      } catch { /* en notis som inte kunde visas får aldrig fälla något */ }
    });
  }, [a.aktiv, lage, fk, bk, ok, tick]);
}

/** Enhetsbrytaren (Inställningar › Notiser i hytten). PÅ från början på en maskin, annars av; följer ändringar i samma fönster (egen händelse), i andra fönster (storage) och när enheten görs till maskin. */
export function useHyttNotiserPa(): boolean {
  const [pa, setPa] = useState(false);
  useEffect(() => {
    const las = () => setPa(lasHyttNotiserPa());
    las();
    window.addEventListener('hytt-notiser-andrad', las);
    window.addEventListener('storage', las);
    window.addEventListener(ENHET_MASKIN_ANDRAD, las);
    return () => { window.removeEventListener('hytt-notiser-andrad', las); window.removeEventListener('storage', las); window.removeEventListener(ENHET_MASKIN_ANDRAD, las); };
  }, []);
  return pa;
}
