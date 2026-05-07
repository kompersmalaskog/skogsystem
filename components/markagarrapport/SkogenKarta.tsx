'use client';

import { useEffect, useRef } from 'react';
import type { MarkagarRapport } from '@/lib/markagarrapport/types';

interface Props {
  stammar: MarkagarRapport['karta']['stammar'];
}

const RING_ROT  = '#ff3b30';   // alla rotade stammar — en ringtyp
const SCALE_COLOR = 'rgba(255,255,255,0.45)';
const SCALE_TEXT  = 'rgba(255,255,255,0.6)';

// Trädslag-färger
const COLOR_GRAN    = '#34c759';
const COLOR_TALL    = '#ff9500';
const COLOR_BJORK   = '#d4c5a0';
const COLOR_OVR_LOV = '#8e8e93';
const COLOR_DEFAULT = 'rgba(255,255,255,0.65)';

function fillForTradslag(t: string): string {
  switch (t) {
    case 'GRAN':    return COLOR_GRAN;
    case 'TALL':    return COLOR_TALL;
    case 'BJÖRK':   return COLOR_BJORK;
    case 'ÖVR LÖV': return COLOR_OVR_LOV;
    default:        return COLOR_DEFAULT;
  }
}

export default function SkogenKarta({ stammar }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c || stammar.length === 0) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = c.clientWidth;
    const cssH = c.clientHeight;
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const W = cssW;
    const H = cssH;
    const pad = 24;

    let lat0 = Infinity, lat1 = -Infinity, lng0 = Infinity, lng1 = -Infinity;
    for (const s of stammar) {
      if (s.lat < lat0) lat0 = s.lat;
      if (s.lat > lat1) lat1 = s.lat;
      if (s.lng < lng0) lng0 = s.lng;
      if (s.lng > lng1) lng1 = s.lng;
    }
    if (!isFinite(lat0)) return;

    const mPerLat = 111000;
    const mPerLng = 111000 * Math.cos(((lat0 + lat1) / 2) * Math.PI / 180);
    const wM = (lng1 - lng0) * mPerLng;
    const hM = (lat1 - lat0) * mPerLat;
    const sc = Math.min((W - 2 * pad) / Math.max(wM, 1), (H - 2 * pad) / Math.max(hM, 1));
    const ox = (W - wM * sc) / 2;
    const oy = (H - hM * sc) / 2;

    let dbhMin = Infinity, dbhMax = 0;
    for (const s of stammar) {
      const d = s.dbh_mm ?? 0;
      if (d > 0 && d < dbhMin) dbhMin = d;
      if (d > dbhMax) dbhMax = d;
    }
    if (!isFinite(dbhMin)) dbhMin = 0;
    const dbhSpan = Math.max(dbhMax - dbhMin, 1);

    const project = (lat: number, lng: number): [number, number] => [
      ox + (lng - lng0) * mPerLng * sc,
      oy + (lat1 - lat) * mPerLat * sc,
    ];
    const radius = (dbh: number | null) => 2.5 + ((dbh ?? dbhMin) - dbhMin) / dbhSpan * 5;

    // Prickar — färgade per trädslag
    for (const s of stammar) {
      const [x, y] = project(s.lat, s.lng);
      ctx.fillStyle = fillForTradslag(s.tradslag);
      ctx.beginPath();
      ctx.arc(x, y, radius(s.dbh_mm), 0, Math.PI * 2);
      ctx.fill();
    }

    // En ringtyp — röd för alla rotade stammar (Bmav, Avkap, Grade9)
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = RING_ROT;
    for (const s of stammar) {
      if (s.rot_typ == null) continue;
      const [x, y] = project(s.lat, s.lng);
      ctx.beginPath();
      ctx.arc(x, y, radius(s.dbh_mm) + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 50 m skalstreck nere till vänster
    const sbW = 50 * sc;
    if (sbW > 20 && sbW < W - 2 * pad) {
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
  }, [stammar]);

  return (
    <canvas
      ref={ref}
      style={{
        width: '100%',
        height: 380,
        display: 'block',
        borderRadius: 12,
        background: '#0a0a0a',
      }}
    />
  );
}
