"use client";
// Peka ut jobbets plats på en karta (Starta jobb på telefon/dator): ETT tryck sätter nålen, nålen går att dra, ingen annan kontroll.
// Inget sparas här — föräldern äger positionen (sökning och "Här" flyttar nålen genom `plats`). Laddas inte kartan står det, och
// positionen kan fortfarande sättas med sökningen eller "Här".
import React, { useEffect, useRef, useState } from "react";
import { AVSTAND, FARG, RADIE, TYP } from "@/lib/design/tokens";
import { BASKARTA_DEFAULT, buildKartStil } from "@/lib/mapLayers";
import { FORARKARTA_ATTRIBUTION } from "@/app/oversikt/forarkarta-stil";
import "maplibre-gl/dist/maplibre-gl.css";

export interface KartPlats { lat: number; lng: number }

const KARTHOJD = 260;
const PRICK = 22;
/** Verksamhetens mitt — kartan startar här när varken plats eller enhetens position finns. */
export const KARTA_START: KartPlats = { lat: 56.40, lng: 14.70 };
const ZOOM_START = 9;
const ZOOM_PLATS = 14;

export default function PlatsKarta({ plats, start, onVal }: {
  plats: KartPlats | null;
  /** Var kartan öppnar när ingen plats är vald (t.ex. enhetens position). */
  start?: KartPlats | null;
  onVal: (p: KartPlats) => void;
}) {
  const behallare = useRef<HTMLDivElement>(null);
  const kartaRef = useRef<any>(null);
  const markorRef = useRef<any>(null);
  const mlRef = useRef<any>(null);
  const onValRef = useRef(onVal);
  onValRef.current = onVal;
  const [redo, setRedo] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  // Kartan skapas en gång (maplibre laddas först här — aldrig på servern).
  useEffect(() => {
    let avbruten = false;
    let matare: ResizeObserver | null = null;
    (async () => {
      try {
        const ml: any = await import("maplibre-gl");
        if (avbruten || !behallare.current || kartaRef.current) return;
        mlRef.current = ml;
        const mitt = plats ?? start ?? KARTA_START;
        const map = new ml.Map({
          container: behallare.current,
          style: buildKartStil(BASKARTA_DEFAULT),
          center: [mitt.lng, mitt.lat],
          zoom: plats ? ZOOM_PLATS : start ? 12 : ZOOM_START,
          maxPitch: 0, dragRotate: false, attributionControl: false,
        });
        kartaRef.current = map;
        try { map.touchZoomRotate.disableRotation(); } catch { /* äldre maplibre */ }
        map.addControl(new ml.AttributionControl({ customAttribution: FORARKARTA_ATTRIBUTION, compact: true }), "bottom-left");
        // Ett drag av kartan skickar inget 'click' — bara ett tryck sätter nålen.
        map.on("click", (e: any) => onValRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
        matare = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => map.resize()) : null;
        if (behallare.current) matare?.observe(behallare.current);
        setRedo(true);
      } catch (e: any) {
        setFel("Kartan kunde inte laddas — sök plats eller använd Här i stället.");
      }
    })();
    return () => {
      avbruten = true; matare?.disconnect();
      if (kartaRef.current) { try { kartaRef.current.remove(); } catch { /* */ } kartaRef.current = null; markorRef.current = null; }
    };
    // Startläget läses bara vid skapandet; senare ändringar hanteras av effekten nedan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nålen följer `plats` (tryck, sökning, "Här"). Ingen plats → ingen nål.
  useEffect(() => {
    const map = kartaRef.current, ml = mlRef.current;
    if (!redo || !map || !ml) return;
    if (!plats) { if (markorRef.current) { markorRef.current.remove(); markorRef.current = null; } return; }
    if (markorRef.current) markorRef.current.setLngLat([plats.lng, plats.lat]);
    else {
      const el = document.createElement("div");
      el.setAttribute("data-testid", "plats-nal");
      el.style.cssText = `width:${PRICK}px;height:${PRICK}px;border-radius:50%;box-sizing:border-box;border:3px solid ${FARG.text};background:${FARG.orange};cursor:grab;`;
      const m = new ml.Marker({ element: el, draggable: true }).setLngLat([plats.lng, plats.lat]).addTo(map);
      m.on("dragend", () => { const ll = m.getLngLat(); onValRef.current({ lat: ll.lat, lng: ll.lng }); });
      markorRef.current = m;
    }
    // Är nålen utanför bild (sökning/Här): flytta kartan dit. Ett tryck i bild lämnar kartan där den är.
    try {
      const b = map.getBounds();
      if (!b.contains([plats.lng, plats.lat])) map.easeTo({ center: [plats.lng, plats.lat], zoom: Math.max(map.getZoom(), ZOOM_PLATS), duration: 400 });
    } catch { /* */ }
  }, [plats, redo]);

  // Enhetens position kommer efter att kartan öppnat (och ingen plats är vald): flytta dit.
  const startRef = useRef(false);
  useEffect(() => {
    const map = kartaRef.current;
    if (!redo || !map || plats || !start || startRef.current) return;
    startRef.current = true;
    try { map.easeTo({ center: [start.lng, start.lat], zoom: 12, duration: 0 }); } catch { /* */ }
  }, [start, plats, redo]);

  return (
    <div>
      <div
        ref={behallare}
        data-testid="plats-karta"
        style={{ height: KARTHOJD, width: "100%", borderRadius: RADIE.kort, overflow: "hidden", background: FARG.kort }}
      />
      {fel && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>{fel}</div>}
    </div>
  );
}
