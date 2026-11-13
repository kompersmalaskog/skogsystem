'use client';
// Fartmätaren — visas BARA när den slagits på med ?fart=1 (lib/fart/fartMatare.ts). Mäter varje byte av bakgrund eller lager:
// sidan (trycket → omritad sida), rutorna (→ kartan klar) och ritningen (långsammaste bildrutan). Rör ingenting i kartan.
import { useEffect, useRef, useState } from 'react';
import { FARG, FONT, TYP, RADIE, AVSTAND, VIKT } from '@/lib/design/tokens';
import { FART_MAX_MS, FART_NYCKEL, matningRader, sammanfatta, vadAndrades, type Hamtning, type Matning } from '@/lib/fart/fartMatare';

export interface FartMatareProps {
  /** Kartan (MapLibre) — bara `once('idle')`/`off` och `loaded()` används. */
  karta: () => any | null;
  bakgrund: string;
  lager: Record<string, boolean | undefined>;
  namn: (id: string) => string;
  /** Avstånd från skärmens överkant (testbannern, safe-area). */
  topp?: number;
}

const enhetRad = (): string => {
  try {
    const n = navigator as any;
    const nat = n.connection ? `${n.connection.effectiveType ?? '?'}${n.connection.downlink ? ` ${n.connection.downlink} Mbit` : ''}` : 'nät okänt';
    return `${n.hardwareConcurrency ?? '?'} kärnor · ${n.deviceMemory ? `${n.deviceMemory} GB` : 'minne okänt'} · ${nat} · ${window.innerWidth}×${window.innerHeight}`;
  } catch { return ''; }
};

export function FartMatare(p: FartMatareProps) {
  const [rader, setRader] = useState<Matning[]>([]);
  const [mater, setMater] = useState<string | null>(null);
  const [stangd, setStangd] = useState(false);
  const tryckRef = useRef<number | null>(null);
  const foreRef = useRef<{ bakgrund: string; lager: Record<string, boolean | undefined> } | null>(null);
  const hamtRef = useRef<Hamtning[]>([]);
  const pRef = useRef(p); pRef.current = p;

  // Senaste trycket (var som helst på sidan) och alla hämtningar samlas hela tiden; mätningen plockar det som hör till bytet.
  useEffect(() => {
    const tryck = () => { tryckRef.current = performance.now(); };
    window.addEventListener('pointerdown', tryck, true);
    let obs: PerformanceObserver | null = null;
    try {
      obs = new PerformanceObserver((l) => {
        for (const e of l.getEntries()) hamtRef.current.push({ namn: e.name, start: e.startTime, langd: e.duration });
        if (hamtRef.current.length > 4000) hamtRef.current.splice(0, 2000);
      });
      obs.observe({ type: 'resource', buffered: false });
    } catch { /* webbläsaren saknar mätningen: rutorna räknas då som 0 */ }
    return () => { window.removeEventListener('pointerdown', tryck, true); try { obs?.disconnect(); } catch { /* */ } };
  }, []);

  const lagerNyckel = JSON.stringify(Object.keys(p.lager).filter((k) => p.lager[k]).sort());
  useEffect(() => {
    const nu = { bakgrund: p.bakgrund, lager: { ...p.lager } };
    const fore = foreRef.current;
    foreRef.current = nu;
    if (!fore) return;
    const vad = vadAndrades(fore, nu, pRef.current.namn);
    if (!vad) return;
    const tryck = tryckRef.current;
    let avbruten = false;
    let ritad = 0;
    const bildrutor: number[] = [];
    let ram = 0;
    let vakt: ReturnType<typeof setTimeout> | null = null;
    const karta = pRef.current.karta();
    setMater(vad);
    const klar = (t: number | null) => {
      if (avbruten) return;
      avbruten = true;
      cancelAnimationFrame(ram);
      if (vakt) clearTimeout(vakt);
      try { karta?.off?.('idle', vidKlar); } catch { /* */ }
      setMater(null);
      setRader((r) => [sammanfatta({ vad, tryck, ritad, klar: t, hamtningar: hamtRef.current, bildrutor }), ...r].slice(0, 5));
    };
    const vidKlar = () => klar(performance.now());
    const steg = (t: number) => { if (avbruten) return; bildrutor.push(t); ram = requestAnimationFrame(steg); };
    // Två bildrutor efter att sidan räknat om = det nya är ritat på skärmen.
    ram = requestAnimationFrame(() => {
      ram = requestAnimationFrame((t) => {
        if (avbruten) return;
        ritad = t;
        bildrutor.push(t);
        ram = requestAnimationFrame(steg);
        try { if (karta?.once) karta.once('idle', vidKlar); else klar(t); } catch { klar(t); }
        vakt = setTimeout(() => klar(null), FART_MAX_MS);
      });
    });
    return () => { if (!avbruten) { avbruten = true; cancelAnimationFrame(ram); if (vakt) clearTimeout(vakt); try { karta?.off?.('idle', vidKlar); } catch { /* */ } setMater(null); } };
  }, [p.bakgrund, lagerNyckel]); // eslint-disable-line react-hooks/exhaustive-deps

  if (stangd) return null;
  const liten = { ...TYP.meta, color: FARG.text2 } as const;
  return (
    <div data-testid="fart-matare" style={{
      position: 'fixed', left: AVSTAND.m, top: (p.topp ?? 0) + 64, zIndex: 9100, width: 340, maxWidth: 'calc(100vw - 24px)', boxSizing: 'border-box',
      background: FARG.kort, color: FARG.text, borderRadius: RADIE.kort, padding: AVSTAND.m, fontFamily: FONT, userSelect: 'text',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.s }}>
        <span style={{ ...TYP.micro, color: FARG.text2 }}>Fartmätare</span>
        <button type="button" data-testid="fart-stang" onClick={() => { try { localStorage.removeItem(FART_NYCKEL); } catch { /* */ } setStangd(true); }}
          style={{ ...TYP.meta, fontFamily: 'inherit', color: FARG.bla, background: 'none', border: 'none', padding: AVSTAND.s, margin: -AVSTAND.s, cursor: 'pointer' }}>Stäng av</button>
      </div>
      <div style={{ ...liten, marginTop: AVSTAND.xs }}>{enhetRad()}</div>
      {mater && <div data-testid="fart-mater" style={{ ...TYP.meta, marginTop: AVSTAND.s }}>Mäter: {mater} …</div>}
      {rader.length === 0 && !mater && <div style={{ ...liten, marginTop: AVSTAND.s }}>Byt bakgrund eller tänd ett lager så mäts det.</div>}
      {rader.map((m, i) => {
        const r = matningRader(m);
        return (
          <div key={i} data-testid="fart-rad" style={{ marginTop: AVSTAND.s, opacity: i === 0 ? 1 : 0.6 }}>
            <div style={{ ...TYP.meta, fontWeight: VIKT.halvfet }}>{m.vad}</div>
            <div style={liten}>{r.sidan}</div>
            <div style={liten}>{r.rutorna}</div>
            <div style={liten}>{r.ritningen}</div>
          </div>
        );
      })}
    </div>
  );
}
