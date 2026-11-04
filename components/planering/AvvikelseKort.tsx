'use client';

// Kortet när man trycker på en avvikelse (röd romb) på kartan: fotot, vad, vem och när, och vad servern såg i körspåren.
// Bara läsning — en avvikelse kan aldrig ändras eller tas bort.

import { useEffect, useState } from 'react';
import Ark from '@/components/design/Ark';
import { AVSTAND, FARG, RADIE, TYP } from '@/lib/design/tokens';
import { supabase } from '@/lib/supabase';
import { AVVIKELSE_NAMN, arAvvikelseTyp, avvikelseTid, korsparMening } from '@/lib/avvikelse';
import { avvikelseFotoUrl, lokaltAvvikelseFoto } from '@/lib/avvikelseKo';
import type { AvvikelseVisad } from '@/lib/hooks/useAvvikelser';

export function AvvikelseKort({ avvikelse, onStang, maskinNamn }: { avvikelse: AvvikelseVisad; onStang: () => void; maskinNamn: (id: string) => string | null }) {
  const { rad, vantar } = avvikelse;
  const [url, setUrl] = useState<string | null>(null);
  const [fotoFel, setFotoFel] = useState(false);
  const [fotograf, setFotograf] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    let lokal: string | null = null;
    (async () => {
      if (vantar) {
        const blob = await lokaltAvvikelseFoto(rad.objekt_id, rad.id).catch(() => null);
        if (blob && aktiv) { lokal = URL.createObjectURL(blob); setUrl(lokal); } else if (aktiv) setFotoFel(true);
      } else {
        const u = await avvikelseFotoUrl(rad.foto_sokvag);
        if (!aktiv) return;
        if (u) setUrl(u); else setFotoFel(true);
      }
    })();
    return () => { aktiv = false; if (lokal) URL.revokeObjectURL(lokal); };
  }, [rad.id, rad.objekt_id, rad.foto_sokvag, vantar]);

  useEffect(() => {
    if (!rad.skapad_av) return;
    let aktiv = true;
    supabase.from('medarbetare').select('namn').eq('id', rad.skapad_av).maybeSingle()
      .then(({ data }) => { if (aktiv) setFotograf((data as any)?.namn ?? null); });
    return () => { aktiv = false; };
  }, [rad.skapad_av]);

  const mening = vantar ? null : korsparMening(rad.korspar_fore, maskinNamn);
  const typNamn = arAvvikelseTyp(rad.typ) ? AVVIKELSE_NAMN[rad.typ] : 'Avvikelse';

  return (
    <Ark rubrik={typNamn} onStang={onStang} stang="Klar">
      <div data-testid="avvikelse-kort" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
        {url ? <img src={url} alt={`Foto: ${typNamn}`} style={{ display: 'block', width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: RADIE.kort }} />
          : <div style={{ ...TYP.text, color: FARG.text2 }}>{fotoFel ? 'Fotot gick inte att visa just nu.' : 'Hämtar fotot …'}</div>}
        {rad.kommentar && <div style={{ ...TYP.text, color: FARG.text, whiteSpace: 'pre-wrap' }}>{rad.kommentar}</div>}
        <div style={{ ...TYP.text, color: FARG.text2 }}>
          Tagen {avvikelseTid(rad.tagen_at)}{fotograf ? ` av ${fotograf}` : ''}
          {vantar ? ' · väntar på att skickas' : rad.skapad_at ? ` · skickad ${avvikelseTid(rad.skapad_at)}` : ''}
        </div>
        {mening && (
          <div data-testid="avvikelse-kort-korspar" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs, padding: AVSTAND.m, background: FARG.upphojt, borderRadius: RADIE.kort }}>
            {mening.map((m) => <span key={m} style={{ ...TYP.text, color: FARG.text }}>{m}</span>)}
            <span style={{ ...TYP.meta, color: FARG.text2 }}>Räknat av servern ur våra maskiners körspår, 15 m runt platsen.</span>
          </div>
        )}
      </div>
    </Ark>
  );
}
