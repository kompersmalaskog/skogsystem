'use client';

// NIVÅ 1 — massavedens längd, objektlista.
//
// En fråga: vilka objekt är korta? Inget annat får konkurrera om utrymmet.
// Inga fotnoter här — de hör till nivå 2, där man redan valt ett objekt och
// frågar varför.
//
// Månaden följer MED i länken. Nivå 2 kan visa både månaden och hela
// objektet, och den ska öppna på samma tal som raden man tryckte på —
// annars uppstår en tankelucka: listan säger 4,07 och objektskärmen 3,97
// för samma trakt, utan att något förklarar skillnaden.
//
// Maskinen är en grå ETIKETT på raden, aldrig ett filter. Vem som körde är
// bakgrund till svaret, inte en fråga läsaren ska besvara först.
//
// Objekt utan bolag räknas INTE in i rubriktalet men göms inte heller. De
// ligger sist som egna grå rader. Marie Krokshult vindf har bolag NULL.

import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { medAbortRetry, arAbortFel } from '@/lib/supabaseRetry';

type ObjektRad = {
  objekt_id: string; namn: string | null; status: string;
  medellangd_m: number; m3fub: number; maskiner: string | null;
};
type Niva1 = {
  manad: string; valta: string; mal_m: number;
  medellangd_m: number | null; total_m3fub: number;
  antal_objekt: number; antal_under_mal: number;
  objekt: ObjektRad[]; utan_bolag: ObjektRad[];
};

const VALTOR = ['Barr', 'Björk'] as const;
const MANADER = ['januari','februari','mars','april','maj','juni',
                 'juli','augusti','september','oktober','november','december'];

