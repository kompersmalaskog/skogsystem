'use client';

// Spelar ett ljud ur den privata bucketen `audio` via en kortlivad signerad länk (lib/ljud.ts). Ersätter varje
// <audio src={…}> som förut pekade på en publik URL; lokala källor (blob:, data:) spelas som de är.
// Går länken ut medan sidan står öppen (felhändelse från <audio>) skapas en ny, en gång per källa.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { supabase } from '@/lib/supabase';
import { ljudSpelbarKalla } from '@/lib/ljud';
import { FARG, TYP } from '@/lib/design/tokens';

export function LjudSpelare({ src, style, autoPlay }: { src: string | null | undefined; style?: CSSProperties; autoPlay?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [fel, setFel] = useState(false);
  const omforsokt = useRef(false);

  const hamta = useCallback(async () => {
    const r = await ljudSpelbarKalla(supabase as any, src);
    if (r.ok) { setUrl(r.url); setFel(false); } else { setUrl(null); setFel(true); }
  }, [src]);

  useEffect(() => {
    omforsokt.current = false;
    setUrl(null); setFel(false);
    let avbruten = false;
    void (async () => {
      const r = await ljudSpelbarKalla(supabase as any, src);
      if (avbruten) return;
      if (r.ok) setUrl(r.url); else setFel(true);
    })();
    return () => { avbruten = true; };
  }, [src]);

  if (!src) return null;
  if (fel) return <span data-ljud-fel style={{ ...TYP.meta, color: FARG.text2 }}>Ljudet kunde inte laddas.</span>;
  return (
    <audio
      controls
      autoPlay={autoPlay}
      preload="metadata"
      src={url ?? undefined}
      style={style}
      onError={() => { if (!omforsokt.current) { omforsokt.current = true; void hamta(); } }}
    />
  );
}
