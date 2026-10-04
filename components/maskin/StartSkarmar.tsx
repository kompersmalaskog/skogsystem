'use client';

// Skärmarna för /maskin och maskindatorns startsekvens.
//
//  • StartSvartSkarm — svart täckskikt. Delas av /maskin-routens fallback, väntläget ("roll/maskinregister laddas")
//    och startsekvensens täckskikt, så att de tre ser identiska ut och inget hoppar när ett byts mot nästa. Tonar
//    ut (opacity) → kartan "tonar upp ur svart". Under 1 s: HELT svart (ingenting). Varar svart längre berättar den:
//    granen ur loggan i vitt (56 px), maskinens namn i liten grå text under den, en tunn, långsam förloppsrad, och
//    efter 10 s vad som dröjer ("Väntar på nät" / "Hämtar karta"). Allt grått/vitt på svart. Tiden räknas från
//    NAVIGERINGEN (performance.now) så de tre lagren delar klocka.
//  • MaskinSomFelSkarm — felskärmar (ej behörig / okänd maskin / laddning fastnar) visar hela loggan. Loggan är
//    SAMMA fil som inloggningssidan (/logo.png), 1953×867. (Väntskärmen visar bara granen ur den, /gran-vit.png.)

import React, { useEffect, useState } from 'react';
import { COVER_FADE_MS, svartInfo, svartVad } from '@/lib/maskinstart';

const GRAN_HOJD_PX = 56;

const KEYFRAMES = `
@keyframes maskinSvartForlopp { 0% { left: -40%; } 100% { left: 100%; } }
@keyframes maskinSvartTona { from { opacity: 0; } to { opacity: 1; } }
`;

/** Svart täckskikt. synlig=false → tonar ut över COVER_FADE_MS och släpper igenom tryck.
 *  namn = maskinens namn (visas först efter 1 s). kartaFinns = kartan är monterad (styr vad "Hämtar …" säger efter 10 s). */
export function StartSvartSkarm({ synlig = true, zIndex = 9000, namn = null, kartaFinns = false }: {
  synlig?: boolean; zIndex?: number; namn?: string | null; kartaFinns?: boolean;
}) {
  // null tills monterad: server och första klient-rendering ger EXAKT samma (helsvarta) markup → ingen hydrerings-skillnad.
  const [nu, setNu] = useState<number | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (!synlig) return;
    const tick = () => setNu(Math.round(performance.now()));
    tick();
    const iv = setInterval(tick, 250);
    return () => clearInterval(iv);
  }, [synlig]);

  useEffect(() => {
    const uppdatera = () => setOnline(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
    uppdatera();
    window.addEventListener('online', uppdatera);
    window.addEventListener('offline', uppdatera);
    return () => { window.removeEventListener('online', uppdatera); window.removeEventListener('offline', uppdatera); };
  }, []);

  const info = nu == null ? null : svartInfo({ sedanNavigeringMs: nu, namn, vad: svartVad({ online, kartaFinns }) });

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed', inset: 0, zIndex, background: '#000',
        opacity: synlig ? 1 : 0,
        pointerEvents: synlig ? 'auto' : 'none',
        transition: `opacity ${COVER_FADE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
      }}
    >
      {info && info.forlopp && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
          animation: 'maskinSvartTona 600ms ease forwards', opacity: 0,
        }}>
          <style>{KEYFRAMES}</style>
          {/* Granen ur loggan i VITT (public/gran-vit.png, utklippt med scripts/gran-fran-logga.mjs). Höjd 56 px; width/height
              speglar det verkliga förhållandet (129×168) så inget hoppar när bilden laddas. Först efter 1 s, som resten. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/gran-vit.png" alt="" width={129} height={168}
            style={{ height: `${GRAN_HOJD_PX}px`, width: 'auto', display: 'block', opacity: 0.9, marginBottom: '6px' }} />
          {info.namn && <div style={{ fontSize: '13px', letterSpacing: '0.4px', color: 'rgba(255,255,255,0.5)' }}>{info.namn}</div>}
          {/* Tunn, långsam förloppsrad: ett kort streck som glider över ett nästan osynligt spår. */}
          <div style={{ position: 'relative', width: '120px', height: '2px', borderRadius: '1px', background: 'rgba(255,255,255,0.09)', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, bottom: 0, width: '40%', borderRadius: '1px', background: 'rgba(255,255,255,0.4)', animation: 'maskinSvartForlopp 2.8s ease-in-out infinite' }} />
          </div>
          {info.text && <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{info.text}</div>}
        </div>
      )}
    </div>
  );
}

/** Ärlig felskärm för /maskin?som=… — loggan + vad som är fel + en väg tillbaka. Aldrig en tom skärm. */
export function MaskinSomFelSkarm({ text, onTillbaka }: { text: string; onTillbaka: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9100, background: '#000', color: '#fff',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px',
      padding: '24px', textAlign: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
    }}>
      {/* SAMMA fil som inloggningssidan (/logo.png). Höjd styr storleken (bilden är 2,25:1); min(…, vh) ger
          plats åt texten och knappen i ett lågt fönster. width/height speglar det verkliga förhållandet. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="Kompersmåla Skog" width={1953} height={867}
        style={{ height: 'min(190px, 28vh)', width: 'auto', maxWidth: '80vw', objectFit: 'contain', opacity: 0.95 }} />
      <div style={{ fontSize: '17px', lineHeight: 1.4, maxWidth: '420px' }}>{text}</div>
      <button type="button" onClick={onTillbaka}
        style={{ minHeight: '48px', padding: '0 28px', borderRadius: '12px', border: 'none', background: '#fff', color: '#000', fontSize: '17px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
        Till appen
      </button>
    </div>
  );
}
