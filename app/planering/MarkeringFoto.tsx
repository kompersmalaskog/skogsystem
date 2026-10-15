'use client';

// Visar en markerings foto. Hämtar signerad URL FÖRST när komponenten visas (kortet öppnas) —
// aldrig för listor/kartor. Faller tillbaka på inbäddat photoData för markeringar som inte
// migrerats ännu. photoPath vinner alltid om båda finns.
//
//   lokal: fotot ligger på den här enheten och väntar på uppladdning (lib/markeringFotoKo) — visas direkt, med en liten
//          "väntar på uppladdning"-ikon, och vinner över photoPath (ett omtag ska synas genast).
//
//   lazy=true: ett foto i Storage visas som en "Visa foto"-knapp och hämtas först vid tryck
//              (för rader i listor). photoData-foton visas direkt, som förut.
//   aktiv=false: hämtar ingenting än (t.ex. proximitetskort utanför radien).

import { useEffect, useState, type CSSProperties } from 'react';
import { AVSTAND, FARG, IKON, RADIE } from '@/lib/design/tokens';
import { signeraMarkeringFoto } from '@/lib/markeringFoto';
import { lokaltMarkeringFoto, prenumereraFotoKo } from '@/lib/markeringFotoKo';

interface Props {
  photoPath?: string | null;
  photoData?: string | null;
  /** Ändras vid omtag — tvingar ny signerad URL (sökvägen är densamma). */
  photoTs?: number | null;
  style?: CSSProperties;
  alt?: string;
  lazy?: boolean;
  aktiv?: boolean;
  /** Klick på bilden; får den färdiga URL:en (för fullskärm). */
  onOpen?: (src: string) => void;
  /** Ett foto som väntar på uppladdning på den här enheten (objekt + markering) — visas lokalt. */
  lokal?: { objektId: string; markerId: string } | null;
}

/** Liten, diskret ikon: fotot är taget men inte uppe än. Inget popup-besked. */
export function FotoVantarIkon({ style }: { style?: CSSProperties }) {
  return (
    <span data-testid="foto-vantar" role="img" aria-label="Väntar på uppladdning" title="Väntar på uppladdning"
      style={{ position: 'absolute', top: AVSTAND.s - AVSTAND.xs / 2, right: AVSTAND.s - AVSTAND.xs / 2, width: IKON.rad + AVSTAND.xs, height: IKON.rad + AVSTAND.xs, borderRadius: RADIE.cirkel, background: FARG.bg, opacity: 0.8, color: FARG.text, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', ...style }}>
      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.text }}>cloud_upload</span>
    </span>
  );
}

/** Läser det lokala fotot (om det finns) som en objekt-URL; följer kön (uppe → borta, omtag → nytt). */
function useLokalSrc(lokal: { objektId: string; markerId: string } | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(null);
  const objektId = lokal?.objektId; const markerId = lokal?.markerId;
  useEffect(() => {
    if (!objektId || !markerId) { setSrc(null); return; }
    let avbruten = false; let url: string | null = null;
    const las = async () => {
      const blob = await lokaltMarkeringFoto(objektId, markerId).catch(() => null);
      if (avbruten) return;
      if (url) URL.revokeObjectURL(url);
      url = blob ? URL.createObjectURL(blob) : null;
      setSrc(url);
    };
    void las();
    const av = prenumereraFotoKo(() => { void las(); });
    return () => { avbruten = true; av(); if (url) URL.revokeObjectURL(url); };
  }, [objektId, markerId]);
  return src;
}

export default function MarkeringFoto({ photoPath, photoData, photoTs, style, alt = 'Foto', lazy = false, aktiv = true, onOpen, lokal }: Props) {
  const lokalSrc = useLokalSrc(lokal);
  const [src, setSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<'vilar' | 'laddar' | 'fel'>('vilar');
  const [begart, setBegart] = useState(!lazy);
  const [forsok, setForsok] = useState(0);

  useEffect(() => {
    if (!photoPath) { setSrc(null); setStatus('vilar'); return; }
    if (!aktiv || !begart) return;
    let avbruten = false;
    setStatus('laddar');
    signeraMarkeringFoto(photoPath).then((url) => {
      if (avbruten) return;
      if (url) { setSrc(url); setStatus('vilar'); } else { setSrc(null); setStatus('fel'); }
    });
    return () => { avbruten = true; };
  }, [photoPath, photoTs, aktiv, begart, forsok]);

  // Ett foto som väntar på uppladdning: visas direkt från enheten, med väntar-ikonen.
  if (lokalSrc) {
    const fullBredd = style?.width === '100%';
    return (
      <span style={{ position: 'relative', display: fullBredd ? 'block' : 'inline-block', lineHeight: 0 }}>
        <img src={lokalSrc} alt={alt} onClick={onOpen ? () => onOpen(lokalSrc) : undefined} style={{ cursor: onOpen ? 'pointer' : undefined, ...style }} />
        <FotoVantarIkon />
      </span>
    );
  }

  // Gammalt format: inbäddat foto, ingen Storage-sökväg.
  if (!photoPath) {
    if (!photoData) return null;
    return <img src={photoData} alt={alt} onClick={onOpen ? () => onOpen(photoData) : undefined} style={{ cursor: onOpen ? 'pointer' : undefined, ...style }} />;
  }

  if (src) {
    return <img src={src} alt={alt} onClick={onOpen ? () => onOpen(src) : undefined} style={{ cursor: onOpen ? 'pointer' : undefined, ...style }} />;
  }

  const ruta: CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', fontSize: 13, minHeight: 56, ...style,
  };

  if (status === 'laddar') return <div style={ruta}>Hämtar foto…</div>;
  if (status === 'fel') {
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); setForsok((n) => n + 1); setBegart(true); }}
        style={{ ...ruta, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        Kunde inte hämta fotot — tryck för att försöka igen
      </button>
    );
  }
  // vilar + lazy: ingen hämtning förrän någon trycker
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); setBegart(true); }}
      style={{ ...ruta, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
      📷 Visa foto
    </button>
  );
}
