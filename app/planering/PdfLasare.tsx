'use client';

import { useEffect, useRef, useState } from 'react';
import type * as PdfjsTypes from 'pdfjs-dist';
import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { klamZoom, rullEfterZoom, ritSkala, zoomEfterDubbeltryck, arDubbeltryck } from '@/lib/pdfZoom';

// In-app PDF-läsvy för traktdirektiv/stämplingslängd. Renderar den signerade
// bucket-PDF:en till canvas INNE i appen — aldrig window.open/nedladdning som
// slänger ut föraren ur den installerade appen. pdfjs-dist laddas LAZY (~1 MB
// drar bara in när ett dokument öppnas). Legacy-bygget för äldre iOS Safari.

// iOS Safari < 17.4 saknar Promise.withResolvers, som pdfjs kan referera. Polyfill.
function sakraPromiseWithResolvers() {
  const P = Promise as unknown as { withResolvers?: unknown };
  if (typeof P.withResolvers !== 'function') {
    (P as { withResolvers: unknown }).withResolvers = function <T>() {
      let resolve!: (v: T | PromiseLike<T>) => void;
      let reject!: (r?: unknown) => void;
      const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    };
  }
}

type Status = 'laddar' | 'klar' | 'fel';

/** Knapparna i läsarens huvud (Skriv ut, Dela / spara): 44 px höga, blå text. */
const HUVUD_KNAPP: React.CSSProperties = {
  height: TRAFFYTA.min, padding: `0 ${AVSTAND.l}px`, borderRadius: RADIE.knapp, border: 'none', background: FARG.fyllning,
  color: FARG.bla, ...TYP.listtitel, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit',
};