const nf1 = (n: number) => n.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = (n: number) => n.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function manadEtikett(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return `${MANADER[m - 1]} ${y}`;
}
function stega(ym: string, steg: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + steg, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function nuManad() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Färgen förstärker ordet — den bär det aldrig ensam. Förarna sitter i
 *  solljus där rött blir brunt. */
function kvalitet(m: number, mal: number) {
  if (m < 4.0) return { ord: 'Kort', farg: 'rgba(255,120,110,0.95)' };
  if (m < mal) return { ord: 'Under mål', farg: 'rgba(255,179,64,0.95)' };
  return { ord: 'Godkänt', farg: 'rgba(90,255,140,0.9)' };
}

const s = {
  page: { background: '#111110', minHeight: '100vh', paddingTop: 56, paddingBottom: 90, color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif" } as const,
  muted: { color: '#7a7a72', fontSize: 11 },
  tal: { fontFamily: "'Fraunces', serif" } as const,
};

function Innehall() {
  const sp = useSearchParams();
  const [manad, setManad] = useState(sp.get('manad') || nuManad());
  const [valta, setValta] = useState<typeof VALTOR[number]>('Barr');
  const [data, setData] = useState<Niva1 | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<{ kod: string; text: string } | null>(null);

  const hamta = useCallback(async () => {
    setLaddar(true); setFel(null);
    // medAbortRetry: supabase-js auth-lås kan avbryta anropet transient.
    // Utan omförsöket blev en låskollision en död vy.
    const { data, error } = await medAbortRetry(() =>
      supabase.rpc('massaved_niva1', { p_manad: `${manad}-01`, p_valta: valta }));
    // Ett fel får aldrig se ut som noll längd — och felet ska BEHÅLLAS.
    // Att bara sätta en boolean gjorde vyn omöjlig att felsöka: ingen kunde
    // säga vad servern faktiskt svarade.
    if (error) {
      setFel({ kod: (error as { code?: string }).code ?? (arAbortFel(error) ? 'ABORT' : 'OKÄND'),
               text: error.message ?? String(error) });
      setData(null);
    } else setData(data as Niva1);
    setLaddar(false);
  }, [manad, valta]);

  useEffect(() => { hamta(); }, [hamta]);

  const rad = (o: ObjektRad, gra: boolean) => {
    const kv = kvalitet(o.medellangd_m, data?.mal_m ?? 4.6);
    return (
      <Link key={o.objekt_id} href={`/massaved/${encodeURIComponent(o.objekt_id)}?manad=${manad}`}
        style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '11px 0',
                 borderTop: '1px solid rgba(255,255,255,0.07)', textDecoration: 'none',
                 color: gra ? '#7a7a72' : '#e8e8e4' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                       background: gra ? '#4a4a46' : kv.farg }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {o.namn}
          </div>
          <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 2 }}>
            {gra ? 'saknar bolag' : kv.ord} · {o.status}
            {o.maskiner && <> · {o.maskiner}</>}
          </div>
        </span>
        <span style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ ...s.tal, fontSize: 17 }}>{nf2(o.medellangd_m)}<span style={{ ...s.muted, marginLeft: 3 }}>m</span></div>
          <div style={s.muted}>{nf1(o.m3fub)} m³</div>
        </span>
      </Link>
    );
  };

  return (
    <div style={s.page}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 10 }}>
          <button aria-label="Föregående månad" onClick={() => setManad(m => stega(m, -1))}
            style={{ border: 'none', background: 'none', color: '#e8e8e4', fontSize: 20, cursor: 'pointer', padding: '10px 16px', minWidth: 44, minHeight: 44, lineHeight: 1 }}>‹</button>
          <span style={{ fontSize: 14, fontWeight: 600, minWidth: 150, textAlign: 'center' }}>{manadEtikett(manad)}</span>
          <button aria-label="Nästa månad" disabled={manad >= nuManad()} onClick={() => setManad(m => stega(m, 1))}
            style={{ border: 'none', background: 'none', color: manad >= nuManad() ? '#3a3a38' : '#e8e8e4', fontSize: 20, cursor: manad >= nuManad() ? 'default' : 'pointer', padding: '10px 16px', minWidth: 44, minHeight: 44, lineHeight: 1 }}>›</button>
        </div>
        {/* Välta — barr och björk lastas separat och slås aldrig ihop. */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          {VALTOR.map(v => (
            <button key={v} onClick={() => setValta(v)}
              style={{ border: 'none', borderRadius: 999, padding: '10px 18px', minHeight: 44,
                       fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                       background: valta === v ? 'rgba(90,255,140,0.15)' : 'rgba(255,255,255,0.05)',
                       color: valta === v ? 'rgba(90,255,140,0.9)' : '#7a7a72' }}>{v}</button>
          ))}
        </div>
      </div>

      {laddar && <div style={{ ...s.muted, textAlign: 'center', padding: 40 }}>Hämtar {manadEtikett(manad)}…</div>}

      {!laddar && fel && (
        <div style={{ textAlign: 'center', padding: '40px 20px', lineHeight: 1.6 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Längderna kunde inte hämtas</div>
          {/* Felmeddelandet ska säga vad användaren ska GÖRA. */}
          <div style={{ ...s.muted, marginBottom: 16 }}>
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
          <div style={{ ...s.muted, marginTop: 18, fontFamily: 'monospace', fontSize: 10, wordBreak: 'break-word' }}>
            {fel.kod} · {fel.text}
          </div>
        </div>
      )}

      {!laddar && !fel && data && data.medellangd_m == null && data.utan_bolag.length === 0 && (
        <div style={{ ...s.muted, textAlign: 'center', padding: 40 }}>
          Ingen {valta.toLowerCase()}massaved i {manadEtikett(manad)}.
        </div>
      )}

      {!laddar && !fel && data && (data.medellangd_m != null || data.utan_bolag.length > 0) && (
        <div style={{ padding: '0 16px' }}>
          {data.medellangd_m != null && (
            <div style={{ textAlign: 'center', padding: '30px 0 22px' }}>
              <div>
                <span style={{ ...s.tal, fontSize: 56, lineHeight: 1 }}>{nf2(data.medellangd_m)}</span>
                <span style={{ ...s.tal, fontSize: 22, color: '#7a7a72', marginLeft: 6 }}>m</span>
              </div>
              <div style={{ ...s.muted, marginTop: 10, lineHeight: 1.5 }}>
                mål {nf1(data.mal_m)} m<br />
                {data.antal_under_mal} av {data.antal_objekt} objekt under mål
              </div>
            </div>
          )}

          {data.objekt.map(o => rad(o, false))}

          {data.utan_bolag.length > 0 && (
            <>
              <div style={{ ...s.muted, marginTop: 24, marginBottom: 4 }}>
                Räknas inte in i talet ovan
              </div>
              {data.utan_bolag.map(o => rad(o, true))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Massaved() {
  return (
    <Suspense fallback={<div style={s.page} />}>
      <Innehall />
    </Suspense>
  );
}
