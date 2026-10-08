"use client";
// Hempunkten på en karta: EN punkt, EN etikett (den geokodaren gav), två knappar. Inga andra kontroller.
//
//   Stämmer          → punkten sparas som den är (källan förblir geokod, stämplad som bekräftad)
//   Flytta punkten   → admin drar punkten eller trycker på kartan; Spara punkten gör den manuell och bekräftad
//
// Hittade geokodaren bara byn/orten ritas INGEN nål: byns mittpunkt ser ut som ett svar men är en gissning (en nål mitt i
// skogen får admin att dra den hela vägen). Kartan visar området och säger "Tryck på huset"; första trycket sätter nålen,
// sedan går den att dra, och Spara är inaktiv tills en nål finns (lib/hempunkt). Inget sparas av kartan själv: den anropar
// föräldern och visar felet om skrivningen nekades.
// MapLibre kommer från CDN som i övriga kartvyer; laddas den inte står det, och punktens värden finns kvar som text.
import React, { useEffect, useRef, useState } from "react";
import { AVSTAND, FARG, RADIE, TYP } from "@/lib/design/tokens";
import { BASKARTA_DEFAULT, buildKartStil } from "@/lib/mapLayers";
import { FORARKARTA_ATTRIBUTION } from "@/app/oversikt/forarkarta-stil";
import { HITTADE_BARA_BYN, type HempunktLage } from "@/lib/hempunkt";
import { Stod, Primar, Sekundar } from "./ui";

declare global {
  interface Window { maplibregl: any }
}

const KARTHOJD = 240;
const PRICK = 20;
const ZOOM_PUNKT = 15;
const ZOOM_BY = 14;

export type KartLage = Extract<HempunktLage, { typ: "punkt" | "forslag" }>;

