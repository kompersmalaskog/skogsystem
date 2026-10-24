'use client';

import { useEffect, useRef, useState } from 'react';
import { tradslagFarg, tradslagLabel } from '@/lib/tradslag';
import { FARG } from '@/lib/design/tokens';
import type { MarkagarRapport } from '@/lib/markagarrapport/types';
import { prickRadie, ROT_FAKTOR, type KartLage } from '@/lib/markagarrapport/karta';

interface Props {
  stammar: MarkagarRapport['karta']['stammar'];
  /** Vad prickarna visar (lib/markagarrapport/karta.ts): rötan, eller trädslagen. */
  lage: KartLage;
}

// Röta = appens röda (FARG.rod), som ring runt pricken: formen skiljer den från tallens orange fyllning.
const RING_ROT  = FARG.rod;
const SCALE_COLOR = 'rgba(255,255,255,0.55)';
const SCALE_TEXT  = 'rgba(255,255,255,0.7)';
// Fotot tonas ned så att prickarna bär bilden (skogen är redan mörk; utan slöja försvann de gröna prickarna i den).
const OVERLAY_DARK = 'rgba(0,0,0,0.40)';
// Röta-läget: de friska som vita prickar (trakten syns), rötan röd ovanpå — lika stora, bara färgen skiljer.
const FRISK = FARG.text;
const FRISK_ALFA = 0.6;
// Trädslag-läget: mörk kant runt varje prick så att färgen syns mot skogen.
const KANT_MORK = FARG.bg;
const PLACEHOLDER_BG = '#0a0a0a';

const COLOR_DEFAULT = 'rgba(255,255,255,0.65)';

const PADDING_PCT = 0.08;       // 8 % marginal runt stam-extent

// Trädslagens färger ur EN palett (lib/tradslag) — samma som raderna i rapporten och resten av appen.
// Förut hade kartan egna färger (en annan grön för gran, beige björk).
function fillForTradslag(t: string): string {
  return t ? tradslagFarg(tradslagLabel(t)) : COLOR_DEFAULT;
}

/** EPSG:4326 → EPSG:3857 (Web Mercator). */
function lonLatToMercator(lon: number, lat: number): [number, number] {
  const x = (lon * 20037508.34) / 180;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (Math.log((1 + sinLat) / (1 - sinLat)) / 2) * 20037508.34 / Math.PI;
  return [x, y];
}

