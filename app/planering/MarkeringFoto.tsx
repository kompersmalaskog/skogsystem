'use client';

// Visar en markerings foto. Hämtar signerad URL FÖRST när komponenten visas (kortet öppnas) —
// aldrig för listor/kartor. Faller tillbaka på inbäddat photoData för markeringar som inte
// migrerats ännu. photoPath vinner alltid om båda finns.
//
//   lazy=true: ett foto i Storage visas som en "Visa foto"-knapp och hämtas först vid tryck
//              (för rader i listor). photoData-foton visas direkt, som förut.
//   aktiv=false: hämtar ingenting än (t.ex. proximitetskort utanför radien).

import { useEffect, useState, type CSSProperties } from 'react';
import { signeraMarkeringFoto } from '@/lib/markeringFoto';

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
}

export default function MarkeringFoto({ photoPath, photoData, photoTs, style, alt = 'Foto', lazy = false, aktiv = true, onOpen }: Props) {
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
