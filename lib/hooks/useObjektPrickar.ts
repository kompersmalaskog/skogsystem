'use client';

// Objekten som prickar på kartan medan objektlistan är öppen (lib/objektKarta har reglerna). Samma hook i planeringsvyns karta och i kartan som
// visas när inget objekt är valt. Hooken äger: lagren, passningen av kameran, trycken på kartan och kamerans återgång. Listan (ObjektLista) äger datat.
//
//  - aktiv=false rör ingenting (inga lager, inga lyssnare): maskinläget, /maskin och körvyn öppnar aldrig listan och är därför helt opåverkade.
//  - Öppnas listan: kameran sparas, och när prickarna kommit zoomar kartan ut så att alla ryms i den SYNLIGA delen (arket/panelen räknas bort).
//    Byter mängden prickar (Avslutade öppnas, typen byts) passas kameran om; samma mängd (färger/avstånd som trillar in) rör inte kameran.
//  - Tryck på en prick = samma som raden i listan (`valj`). Ett tryck på tom karta gör INGET — listan stängs med ×, Esc eller genom att dra ned arket,
//    aldrig av kartan — och kartan går att använda fritt: panorera, nyp, dubbeltryck-zoom och scrollhjul rörs inte (bara KLICKET fångas, aldrig
//    pekar-/touch-/hjulhändelserna kartan själv lyssnar på). Klicket släpps inte vidare till kartans övriga lager (stopPropagation i infångningsfasen)
//    — inget annat på kartan (högar, markeringar, ritverktyg) reagerar på ett tryck medan listan är öppen.
//  - Stängs listan utan val går kartan tillbaka till kameran den hade; `markeraVal()` (anropas när ett objekt valts) stänger av återgången.

import { useCallback, useEffect, useRef } from 'react';
import {
  PRICK_KALLA, PRICK_LAGER, PRICK_TRYCK_RADIE_PX, arTryck, kartPadding, narmastePrick, prickGrans, prickarGeoJson, sakerstallPrickLager, type KartPrickar,
} from '../objektKarta';
import { plusLage } from '../plusArk';

const MAX_ZOOM_OVERSIKT = 13;               // en ensam prick zoomas inte in på knivskarpa 16
/** Planeringskartan har minZoom 8 (skogsbruksskala). Med arket över nedre halvan ryms inte en region i den synliga delen på 8, så listan sänker taket medan den är öppen. */
export const MIN_ZOOM_OVERSIKT = 5;

interface Opt {
  map: any | null;
  aktiv: boolean;
  prickar: KartPrickar | null;
  /** false = inget objekt är valt (kartan utan objekt): ingen kameraåtergång vid stängning (listan stängs aldrig där) */
  aterstall: boolean;
}

export function useObjektPrickar({ map, aktiv, prickar, aterstall }: Opt): { markeraVal: () => void } {
  const valtRef = useRef(false);
  const fitNyckelRef = useRef<string | null>(null);
  const prickarRef = useRef<KartPrickar | null>(prickar);
  prickarRef.current = prickar;
  const markeraVal = useCallback(() => { valtRef.current = true; }, []);

  // Öppen: spara kameran, ta trycken. Stängd: lyssnarna bort, prickarna bort, kameran tillbaka om inget valdes.
  useEffect(() => {
    if (!map || !aktiv) return;
    valtRef.current = false;
    fitNyckelRef.current = null;
    let kamera: { center: [number, number]; zoom: number; bearing: number; pitch: number } | null = null;
    try {
      const c = map.getCenter();
      kamera = { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
    } catch { /* kartan är inte redo — ingen återgång */ }

    // Utzoomning bortom kartans vanliga tak medan listan är öppen — återställs när den stängs (efter att kameran landat).
    let forraMin: number | null = null;
    try {
      const nu = typeof map.getMinZoom === 'function' ? map.getMinZoom() : null;
      if (typeof nu === 'number' && nu > MIN_ZOOM_OVERSIKT) { forraMin = nu; map.setMinZoom(MIN_ZOOM_OVERSIKT); }
    } catch { forraMin = null; }
    const aterstallMin = () => { try { if (forraMin != null) map.setMinZoom(forraMin); } catch { /* kartan är borta */ } };

    const behallare: HTMLElement | null = map.getContainer?.() ?? null;
    const canvasBeh: HTMLElement | null = map.getCanvasContainer?.() ?? null;
    let ner: { x: number; y: number } | null = null;
    const nerFn = (e: PointerEvent) => { ner = { x: e.clientX, y: e.clientY }; };
    const klickFn = (e: MouseEvent) => {
      if (canvasBeh && !canvasBeh.contains(e.target as Node)) return;    // kartkontroller och HTML-markörer sköter sig själva
      e.stopPropagation();                                              // kartans övriga lager och verktyg ska inte se trycket
      if (!arTryck(ner, { x: e.clientX, y: e.clientY })) return;        // en panorering som råkar sluta i ett klick
      const r = behallare!.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      let id: string | null = null;
      if (map.getLayer(PRICK_LAGER.prick)) {
        const rad = PRICK_TRYCK_RADIE_PX;
        const traffar = (map.queryRenderedFeatures([[x - rad, y - rad], [x + rad, y + rad]], { layers: [PRICK_LAGER.prick] }) ?? []) as any[];
        id = narmastePrick(traffar.map((f) => {
          const p = map.project(f.geometry.coordinates);
          return { id: String(f.properties?.id), x: p.x, y: p.y, prio: f.properties?.prio };
        }), { x, y });
      }
      if (id) prickarRef.current?.valj(id);   // tom karta: ingenting
    };
    behallare?.addEventListener('pointerdown', nerFn, true);
    behallare?.addEventListener('click', klickFn, true);

    return () => {
      behallare?.removeEventListener('pointerdown', nerFn, true);
      behallare?.removeEventListener('click', klickFn, true);
      try {
        (map.getSource(PRICK_KALLA) as any)?.setData(prickarGeoJson([]));
        if (aterstall && kamera && !valtRef.current) {
          map.easeTo({ ...kamera, duration: 500 });
          // taket tillbaka först när kameran landat — annars knycker setMinZoom kameran till 8 mitt i återgången
          if (forraMin != null && typeof map.once === 'function') map.once('moveend', aterstallMin); else aterstallMin();
        } else aterstallMin();
      } catch { /* kartan är redan borttagen (sidan lämnas) */ }
    };
  }, [map, aktiv, aterstall]);

  // Prickarna till kartan, och kameran till prickarna när mängden byter.
  useEffect(() => {
    if (!map) return;
    const p = aktiv ? prickar : null;
    if (!p && !map.getSource?.(PRICK_KALLA)) return;
    const kalla = sakerstallPrickLager(map);
    if (!kalla) return;
    kalla.setData(prickarGeoJson(p?.prickar ?? []));
    if (!p || fitNyckelRef.current === p.nyckel) return;
    const gr = prickGrans(p.prickar);
    if (!gr) return;
    fitNyckelRef.current = p.nyckel;
    const c: HTMLElement | null = map.getContainer?.() ?? null;
    const fonster = { bredd: c?.clientWidth || window.innerWidth, hojd: c?.clientHeight || window.innerHeight };
    try {
      map.fitBounds(gr, { padding: kartPadding(fonster, plusLage(window.innerWidth)), maxZoom: MAX_ZOOM_OVERSIKT, duration: 600, pitch: 0, bearing: 0 });
    } catch { /* kartan är inte redo — nästa ändring försöker igen */ fitNyckelRef.current = null; }
  }, [map, aktiv, prickar]);

  return { markeraVal };
}
