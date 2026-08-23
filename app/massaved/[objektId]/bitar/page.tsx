'use client';

// NIVÅ 3 — bitarna.
//
// Finns endast för när ett tal ifrågasätts: här är raderna talet byggdes av.
// Inga aggregat, ingen tolkning, inga slutsatser. Kortast först, för det är
// den änden frågan brukar gälla.
//
// Ingen kommer hit av misstag, och ingen ska behöva det.

import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { medAbortRetry, arAbortFel } from '@/lib/supabaseRetry';

type Bit = {
  stam: string; bit: number; langd_m: number; volym_m3fub: number;
  toppdia_mm: number | null; tradslag: string; dag: string;
  rotkap: boolean; timmerdimension: boolean;
};
type Niva3 = { objekt_id: string; valta: string; antal_totalt: number; visas: number; bitar: Bit[] };

const VALTOR = ['Barr', 'Björk'] as const;
const nf2 = (n: number) => n.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf3 = (n: number) => n.toLocaleString('sv-SE', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const nf0 = (n: number) => n.toLocaleString('sv-SE', { maximumFractionDigits: 0 });

const S = {
  page: { background: '#111110', minHeight: '100vh', paddingTop: 56, paddingBottom: 90, color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif" } as const,
  muted: { color: '#7a7a72', fontSize: 11 },
  tal: { fontFamily: "'Fraunces', serif" } as const,
};

function Innehall() {
  const params = useParams();
  const sp = useSearchParams();
  const objektId = decodeURIComponent(String(params.objektId));
  const manad = sp.get('manad') || new Date().toISOString().slice(0, 7);

  const [valta, setValta] = useState<typeof VALTOR[number]>('Barr');
  const [d, setD] = useState<Niva3 | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<{ kod: string; text: string } | null>(null);

  const hamta = useCallback(async () => {
    setLaddar(true); setFel(null);
    const { data, error } = await medAbortRetry(() => supabase.rpc('massaved_niva3', {
      p_objekt_id: objektId, p_manad: `${manad}-01`, p_valta: valta, p_limit: 200 }));
    if (error) {
      setFel({ kod: (error as { code?: string }).code ?? (arAbortFel(error) ? 'ABORT' : 'OKÄND'),
               text: error.message ?? String(error) });
      setD(null);
    } else setD(data as Niva3);
    setLaddar(false);
  }, [objektId, manad, valta]);

  useEffect(() => { hamta(); }, [hamta]);

  return (
    <div style={S.page}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <Link href={`/massaved/${encodeURIComponent(objektId)}?manad=${manad}`}
          style={{ ...S.muted, textDecoration: 'none' }}>‹ Objektet</Link>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 10 }}>
          {VALTOR.map(v => (
            <button key={v} onClick={() => setValta(v)}
              style={{ border: 'none', borderRadius: 999, padding: '10px 18px', minHeight: 44,
                       fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                       background: valta === v ? 'rgba(90,255,140,0.15)' : 'rgba(255,255,255,0.05)',
                       color: valta === v ? 'rgba(90,255,140,0.9)' : '#7a7a72' }}>{v}</button>
          ))}
        </div>
      </div>

      {laddar && <div style={{ ...S.muted, textAlign: 'center', padding: 40 }}>Hämtar bitarna…</div>}
      {!laddar && fel && (
        <div style={{ textAlign: 'center', padding: '40px 20px', lineHeight: 1.6 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Bitarna kunde inte hämtas</div>
          {/* Felmeddelandet ska säga vad användaren ska GÖRA. */}
          <div style={{ ...S.muted, marginBottom: 16 }}>
            {fel.kod === 'ABORT'
              ? 'Anropet avbröts. Tryck Försök igen.'
              : 'Tryck Försök igen. Står felet kvar: logga ut och in, och skicka koden nedan.'}
          </div>
          <button onClick={hamta}
            style={{ border: 'none', borderRadius: 8, padding: '12px 22px', minHeight: 44,
                     fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                     background: 'rgba(90,255,140,0.15)', color: 'rgba(90,255,140,0.9)' }}>
            Försök igen
          </button>
          {/* Detaljen kastas inte bort — utan den går felet inte att felsöka. */}
          <div style={{ ...S.muted, marginTop: 18, fontFamily: 'monospace', fontSize: 10, wordBreak: 'break-word' }}>
            {fel.kod} · {fel.text}
          </div>
        </div>
      )}

      {!laddar && !fel && d && d.antal_totalt === 0 && (
        <div style={{ ...S.muted, textAlign: 'center', padding: 40 }}>
          Ingen {valta.toLowerCase()}massaved på objektet den här månaden.
        </div>
      )}

      {!laddar && !fel && d && d.antal_totalt > 0 && (
        <div style={{ padding: '0 16px' }}>
          <div style={{ ...S.muted, padding: '16px 0 10px', lineHeight: 1.6 }}>
            {nf0(d.visas)} av {nf0(d.antal_totalt)} bitar, kortast först.
            {d.visas < d.antal_totalt && <> Resten visas inte — listan finns för att syna ett tal, inte för att läsas igenom.</>}
          </div>

          {d.bitar.map((b, i) => (
            <div key={`${b.stam}-${b.bit}-${i}`}
              style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '9px 0',
                       borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <span style={{ ...S.tal, fontSize: 15, minWidth: 54 }}>
                {nf2(b.langd_m)}<span style={{ ...S.muted, marginLeft: 2 }}>m</span>
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: '#7a7a72' }}>
                {b.tradslag} · stam {b.stam} bit {b.bit} · {b.dag}
                {b.toppdia_mm != null && <> · {nf0(b.toppdia_mm)} mm</>}
                {b.rotkap && <span style={{ color: 'rgba(255,179,64,0.95)', fontWeight: 600 }}> · rotkap</span>}
                {b.timmerdimension && <span style={{ color: 'rgba(255,120,110,0.95)', fontWeight: 600 }}> · timmerdimension</span>}
              </span>
              <span style={{ ...S.muted, flexShrink: 0 }}>{nf3(b.volym_m3fub)} m³</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MassavedBitar() {
  return (
    <Suspense fallback={<div style={S.page} />}>
      <Innehall />
    </Suspense>
  );
}