export default function PdfLasare({ signedUrl, titel, onClose, delaFilnamn }: {
  signedUrl: string;
  titel: string;
  onClose: () => void;
  /** Sätts → en "Dela / spara"-knapp i headern. Hämtar PDF:en (same-origin,
   *  cookie följer med) och lämnar den till delningsarket (navigator.share med
   *  fil — iOS 15+, även installerad app) så föraren SER dokumentet först och
   *  väljer sedan om han sparar. Saknas fil-delning: öppna i ny flik. */
  delaFilnamn?: string;
}) {
  const [status, setStatus] = useState<Status>('laddar');
  const [delar, setDelar] = useState(false);
  const [skriverUt, setSkriverUt] = useState(false);
  const [kanSkrivaUt, setKanSkrivaUt] = useState(false);
  const sidytaRef = useRef<HTMLDivElement>(null);

  // ZOOM. Appen har zoom låst (app/layout.tsx), så läsaren zoomar själv: nyp med
  // två fingrar, dubbeltryck (in/ut), mus-dubbelklick och ctrl+hjul (styrplattans
  // nyp på datorn). Sidorna ritas om skarpt i den nya storleken när fingrarna
  // släppt. Reglerna i lib/pdfZoom.ts.
  const innerRef = useRef<HTMLDivElement | null>(null);
  const sidorRef = useRef<any[]>([]);
  const breddRef = useRef(560);
  const zoomRef = useRef(1);
  const ritGenRef = useRef(0);
  const ritTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const KANT = 12;

  const ritaOm = async (zoom: number) => {
    const gen = ++ritGenRef.current;
    const inner = innerRef.current;
    if (!inner) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (let i = 0; i < sidorRef.current.length; i++) {
      if (gen !== ritGenRef.current) return;
      const sida = sidorRef.current[i];
      const bas = sida.getViewport({ scale: 1 });
      const vy = sida.getViewport({ scale: ritSkala(bas.width, bas.height, breddRef.current, zoom, dpr) });
      const canvas = nyCanvas(vy);
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      try { await sida.render({ canvasContext: ctx, viewport: vy }).promise; } catch { return; }
      if (gen !== ritGenRef.current) return;
      const gammal = inner.children[i];
      if (gammal) inner.replaceChild(canvas, gammal); else inner.appendChild(canvas);
    }
  };

  const zoomaTill = (onskad: number, fx: number, fy: number) => {
    const sidyta = sidytaRef.current;
    const inner = innerRef.current;
    if (!sidyta || !inner) return;
    const fore = zoomRef.current;
    const ny = klamZoom(onskad);
    if (Math.abs(ny - fore) < 0.001) return;
    const sl = sidyta.scrollLeft, st = sidyta.scrollTop;
    inner.style.width = `${breddRef.current * ny}px`;
    zoomRef.current = ny;
    sidyta.scrollLeft = rullEfterZoom(sl, fx, fore, ny, KANT);
    sidyta.scrollTop = rullEfterZoom(st, fy, fore, ny, KANT);
    if (ritTimerRef.current) clearTimeout(ritTimerRef.current);
    ritTimerRef.current = setTimeout(() => { void ritaOm(zoomRef.current); }, 250);
  };

  useEffect(() => {
    try { setKanSkrivaUt(window.matchMedia('(pointer: fine)').matches); } catch { /* ingen utskrift */ }
  }, []);

  useEffect(() => {
    const sidyta = sidytaRef.current;
    if (!sidyta) return;
    const relativ = (x: number, y: number) => { const r = sidyta.getBoundingClientRect(); return { fx: x - r.left, fy: y - r.top }; };
    let nyp: { d0: number; z0: number } | null = null;
    let tryck: { x: number; y: number; flyttat: boolean } | null = null;
    let forraTryck: { t: number; x: number; y: number } | null = null;
    const avst = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const start = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        nyp = { d0: avst(e.touches) || 1, z0: zoomRef.current };
        tryck = null;
      } else if (e.touches.length === 1) {
        tryck = { x: e.touches[0].clientX, y: e.touches[0].clientY, flyttat: false };
      }
    };
    const flytta = (e: TouchEvent) => {
      if (nyp && e.touches.length === 2) {
        e.preventDefault();
        const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const { fx, fy } = relativ(mx, my);
        zoomaTill(nyp.z0 * (avst(e.touches) / nyp.d0), fx, fy);
      } else if (tryck && e.touches.length === 1) {
        if (Math.hypot(e.touches[0].clientX - tryck.x, e.touches[0].clientY - tryck.y) > 10) tryck.flyttat = true;
      }
    };
    const slut = (e: TouchEvent) => {
      if (nyp) { if (e.touches.length < 2) nyp = null; forraTryck = null; return; }
      if (!tryck || tryck.flyttat || e.touches.length > 0) { tryck = null; return; }
      const nu = { t: Date.now(), x: tryck.x, y: tryck.y };
      tryck = null;
      if (arDubbeltryck(forraTryck, nu)) {
        e.preventDefault();
        forraTryck = null;
        const { fx, fy } = relativ(nu.x, nu.y);
        zoomaTill(zoomEfterDubbeltryck(zoomRef.current), fx, fy);
      } else {
        forraTryck = nu;
      }
    };
    const dubbelklick = (e: MouseEvent) => {
      const { fx, fy } = relativ(e.clientX, e.clientY);
      zoomaTill(zoomEfterDubbeltryck(zoomRef.current), fx, fy);
    };
    const hjul = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // vanlig rullning går till rullytan
      e.preventDefault();
      const { fx, fy } = relativ(e.clientX, e.clientY);
      zoomaTill(zoomRef.current * Math.exp(-e.deltaY / 200), fx, fy);
    };
    sidyta.addEventListener('touchstart', start, { passive: false });
    sidyta.addEventListener('touchmove', flytta, { passive: false });
    sidyta.addEventListener('touchend', slut, { passive: false });
    sidyta.addEventListener('dblclick', dubbelklick);
    sidyta.addEventListener('wheel', hjul, { passive: false });
    return () => {
      sidyta.removeEventListener('touchstart', start);
      sidyta.removeEventListener('touchmove', flytta);
      sidyta.removeEventListener('touchend', slut);
      sidyta.removeEventListener('dblclick', dubbelklick);
      sidyta.removeEventListener('wheel', hjul);
      if (ritTimerRef.current) clearTimeout(ritTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // STÄNGNING. Läsvyn ligger ÖVER all app-chrome: appens globala TopBar
  // (app/layout.tsx) är fixed med z-index 1000 och döljs bara på /planering —
  // på /arbetsrapport och /redigering täckte den läsvyns header så krysset
  // inte gick att nå (Martin satt fast i tidsspecen, 2026-09-07). Därför
  // z 3000+, och tre vägar ut: stort kryss (44 px, handskvänligt), telefonens
  // bakåtgest (history-post som poppas) och Escape. Alla går till onClose —
  // föräldern nollar bara sin state, så man landar där man var.
  const stangdRef = useRef(false);
  const historyPostRef = useRef(false);
  const stang = () => {
    if (stangdRef.current) return;
    stangdRef.current = true;
    if (historyPostRef.current) {
      // Vår post ligger överst → back poppar den; popstate-lyssnaren nedan
      // ser stangdRef och anropar inte onClose två gånger.
      historyPostRef.current = false;
      try { window.history.back(); } catch { /* ignoreras */ }
    }
    onClose();
  };
  useEffect(() => {
    try {
      window.history.pushState({ pdfLasare: true }, '', window.location.href);
      historyPostRef.current = true;
    } catch { /* ingen history — krysset räcker */ }
    const onPop = () => {
      historyPostRef.current = false;
      if (!stangdRef.current) { stangdRef.current = true; onClose(); }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') stang(); };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      // Avmonterad utan back (t.ex. föräldern nollade state själv): ta bort
      // vår post så nästa bakåtgest inte bara "gör ingenting".
      if (historyPostRef.current) { historyPostRef.current = false; try { window.history.back(); } catch { /* ignoreras */ } }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dela = async () => {
    if (!delaFilnamn || delar) return;
    setDelar(true);
    try {
      const r = await fetch(signedUrl, { credentials: 'same-origin', cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const fil = new File([blob], delaFilnamn, { type: 'application/pdf' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare({ files: [fil] }))) {
        await nav.share({ files: [fil], title: titel });
      } else {
        // Ingen fil-delning (äldre webbläsare/desktop): öppna dokumentet i ny flik —
        // därifrån finns webbläsarens egna spara/skriv ut.
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (e: any) {
      // Avbruten delning (AbortError) är inte ett fel.
      if (e?.name !== 'AbortError') console.warn('[PdfLasare] dela misslyckades', e?.message || e);
    } finally {
      setDelar(false);
    }
  };

  // SKRIV UT (dator): PDF:en i en dold ram och webbläsarens egen utskrift.
  // På telefonen skriver man ut via Dela / spara (delningsarket har Skriv ut).
  const skrivUt = async () => {
    if (skriverUt) return;
    setSkriverUt(true);
    try {
      const r = await fetch(signedUrl, { credentials: 'same-origin', cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const url = URL.createObjectURL(await r.blob());
      const ram = document.createElement('iframe');
      ram.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
      ram.src = url;
      ram.onload = () => {
        try { ram.contentWindow?.focus(); ram.contentWindow?.print(); }
        catch { window.open(url, '_blank', 'noopener'); }
      };
      document.body.appendChild(ram);
      setTimeout(() => { ram.remove(); URL.revokeObjectURL(url); }, 120_000);
    } catch (e: any) {
      console.warn('[PdfLasare] skriv ut misslyckades', e?.message || e);
    } finally {
      setSkriverUt(false);
    }
  };

  useEffect(() => {
    let avbruten = false;
    let doc: any = null;

    (async () => {
      try {
        sakraPromiseWithResolvers();
        const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as typeof PdfjsTypes;
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

        doc = await pdfjs.getDocument({ url: signedUrl }).promise;
        if (avbruten) { doc.destroy(); return; }

        const sidyta = sidytaRef.current;
        if (!sidyta) return;
        sidyta.innerHTML = '';
        const inner = document.createElement('div');
        sidyta.appendChild(inner);
        innerRef.current = inner;
        sidorRef.current = [];
        zoomRef.current = 1;

        const cssBredd = Math.max(240, Math.min((sidyta.clientWidth || 560) - 2 * KANT, 900));
        breddRef.current = cssBredd;
        inner.style.width = cssBredd + 'px';
        inner.style.margin = '0 auto';
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let n = 1; n <= doc.numPages; n++) {
          if (avbruten) return;
          const sida = await doc.getPage(n);
          sidorRef.current.push(sida);
          const bas = sida.getViewport({ scale: 1 });
          const vy = sida.getViewport({ scale: ritSkala(bas.width, bas.height, cssBredd, 1, dpr) });

          const canvas = nyCanvas(vy);
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          inner.appendChild(canvas);

          await sida.render({ canvasContext: ctx, viewport: vy }).promise;
          // Visa läsvyn så fort första sidan är klar; resten fylls på under.
          if (n === 1 && !avbruten) setStatus('klar');
        }
        if (!avbruten) setStatus('klar');
      } catch (e) {
        console.error('[PdfLasare] kunde inte rendera', signedUrl, e);
        if (!avbruten) setStatus('fel');
      }
    })();

    return () => {
      avbruten = true;
      if (doc) { try { doc.destroy(); } catch { /* ignoreras */ } }
    };
  }, [signedUrl]);

  return (
    <>
      <div onClick={stang} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 3000 }} />
      <div style={{
        position: 'fixed', inset: 0, zIndex: 3010, display: 'flex', flexDirection: 'column',
        background: '#0d0d0f',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif",
      }}>
        {/* Header — krysset uppe till höger, 44 px: träffas med handske */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px 10px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0,
        }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titel}</span>
          {kanSkrivaUt && status === 'klar' && (
            <button type="button" onClick={skrivUt} disabled={skriverUt} style={{ ...HUVUD_KNAPP, opacity: skriverUt ? 0.6 : 1 }}>{skriverUt ? 'Öppnar…' : 'Skriv ut'}</button>
          )}
          {delaFilnamn && status === 'klar' && (
            <button type="button" onClick={dela} disabled={delar} style={{ ...HUVUD_KNAPP, opacity: delar ? 0.6 : 1 }}>{delar ? 'Delar…' : 'Dela / spara'}</button>
          )}
          <button type="button" onClick={stang} aria-label="Stäng" style={{
            width: 44, height: 44, borderRadius: 22, border: 'none', background: 'rgba(255,255,255,0.16)',
            color: '#fff', fontSize: 22, lineHeight: '44px', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit', padding: 0,
          }}>✕</button>
        </div>

        {/* Sidyta — canvases appendas här manuellt (React äger inte barnen) */}
        <div ref={sidytaRef} style={{
          flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch',
          // Ett finger rullar som vanligt; två fingrar (nyp) tar läsaren själv.
          touchAction: 'pan-x pan-y',
          padding: '12px 12px calc(env(safe-area-inset-bottom, 0px) + 16px)',
        }} />

        {/* Laddar */}
        {status === 'laddar' && (
          <div style={{ position: 'absolute', left: 0, right: 0, top: 58, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, pointerEvents: 'none' }}>
            <div style={{ width: 34, height: 34, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#4da3ff', borderRadius: '50%', animation: 'pdfspin 0.8s linear infinite' }} />
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>Laddar dokument…</div>
            <style>{`@keyframes pdfspin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Kunde inte läsa — skilt från tomt/laddar */}
        {status === 'fel' && (
          <div style={{ position: 'absolute', left: 0, right: 0, top: 58, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Kunde inte läsa dokumentet</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', maxWidth: 300, lineHeight: 1.5 }}>Dokumentet gick inte att öppna. Kontrollera nätet och försök igen.</div>
            <button type="button" onClick={stang} style={{ marginTop: 4, padding: '10px 22px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Stäng</button>
          </div>
        )}
      </div>
    </>
  );
}

/** En sida som canvas: bredden följer ramen (som zoomen ändrar), höjden följer med. */
function nyCanvas(vy: { width: number; height: number }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vy.width);
  canvas.height = Math.floor(vy.height);
  canvas.style.width = '100%';
  canvas.style.height = 'auto';
  canvas.style.display = 'block';
  canvas.style.marginBottom = '10px';
  canvas.style.background = '#fff';
  canvas.style.borderRadius = '6px';
  canvas.style.boxShadow = '0 2px 10px rgba(0,0,0,0.35)';
  return canvas;
}
