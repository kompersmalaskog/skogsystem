'use client';

import { useEffect, useRef, useState } from 'react';
import type { MarkagarRapport } from '@/lib/markagarrapport/types';

interface Props {
  stammar: MarkagarRapport['karta']['stammar'];
}

const RING_ROT  = '#b22222';   // firebrick — separerar från orange tall-prickar (#ff9500)
const SCALE_COLOR = 'rgba(255,255,255,0.55)';
const SCALE_TEXT  = 'rgba(255,255,255,0.7)';
const OVERLAY_DARK = 'rgba(0,0,0,0.20)';
const PLACEHOLDER_BG = '#0a0a0a';

// Trädslag-färger
const COLOR_GRAN    = '#34c759';
const COLOR_TALL    = '#ff9500';
const COLOR_BJORK   = '#d4c5a0';
const COLOR_OVR_LOV = '#8e8e93';
const COLOR_DEFAULT = 'rgba(255,255,255,0.65)';

const PADDING_PCT = 0.08;       // 8 % marginal runt stam-extent

function fillForTradslag(t: string): string {
  switch (t) {
    case 'GRAN':    return COLOR_GRAN;
    case 'TALL':    return COLOR_TALL;
    case 'BJÖRK':   return COLOR_BJORK;
    case 'ÖVR LÖV': return COLOR_OVR_LOV;
    default:        return COLOR_DEFAULT;
  }
}

/** EPSG:4326 → EPSG:3857 (Web Mercator). */
function lonLatToMercator(lon: number, lat: number): [number, number] {
  const x = (lon * 20037508.34) / 180;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (Math.log((1 + sinLat) / (1 - sinLat)) / 2) * 20037508.34 / Math.PI;
  return [x, y];
}

export default function SkogenKarta({ stammar }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [bgImg, setBgImg] = useState<HTMLImageElement | null>(null);
  const [bgError, setBgError] = useState(false);

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
  }, [stammar]);

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

    let dbhMin = Infinity, dbhMax = 0;
    for (const s of stammar) {
      const d = s.dbh_mm ?? 0;
      if (d > 0 && d < dbhMin) dbhMin = d;
      if (d > dbhMax) dbhMax = d;
    }
    if (!isFinite(dbhMin)) dbhMin = 0;
    const dbhSpan = Math.max(dbhMax - dbhMin, 1);
    const radius = (dbh: number | null) => 2.5 + ((dbh ?? dbhMin) - dbhMin) / dbhSpan * 5;

    // Stam-prickar — färgade per trädslag
    for (const s of stammar) {
      const [x, y] = project(s.lat, s.lng);
      ctx.fillStyle = fillForTradslag(s.tradslag);
      ctx.beginPath();
      ctx.arc(x, y, radius(s.dbh_mm), 0, Math.PI * 2);
      ctx.fill();
    }

    // Rot-ringar — dämpad röd för alla rotade stammar (Bmav + Avkap)
    ctx.lineWidth = 1;
    ctx.strokeStyle = RING_ROT;
    for (const s of stammar) {
      if (s.rot_typ == null) continue;
      const [x, y] = project(s.lat, s.lng);
      ctx.beginPath();
      ctx.arc(x, y, radius(s.dbh_mm) + 1, 0, Math.PI * 2);
      ctx.stroke();
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
  }, [stammar, bgImg, bgError]);

  return (
    <canvas
      ref={ref}
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
