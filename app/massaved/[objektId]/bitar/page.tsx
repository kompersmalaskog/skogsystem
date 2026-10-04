'use client';

// NIVÅ 3 — bitarna.
//
// Finns endast för när ett tal ifrågasätts: här är raderna talet byggdes av.
// Inga aggregat, ingen tolkning, inga slutsatser. Kortast först, för det är
// den änden frågan brukar gälla.
//
// Ingen kommer hit av misstag, och ingen ska behöva det.
//
// Samma form som resten (components/Ytform.tsx): tillbakarad, välta som textkontroll ("barr ⌄") och
// raderna. Listraderna är data, inte formrader, så de ritas här — men med formens tokens.

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { medAbortRetry, arAbortFel } from '@/lib/supabaseRetry';
import { SIDA, TAL, MUTED, SEKUNDAR, GUL, LINJE, nf0, nf2, nf, Tillbakarad, Kontroll, Laddar, Fel } from '@/components/Ytform';

/** Listans text är 11 px, som den alltid varit — raderna är data och ska rymma maskinens längd på en rad. */
const LITEN = { color: SEKUNDAR, fontSize: 11 } as const;

type Bit = {
  stam: string; bit: number; langd_m: number; volym_m3fub: number;
  toppdia_mm: number | null; tradslag: string; dag: string;
  tre_m_stock: boolean; sagbar: boolean;
};
type Niva3 = { objekt_id: string; valta: string; antal_totalt: number; visas: number; bitar: Bit[] };

const VALTOR = ['Barr', 'Björk'] as const;
const nf3 = (n: number) => nf(n, 3);
const ROD = 'rgba(255,120,110,0.95)';

export default function MassavedBitar() {
  const params = useParams();
  const objektId = decodeURIComponent(String(params.objektId));

  const [valta, setValta] = useState<typeof VALTOR[number]>('Barr');
  const [d, setD] = useState<Niva3 | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<{ kod: string; text: string } | null>(null);

  const hamta = useCallback(async () => {
    setLaddar(true); setFel(null);
    const { data, error } = await medAbortRetry(() => supabase.rpc('massaved_niva3', {
      p_objekt_id: objektId, p_valta: valta, p_limit: 200 }));
    if (error) {
      setFel({ kod: (error as { code?: string }).code ?? (arAbortFel(error) ? 'ABORT' : 'OKÄND'),
               text: error.message ?? String(error) });
      setD(null);
    } else setD(data as Niva3);
    setLaddar(false);
  }, [objektId, valta]);

  useEffect(() => { hamta(); }, [hamta]);

  return (
    <div style={SIDA}>
      <Tillbakarad href={`/massaved/${encodeURIComponent(objektId)}`} text="Objektet" />
      <div style={{ padding: '0 16px', borderBottom: LINJE }}>
        <Kontroll text={valta.toLowerCase()} value={valta} onChange={v => setValta(v as typeof VALTOR[number])} label="Välta">
          {VALTOR.map(v => <option key={v} value={v}>{v}</option>)}
        </Kontroll>
      </div>

      {laddar && <Laddar vad="bitarna" />}
      {!laddar && fel && <Fel rubrik="Bitarna kunde inte hämtas" fel={fel} igen={hamta} />}

      {!laddar && !fel && d && d.antal_totalt === 0 && (
        <div style={{ ...MUTED, padding: '24px 16px' }}>
          Ingen {valta.toLowerCase()}massaved på objektet den här månaden.
        </div>
      )}

      {!laddar && !fel && d && d.antal_totalt > 0 && (
        <div style={{ padding: '0 16px' }}>
          <div style={{ ...LITEN, padding: '16px 0 10px', lineHeight: 1.6 }}>
            {nf0(d.visas)} av {nf0(d.antal_totalt)} bitar · kortast först
          </div>

          {d.bitar.map((b, i) => (
            <div key={`${b.stam}-${b.bit}-${i}`}
              style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '9px 0', borderTop: LINJE }}>
              <span style={{ ...TAL, fontSize: 15, minWidth: 54 }}>
                {nf2(b.langd_m)}<span style={{ ...LITEN, marginLeft: 2 }}>m</span>
              </span>
              <span style={{ ...LITEN, flex: 1, minWidth: 0 }}>
                {b.tradslag} · stam {b.stam} bit {b.bit} · {b.dag}
                {b.toppdia_mm != null && <> · {nf0(b.toppdia_mm)} mm</>}
                {b.tre_m_stock && <span style={{ color: GUL, fontWeight: 600 }}> · 3 m-stock</span>}
                {b.sagbar && <span style={{ color: ROD, fontWeight: 600 }}> · sågbar dimension</span>}
              </span>
              <span style={{ ...LITEN, flexShrink: 0 }}>{nf3(b.volym_m3fub)} m³</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