export default function SkogenKarta({ stammar, lage }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [bgImg, setBgImg] = useState<HTMLImageElement | null>(null);
  const [bgError, setBgError] = useState(false);
  // Kartan ritas om när dess bredd ändras (vriden iPad, listan bredvid på stor skärm, ändrat fönster).
  const [bredd, setBredd] = useState(0);
  useEffect(() => {
    const c = ref.current;
    if (!c || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBredd(Math.round(c.clientWidth)));
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  // Hämta ortofoto-bakgrund från Lantmäteriet via befintlig WMS-proxy
  useEffect(() => {
    if (stammar.length === 0) {
      setBgImg(null);
      return;
    }
    const c = ref.current;
    if (!c) return;
    const cssW = c.clientWidth;
    const cssH = c.clientHeight;
    if (cssW === 0 || cssH === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // 1. Stam-extent + 8 % padding
    let lat0 = Infinity, lat1 = -Infinity, lng0 = Infinity, lng1 = -Infinity;
    for (const s of stammar) {
      if (s.lat < lat0) lat0 = s.lat;
      if (s.lat > lat1) lat1 = s.lat;
      if (s.lng < lng0) lng0 = s.lng;
      if (s.lng > lng1) lng1 = s.lng;
    }
    if (!isFinite(lat0)) return;
    // Hantera degenererad bbox (en enstaka stam)
    if (lat1 === lat0) { lat0 -= 0.0005; lat1 += 0.0005; }
    if (lng1 === lng0) { lng0 -= 0.0008; lng1 += 0.0008; }
    const dLat = (lat1 - lat0) * PADDING_PCT;
    const dLng = (lng1 - lng0) * PADDING_PCT;
    lat0 -= dLat; lat1 += dLat;
    lng0 -= dLng; lng1 += dLng;

    // 2. Konvertera till 3857
    const [minX0, minY0] = lonLatToMercator(lng0, lat0);
    const [maxX0, maxY0] = lonLatToMercator(lng1, lat1);
    let minX = minX0, minY = minY0, maxX = maxX0, maxY = maxY0;

    // 3. Justera till canvas-aspekt så ortofoto fyller hela canvas utan förvrängning
    const bboxW = maxX - minX;
    const bboxH = maxY - minY;
    const canvasAspect = cssW / cssH;
    const bboxAspect = bboxW / bboxH;
    if (bboxAspect < canvasAspect) {
      const targetW = bboxH * canvasAspect;
      const extra = (targetW - bboxW) / 2;
      minX -= extra; maxX += extra;
    } else if (bboxAspect > canvasAspect) {
      const targetH = bboxW / canvasAspect;
      const extra = (targetH - bboxH) / 2;
      minY -= extra; maxY += extra;
    }

    // 4. WMS-fetch
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    const url = `/api/wms-proxy?layer=lm_ortofoto&bbox=${minX},${minY},${maxX},${maxY}&width=${w}&height=${h}`;

    let cancelled = false;
    setBgError(false);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      setBgImg(img);
    };
    img.onerror = () => {
      if (cancelled) return;
      setBgError(true);
      setBgImg(null);
    };
    img.src = url;

    return () => {
      cancelled = true;
    };
  }, [stammar, bredd]);

  // Rita canvas — körs både vid initial mount och när bgImg laddats
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = c.clientWidth;
    const cssH = c.clientHeight;
    if (cssW === 0 || cssH === 0) return;
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const W = cssW;
    const H = cssH;

    // Placeholder-bakgrund (alltid)
    ctx.fillStyle = PLACEHOLDER_BG;
    ctx.fillRect(0, 0, W, H);

    if (stammar.length === 0) return;

    // Räkna bbox identiskt med fetch-effekten ovan
    let lat0 = Infinity, lat1 = -Infinity, lng0 = Infinity, lng1 = -Infinity;
    for (const s of stammar) {
      if (s.lat < lat0) lat0 = s.lat;
      if (s.lat > lat1) lat1 = s.lat;
      if (s.lng < lng0) lng0 = s.lng;
      if (s.lng > lng1) lng1 = s.lng;
    }
    if (!isFinite(lat0)) return;
    if (lat1 === lat0) { lat0 -= 0.0005; lat1 += 0.0005; }
    if (lng1 === lng0) { lng0 -= 0.0008; lng1 += 0.0008; }
    const dLat = (lat1 - lat0) * PADDING_PCT;
    const dLng = (lng1 - lng0) * PADDING_PCT;
    lat0 -= dLat; lat1 += dLat;
    lng0 -= dLng; lng1 += dLng;

    const [minX0, minY0] = lonLatToMercator(lng0, lat0);
    const [maxX0, maxY0] = lonLatToMercator(lng1, lat1);
    let minX = minX0, minY = minY0, maxX = maxX0, maxY = maxY0;
    const bboxW = maxX - minX;
    const bboxH = maxY - minY;
    const canvasAspect = W / H;
    const bboxAspect = bboxW / bboxH;
    if (bboxAspect < canvasAspect) {
      const targetW = bboxH * canvasAspect;
      const extra = (targetW - bboxW) / 2;
      minX -= extra; maxX += extra;
    } else if (bboxAspect > canvasAspect) {
      const targetH = bboxW / canvasAspect;
      const extra = (targetH - bboxH) / 2;
      minY -= extra; maxY += extra;
    }

    // Ortofoto-bakgrund (om laddad)
    if (bgImg) {
      try {
        ctx.drawImage(bgImg, 0, 0, W, H);
        ctx.fillStyle = OVERLAY_DARK;
        ctx.fillRect(0, 0, W, H);
      } catch {
        // Om ritning failar — placeholder-bakgrund gäller
      }
    }

    // Projektion: 3857 → canvas-pixlar (efter aspekt-justering)
    const project = (lat: number, lng: number): [number, number] => {
      const [x, y] = lonLatToMercator(lng, lat);
      return [
        ((x - minX) / (maxX - minX)) * W,
        ((maxY - y) / (maxY - minY)) * H,
      ];
    };

    // Alla prickar lika stora, efter hur tätt träden står (storlek efter grovlek var ett budskap för mycket).
    const r = prickRadie(stammar.length, W, H);
    for (const s of stammar) {
      const [x, y] = project(s.lat, s.lng);
      ctx.beginPath();
      if (lage === 'rota') {
        if (s.rot_typ == null) {
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.globalAlpha = FRISK_ALFA;
          ctx.fillStyle = FRISK;
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          ctx.arc(x, y, r * ROT_FAKTOR, 0, Math.PI * 2);
          ctx.fillStyle = RING_ROT;
          ctx.fill();
        }
      } else {
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = fillForTradslag(s.tradslag);
        ctx.fill();
        ctx.lineWidth = 0.75;
        ctx.strokeStyle = KANT_MORK;
        ctx.stroke();
      }
    }

    // Skalstreck — 50 m i botten vänster
    const centerLat = (lat0 + lat1) / 2;
    const cosLat = Math.cos((centerLat * Math.PI) / 180);
    const bboxHeightMeters = (maxY - minY) * cosLat;
    const metersPerPixelY = bboxHeightMeters / H;
    const sbW = 50 / metersPerPixelY;
    if (sbW > 20 && sbW < W - 60) {
      const pad = 24;
      const sbY = H - 20;
      ctx.strokeStyle = SCALE_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, sbY);
      ctx.lineTo(pad + sbW, sbY);
      ctx.moveTo(pad, sbY - 4);
      ctx.lineTo(pad, sbY + 4);
      ctx.moveTo(pad + sbW, sbY - 4);
      ctx.lineTo(pad + sbW, sbY + 4);
      ctx.stroke();
      ctx.fillStyle = SCALE_TEXT;
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.fillText('50 m', pad + 6, sbY - 6);
    }

    // Tysta unused-varning för bgError — kvar som diagnoshjälp om vi vill visa
    void bgError;
  }, [stammar, bgImg, bgError, bredd, lage]);

  return (
    <canvas
      ref={ref}
      data-karta={lage}
      role="img"
      aria-label={lage === 'rota' ? 'Karta: var granarna med röta stod' : 'Karta: var träden stod, färgade efter trädslag'}
      style={{
        width: '100%',
        height: 380,
        display: 'block',
        borderRadius: 12,
        background: PLACEHOLDER_BG,
      }}
    />
  );
}