export default function HempunktKarta({ lage, bildtext, onStammer, onSpara }: {
  lage: KartLage;
  /** Etiketten under kartan: det geokodaren gav, eller hur punkten sattes. */
  bildtext: string;
  /** Ger felet som text, eller null när det sparades. */
  onStammer: () => Promise<string | null>;
  onSpara: (lat: number, lng: number) => Promise<string | null>;
}) {
  const behallare = useRef<HTMLDivElement>(null);
  const karta = useRef<any>(null);
  const markor = useRef<any>(null);
  const prick = useRef<HTMLDivElement | null>(null);
  const flyttarRef = useRef(false);
  const [redo, setRedo] = useState(false);
  const [laddFel, setLaddFel] = useState(false);
  // Grov träff: kartan är i sätt-läge från början (inget att "flytta"). Annars startar den i visningsläge.
  const [flyttar, setFlyttar] = useState(lage.grov);
  const [ny, setNy] = useState<{ lat: number; lng: number } | null>(null);
  const [kor, setKor] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const bekraftad = lage.typ === "punkt" && lage.bekraftad;
  const grov = lage.grov;
  const bekraftadRef = useRef(bekraftad);
  bekraftadRef.current = bekraftad;

  // MapLibre från CDN (samma injektion som övriga kartvyer).
  useEffect(() => {
    if (!document.getElementById("maplibre-css-hempunkt")) {
      const link = document.createElement("link");
      link.id = "maplibre-css-hempunkt";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";
      document.head.appendChild(link);
    }
    if (window.maplibregl) { setRedo(true); return; }
    let script = document.getElementById("maplibre-js-hempunkt") as HTMLScriptElement | null;
    const laddad = () => setRedo(true);
    const misslyckad = () => setLaddFel(true);
    if (!script) {
      script = document.createElement("script");
      script.id = "maplibre-js-hempunkt";
      script.src = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js";
      document.head.appendChild(script);
    }
    script.addEventListener("load", laddad);
    script.addEventListener("error", misslyckad);
    return () => { script?.removeEventListener("load", laddad); script?.removeEventListener("error", misslyckad); };
  }, []);

  // Nålen: en markör, skapad vid start (exakt träff) eller vid första trycket (grov träff).
  const skapaNal = (lng: number, lat: number) => {
    const ml = window.maplibregl;
    const el = document.createElement("div");
    el.style.width = `${PRICK}px`;
    el.style.height = `${PRICK}px`;
    el.style.borderRadius = "50%";
    el.style.border = `3px solid ${FARG.text}`;
    el.style.boxSizing = "border-box";
    el.style.background = bekraftadRef.current ? FARG.gron : FARG.orange;
    prick.current = el;
    const m = new ml.Marker({ element: el, draggable: flyttarRef.current }).setLngLat([lng, lat]).addTo(karta.current);
    m.on("dragend", () => { const ll = m.getLngLat(); setNy({ lat: ll.lat, lng: ll.lng }); });
    markor.current = m;
    return m;
  };

  // Kartan skapas en gång. Trycket på kartan sätter/flyttar nålen, men bara i sätt- eller flytta-läget.
  useEffect(() => {
    if (!redo || !behallare.current || karta.current || !window.maplibregl) return;
    const ml = window.maplibregl;
    const map = new ml.Map({
      container: behallare.current,
      style: buildKartStil(BASKARTA_DEFAULT),
      center: [lage.lng, lage.lat], zoom: lage.grov ? ZOOM_BY : ZOOM_PUNKT,
      maxPitch: 0, dragRotate: false, attributionControl: false,
    });
    karta.current = map;
    try { map.touchZoomRotate.disableRotation(); } catch { /* äldre maplibre */ }
    map.addControl(new ml.AttributionControl({ customAttribution: FORARKARTA_ATTRIBUTION, compact: true }), "bottom-left");

    if (!lage.grov) skapaNal(lage.lng, lage.lat);
    map.on("click", (e: any) => {
      if (!flyttarRef.current) return;
      if (markor.current) markor.current.setLngLat([e.lngLat.lng, e.lngLat.lat]);
      else skapaNal(e.lngLat.lng, e.lngLat.lat);
      setNy({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    // Kartan mäts innan MapLibres stilmall hunnit laddas från CDN, och får då fel bredd: den följer behållarens storlek.
    const matare = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => map.resize()) : null;
    matare?.observe(behallare.current);
    return () => { matare?.disconnect(); map.remove(); karta.current = null; markor.current = null; };
  // lage används bara för startläget; ändringar efteråt hanteras av effekten nedan.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redo]);

  // Punktens färg: grön när den är bekräftad, annars orange (kräver ett svar av admin).
  useEffect(() => { if (prick.current) prick.current.style.background = bekraftad ? FARG.gron : FARG.orange; }, [bekraftad, redo]);

  // Flytta-läget: markören går att dra, trycket flyttar den.
  useEffect(() => {
    flyttarRef.current = flyttar;
    markor.current?.setDraggable(flyttar);
  }, [flyttar, redo]);

  // En träff som blir grov medan kartan är öppen (ny geokodning): nålen tas bort och sätt-läget slås på.
  useEffect(() => {
    if (!lage.grov) return;
    markor.current?.remove();
    markor.current = null; prick.current = null;
    setNy(null); setFlyttar(true);
  }, [lage.grov]);

  // Nya värden från databasen (efter en sparning eller omladdning): markören och kartan följer, om admin inte håller på.
  useEffect(() => {
    if (!markor.current || flyttarRef.current) return;
    markor.current.setLngLat([lage.lng, lage.lat]);
    karta.current?.easeTo?.({ center: [lage.lng, lage.lat] });
  }, [lage.lat, lage.lng, redo]);

  const avbryt = () => {
    markor.current?.setLngLat([lage.lng, lage.lat]);
    setFlyttar(false); setNy(null); setFel(null);
  };
  const stammer = async () => {
    setKor(true); setFel(null);
    const f = await onStammer();
    setKor(false);
    if (f) setFel(f);
  };
  const spara = async () => {
    if (!ny) return;
    setKor(true); setFel(null);
    const f = await onSpara(ny.lat, ny.lng);
    setKor(false);
    if (f) { setFel(f); return; }
    setFlyttar(false); setNy(null);
  };

  return (
    <div>
      {laddFel ? (
        <Stod farg={FARG.orange} style={{ marginTop: 0 }}>Kartan kunde inte laddas. Ladda om sidan.</Stod>
      ) : (
        <div ref={behallare} role="img" aria-label={`Hempunkten på kartan: ${bildtext}`}
          style={{ height: KARTHOJD, borderRadius: RADIE.rad, overflow: "hidden", background: FARG.fyllning }} />
      )}
      <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.text, color: FARG.text }}>{bildtext}</p>
      {grov
        ? <Stod farg={FARG.orange}>{HITTADE_BARA_BYN}</Stod>
        : <Stod farg={bekraftad ? FARG.text2 : FARG.orange}>{bekraftad ? "Bekräftad" : "Punkten är inte bekräftad."}</Stod>}
      {flyttar && (grov ? ny && <Stod>Dra nålen om den inte ligger på huset.</Stod> : <Stod>Dra punkten eller tryck på kartan där huset ligger.</Stod>)}
      {fel && <Stod farg={FARG.rod}>{fel}</Stod>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: AVSTAND.m, marginTop: AVSTAND.m }}>
        {flyttar ? (
          <>
            <Primar onClick={spara} disabled={kor || !ny}>{kor ? "Sparar…" : "Spara punkten"}</Primar>
            {!grov && <Sekundar onClick={avbryt} disabled={kor}>Avbryt</Sekundar>}
          </>
        ) : (
          <>
            {!grov && !bekraftad && <Primar onClick={stammer} disabled={kor}>{kor ? "Sparar…" : "Stämmer"}</Primar>}
            <Sekundar onClick={() => setFlyttar(true)} disabled={kor}>Flytta punkten</Sekundar>
          </>
        )}
      </div>
    </div>
  );
}
