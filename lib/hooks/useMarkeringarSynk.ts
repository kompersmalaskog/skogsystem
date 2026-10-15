'use client';

// Planeringsvyns markeringar: lokalt först, kö mot servern, och hämtning som SAMMANFOGAS med det som väntar (lib/markeringSynk + lib/markeringSynkKo).
// En hook så att exakt samma kod körs av sidan och av testerna (sidan själv går inte att montera i test).
//
//   • Ny/ändrad markering → det lokala lagret (IndexedDB) INNAN något annat; kön skickar den till servern och försöker igen utan att kasta.
//   • Borttagen markering → en grav i det lokala lagret tills servern bekräftat; en hämtning släpper aldrig tillbaka den.
//   • Öppna trakten → det lokala visas först (serverns senast sparade bild + det som väntar); sedan skickas det som väntar, servern läses och de
//     lokala ändringarna läggs OVANPÅ. Ingen hämtning tar bort eller skriver över en lokal ändring som inte kommit fram.
//   • En markering räknas som "känd" (persisted*) FÖRST när den ligger i det lokala lagret — inte innan, som förut (då markerades den som sparad innan
//     upserten gjorts, en misslyckad upsert loggades bara, och den såg ren ut för alltid).

import { useCallback, useEffect, useRef } from 'react';
import { hamtaMarkeringarSammanfogade, korMarkeringSynk, laggMarkeringDelete, laggMarkeringUpsert, lasLokaltForst } from '../markeringSynkKo';
import { tomFotoForMarkering } from '../markeringFotoKo';
import type { ServerRad } from '../markeringSynk';

type Ref<T> = { current: T };

export interface MarkeringarSynkRefs {
  /** id:n som är "kända" (finns på servern eller i det lokala lagret) */
  persistedIds: Ref<Set<string>>;
  /** senast kända JSON per markering — bara markeringar vars JSON skiljer sig från denna skrivs (dirty-only) */
  persistedSnapshot: Ref<Map<string, string>>;
  mergeChecked: Ref<Set<string>>;
  /** vilket objekt `markers` tillhör (skrivvägarna bailar om det inte är valt objekt) */
  objekt: Ref<string | undefined>;
  /** en merge/skrivning pågår → skjut upp en hämtning */
  sparPagar: Ref<boolean>;
  /** handen ritar/placerar → skjut upp en hämtning */
  upptagen: Ref<boolean>;
}

export interface MarkeringarSynkIn<M extends { id: string | number }> {
  objektId: string | undefined;
  markers: M[];
  markersLoaded: boolean;
  setMarkers: (v: M[]) => void;
  setMarkersLoaded: (b: boolean) => void;
  typAv: (m: M) => string;
  /** serverns rader för objektet; null = gick inte att läsa */
  hamtaServer: (objektId: string) => Promise<ServerRad[] | null>;
  refs: MarkeringarSynkRefs;
  setUppdaterar?: (b: boolean) => void;
  /** efter att en hämtning lagts in: `farsk` = serverns rader lästes just nu (annars den sparade bilden) */
  onHamtad?: (r: { markers: M[]; farsk: boolean; efterRefetch: boolean }) => void;
}

const RETRY_MAX = 15;

