'use client';

import { useEffect, useRef, useState } from 'react';
import type * as PdfjsTypes from 'pdfjs-dist';

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

export default function PdfLasare({ signedUrl, titel, onClose }: {
  signedUrl: string;
  titel: string;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<Status>('laddar');
  const sidytaRef = useRef<HTMLDivElement>(null);

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

        const cssBredd = Math.max(240, Math.min((sidyta.clientWidth || 560) - 24, 900));
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let n = 1; n <= doc.numPages; n++) {
          if (avbruten) return;
          const sida = await doc.getPage(n);
          const bas = sida.getViewport({ scale: 1 });
          const vy = sida.getViewport({ scale: (cssBredd / bas.width) * dpr });

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          canvas.width = Math.floor(vy.width);
          canvas.height = Math.floor(vy.height);
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.style.display = 'block';
          canvas.style.margin = '0 auto 10px';
          canvas.style.maxWidth = cssBredd + 'px';
          canvas.style.background = '#fff';
          canvas.style.borderRadius = '6px';
          canvas.style.boxShadow = '0 2px 10px rgba(0,0,0,0.35)';
          sidyta.appendChild(canvas);

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
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 490 }} />
      <div style={{
        position: 'fixed', inset: 0, zIndex: 495, display: 'flex', flexDirection: 'column',
        background: '#0d0d0f',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif",
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0,
        }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titel}</span>
          <button type="button" onClick={onClose} aria-label="Stäng" style={{
            width: 36, height: 36, borderRadius: 18, border: 'none', background: 'rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.85)', fontSize: 17, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit',
          }}>✕</button>
        </div>

        {/* Sidyta — canvases appendas här manuellt (React äger inte barnen) */}
        <div ref={sidytaRef} style={{
          flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
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
            <button type="button" onClick={onClose} style={{ marginTop: 4, padding: '10px 22px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Stäng</button>
          </div>
        )}
      </div>
    </>
  );
}
