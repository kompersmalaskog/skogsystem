'use client';

// Underskrift med fingret (mottagaren av farligt avfall). En ruta man ritar i; ett finger, en penna eller en mus — samma pekarhändelser.
// Rutan tar trycket själv (touch-action: none) så att sidan inte rullar medan man skriver. "Rensa" börjar om.
// onAndrad får en PNG som data-URL efter varje drag, eller null när rutan är tom.

import { useEffect, useRef, useState } from 'react';
import { AVSTAND, FARG, KNAPP, RADIE, TYP } from '@/lib/design/tokens';

const HOJD = 160;

export default function Underskrift({ onAndrad }: { onAndrad: (png: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ritar = useRef(false);
  const sist = useRef<{ x: number; y: number } | null>(null);
  const [tom, setTom] = useState(true);

  // Rätt upplösning för skärmen, så strecket blir skarpt.
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const b = c.clientWidth || 300;
    c.width = Math.round(b * dpr);
    c.height = Math.round(HOJD * dpr);
    const ctx = c.getContext('2d');
    if (ctx) { ctx.scale(dpr, dpr); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = FARG.text; }
  }, []);

  const punkt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const ner = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    ritar.current = true;
    const p = punkt(e);
    sist.current = p;
    const ctx = e.currentTarget.getContext('2d');
    if (ctx) { ctx.beginPath(); ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2); ctx.fillStyle = FARG.text; ctx.fill(); }
  };

  const drag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ritar.current || !sist.current) return;
    const p = punkt(e);
    const ctx = e.currentTarget.getContext('2d');
    if (ctx) { ctx.beginPath(); ctx.moveTo(sist.current.x, sist.current.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    sist.current = p;
  };

  const upp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ritar.current) return;
    ritar.current = false;
    sist.current = null;
    setTom(false);
    let png: string | null = null;
    try { png = e.currentTarget.toDataURL('image/png'); } catch { png = null; }
    onAndrad(png);
  };

  const rensa = () => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore(); }
    setTom(true);
    onAndrad(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ ...TYP.meta, color: FARG.text2 }}>Skriv under med fingret</span>
        {!tom && <button type="button" onClick={rensa} style={KNAPP.lank}>Rensa</button>}
      </div>
      <canvas ref={ref} data-avfall-underskrift aria-label="Underskrift" role="img"
        onPointerDown={ner} onPointerMove={drag} onPointerUp={upp} onPointerCancel={upp}
        style={{ width: '100%', height: HOJD, touchAction: 'none', borderRadius: RADIE.kort, background: FARG.upphojt, border: `1px dashed ${FARG.fyllning}`, boxSizing: 'border-box', cursor: 'crosshair' }} />
    </div>
  );
}