export function useMarkeringarSynk<M extends { id: string | number }>(i: MarkeringarSynkIn<M>) {
  const inRef = useRef(i);
  inRef.current = i;
  const flushData = useRef({ markers: i.markers, objektId: i.objektId, loaded: i.markersLoaded });
  flushData.current = { markers: i.markers, objektId: i.objektId, loaded: i.markersLoaded };
  const sparPagarPerId = useRef<Map<string, Promise<void>>>(new Map());
  const lokaltPagar = useRef<Set<string>>(new Set());
  const syncTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchForsok = useRef(0);
  const senasteRefetch = useRef(0);
  const lagraNuRef = useRef<() => Promise<void>>(async () => {});

  // Skriver en markering till det lokala lagret. "Känd" sätts först när den ligger där; misslyckas skrivningen ser den fortfarande ändrad ut → nästa varv.
  const lagraLokalt = useCallback(async (objektId: string, marker: M): Promise<void> => {
    const { refs, typAv } = inRef.current;
    const id = String(marker.id);
    const json = JSON.stringify(marker);
    lokaltPagar.current.add(id);
    try {
      await laggMarkeringUpsert(objektId, marker as any, typAv(marker));
      if (refs.objekt.current === objektId) {   // objektet kan ha bytts under skrivningen: de refs som finns nu hör till ett annat
        refs.persistedIds.current.add(id);
        refs.persistedSnapshot.current.set(id, json);
      }
    } catch (e) {
      console.error('Kunde inte spara markering lokalt (försöker igen):', e);
      setTimeout(() => { void lagraNuRef.current(); }, 3000);
    } finally {
      lokaltPagar.current.delete(id);
    }
  }, []);

  /** Skriver ALLA ändrade/nya markeringar i minnet lokalt nu (dirty-only: en markering som bara ligger orörd i minnet skrivs inte om). */
  lagraNuRef.current = async () => {
    const { markers: ms, objektId, loaded } = flushData.current;
    const { refs } = inRef.current;
    if (!objektId || !loaded || refs.objekt.current !== objektId) return;
    if (syncTimeout.current) { clearTimeout(syncTimeout.current); syncTimeout.current = null; }
    const dirty = ms.filter((m) => refs.persistedSnapshot.current.get(String(m.id)) !== JSON.stringify(m));
    await Promise.all(dirty.map((m) => lagraLokalt(objektId, m)));
  };

  const saveMarker = useCallback(async (marker: M) => {
    const objektId = inRef.current.objektId;
    if (!objektId) return;
    const id = String(marker.id);
    const sparning = lagraLokalt(String(objektId), marker);
    sparPagarPerId.current.set(id, sparning);
    try { await sparning; } finally { if (sparPagarPerId.current.get(id) === sparning) sparPagarPerId.current.delete(id); }
  }, [lagraLokalt]);

  const deleteMarker = useCallback(async (markerId: string | number) => {
    const { objektId, refs } = inRef.current;
    if (!objektId) return;
    const oid = String(objektId);
    const mid = String(markerId);
    // Ett foto som väntar på uppladdning hör till markeringen: tas den bort ska fotot bort också (Storage-filen städas av nattcronet).
    tomFotoForMarkering(oid, mid).catch(() => {});
    // En lokal sparning som är på väg ska vara klar FÖRE graven läggs — annars kan den skriva över den.
    const pagar = sparPagarPerId.current.get(mid);
    if (pagar) { try { await pagar; } catch { /* loggas redan */ } }
    // Glöm "känd"-status: kommer markeringen tillbaka (Ångra/undo) ska den räknas som NY och sparas igen (en ny ändring ersätter graven).
    refs.persistedIds.current.delete(mid);
    refs.persistedSnapshot.current.delete(mid);
    try { await laggMarkeringDelete(oid, mid); } catch (e) { console.error('Kunde inte lägga raderingen lokalt:', e); }
    // Fotofilen i Storage RÖRS INTE här: Ångra måste kunna ge tillbaka markeringen med sitt foto.
  }, []);

  // ── Ladda när objektet byts ─────────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const { setMarkersLoaded, setMarkers, refs, hamtaServer, onHamtad } = inRef.current;
    setMarkersLoaded(false);   // vid VARJE objektbyte: effekter som hänger på markersLoaded kör om för det NYA objektet
    const objektId = i.objektId;
    if (!objektId) return;
    let avbruten = false;
    const laggIn = (laddade: M[]) => {
      refs.persistedIds.current = new Set(laddade.map((m) => String(m.id)));
      refs.persistedSnapshot.current = new Map(laddade.map((m) => [String(m.id), JSON.stringify(m)]));
      refs.mergeChecked.current = new Set(laddade.map((m) => String(m.id)));   // laddade basvägar ska aldrig utlösa merge-fråga
      refs.objekt.current = objektId;
      setMarkers(laddade);
      setMarkersLoaded(true);
    };
    (async () => {
      // 1) Det som finns LOKALT visas först (serverns senast sparade bild + det som väntar på att skickas) — innan nätet svarat, och utan täckning.
      const lokalt = await lasLokaltForst(objektId).catch(() => null);
      if (avbruten) return;
      if (lokalt) laggIn(lokalt.markers as M[]);
      // 2) Skicka det som väntar, läs servern, lägg de lokala väntande ändringarna OVANPÅ. Misslyckas läsningen används serverns senast sparade bild.
      const h = await hamtaMarkeringarSammanfogade(objektId, async () => {
        const rader = await hamtaServer(objektId);
        // Ändringar som gjorts sedan sidan öppnades (under hämtningen) skrivs lokalt NU — så de kommer med i sammanfogningen (även vid läsfel).
        await lagraNuRef.current().catch(() => {});
        return rader;
      });
      if (avbruten) return;    // objektet byttes under hämtningen
      laggIn(h.markers as M[]);
      onHamtad?.({ markers: h.markers as M[], farsk: h.farsk, efterRefetch: false });
    })();
    return () => { avbruten = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i.objektId]);

  // ── Hämta om (fokus, manuellt tryck, realtime-radering) ─────────────────────────────────────────────────────────────
  const refetch = useCallback(async function refetchInner(force: boolean): Promise<void> {
    const { objektId, refs, setMarkers, setUppdaterar, hamtaServer, onHamtad } = inRef.current;
    if (!objektId) return;
    if (!force && Date.now() - senasteRefetch.current < 5000) return; // throttla auto-refetch

    // SKJUT UPP bara om handen RITAR/placerar just nu eller en merge skriver. Osparade ÄNDRINGAR behöver inte vänta: de skrivs lokalt först och
    // sammanfogas med serverns rader — en hämtning kan aldrig ta bort dem.
    const vanta = () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      if (refetchForsok.current < RETRY_MAX) {          // ~13 s max väntan, sen ge upp tyst
        refetchForsok.current++;
        setUppdaterar?.(true);
        refetchTimer.current = setTimeout(() => { void refetchInner(force); }, 900);
      } else { refetchForsok.current = 0; setUppdaterar?.(false); }
    };
    if (refs.sparPagar.current || refs.upptagen.current) { vanta(); return; }

    refetchForsok.current = 0;
    senasteRefetch.current = Date.now();
    setUppdaterar?.(true);
    try {
      const h = await hamtaMarkeringarSammanfogade(objektId, async () => {
        const rader = await hamtaServer(objektId);
        await lagraNuRef.current().catch(() => {});   // allt som ändrats i minnet — också under hämtningen — skrivs lokalt FÖRE sammanfogningen
        return rader;
      });
      if (!h.farsk) return;                                  // läsfel: behåll nuvarande, ingen ny stämpel
      if (refs.objekt.current !== objektId) return;          // objekt bytt under hämtning
      // En ritning/merge som hann börja under hämtningen får inte avbrytas av att minnet byts: försök igen strax.
      if (refs.sparPagar.current || refs.upptagen.current) { vanta(); return; }
      const laddade = h.markers as M[];
      refs.persistedIds.current = new Set(laddade.map((m) => String(m.id)));
      refs.persistedSnapshot.current = new Map(laddade.map((m) => [String(m.id), JSON.stringify(m)]));
      refs.mergeChecked.current = new Set(laddade.map((m) => String(m.id)));
      setMarkers(laddade);
      onHamtad?.({ markers: laddade, farsk: true, efterRefetch: true });
    } finally {
      setUppdaterar?.(false);
    }
  }, []);

  // ── Lokal sparning vid ändringar ────────────────────────────────────────────────────────────────────────────────────
  // NYA markeringar skrivs till det lokala lagret direkt; ändringar av befintliga efter en kort stillhet (kommentarer skrivs tecken för tecken).
  useEffect(() => {
    const { objektId, markers, markersLoaded, refs } = i;
    if (!objektId || !markersLoaded || refs.objekt.current !== objektId) return;
    const oid = String(objektId);
    for (const m of markers) {
      const id = String(m.id);
      if (!refs.persistedIds.current.has(id) && !lokaltPagar.current.has(id)) void lagraLokalt(oid, m);   // NY: direkt
    }
    if (syncTimeout.current) clearTimeout(syncTimeout.current);
    syncTimeout.current = setTimeout(() => { syncTimeout.current = null; void lagraNuRef.current(); }, 400);
    return () => { if (syncTimeout.current) clearTimeout(syncTimeout.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i.markers, i.objektId, i.markersLoaded]);

  // ── Skriv lokalt NU när appen bakgrundas/stängs; kön får ett första varv ──────────────────────────────────────────────
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState !== 'hidden') return;
      void lagraNuRef.current().then(() => korMarkeringSynk(true));
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  return { saveMarker, deleteMarker, refetch, lagraNu: () => lagraNuRef.current() };
}
