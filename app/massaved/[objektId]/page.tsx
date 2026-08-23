'use client';

// NIVÅ 2 — ett objekt.
//
// En fråga: varför är just det här objektet kort? Samma stora tal som på
// nivå 1, men för objektet. Under det vältorna, per trädslag varav rotkap
// och varav timmerdimension, och längdfördelningen längst ner.
//
// Fotnoterna bor HÄR, inte på förstaskärmen. Den som kommit hit har valt ett
// objekt och frågar varför — då är förbehållen relevanta. På nivå 1 hade de
// bara konkurrerat med frågan.

import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { medAbortRetry, arAbortFel } from '@/lib/supabaseRetry';

type Tradslag = {
  namn: string; m3fub: number; medellangd_m: number;
  rotkap_m3: number; timmerdimension_m3: number;
};
type Valta = { valta: string; m3fub: number; medellangd_m: number; tradslag: Tradslag[] };
type Klass = { klass: string; ordning: number; m3fub: number; andel: number };
type Niva2 = {
  objekt_id: string; namn: string | null; status: string; manad: string;
  mal_m: number; medellangd_m: number | null; total_m3fub: number;
  valtor: Valta[]; langdfordelning: Klass[];
  hemved_m3: number;
  massa_utan_sagbar_stock_m3: number; massa_utan_sagbar_stock_st: number;
  avkap_m3: number; avkap_st: number;
};

const nf1 = (n: number) => n.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = (n: number) => n.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = (n: number) => n.toLocaleString('sv-SE', { maximumFractionDigits: 0 });

const S = {
  page: { background: '#111110', minHeight: '100vh', paddingTop: 56, paddingBottom: 90, color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif" } as const,
  muted: { color: '#7a7a72', fontSize: 11 },
  tal: { fontFamily: "'Fraunces', serif" } as const,
  rubrik: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: '#7a7a72', marginTop: 26, marginBottom: 10 },
};

function kvalitet(m: number, mal: number) {
  if (m < 4.0) return { ord: 'Kort', farg: 'rgba(255,120,110,0.95)' };
  if (m < mal) return { ord: 'Under mål', farg: 'rgba(255,179,64,0.95)' };
  return { ord: 'Godkänt', farg: 'rgba(90,255,140,0.9)' };
}

function Innehall() {
  const params = useParams();
  const sp = useSearchParams();
  const objektId = decodeURIComponent(String(params.objektId));
  const manad = sp.get('manad') || new Date().toISOString().slice(0, 7);

  const [d, setD] = useState<Niva2 | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<{ kod: string; text: string } | null>(null);

  const hamta = useCallback(async () => {
    setLaddar(true); setFel(null);
    const { data, error } = await medAbortRetry(() => supabase.rpc('massaved_niva2', { p_objekt_id: objektId, p_manad: `${manad}-01` }));
    if (error) {
      setFel({ kod: (error as { code?: string }).code ?? (arAbortFel(error) ? 'ABORT' : 'OKÄND'),
               text: error.message ?? String(error) });
      setD(null);
    } else setD(data as Niva2);
    setLaddar(false);
  }, [objektId, manad]);

  useEffect(() => { hamta(); }, [hamta]);

  const maxAndel = Math.max(1, ...(d?.langdfordelning ?? []).map(k => k.andel));

  return (
    <div style={S.page}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <Link href={`/massaved?manad=${manad}`} style={{ ...S.muted, textDecoration: 'none' }}>‹ Alla objekt</Link>
      </div>

      {laddar && <div style={{ ...S.muted, textAlign: 'center', padding: 40 }}>Hämtar objektet…</div>}
      {!laddar && fel && (
        <div style={{ textAlign: 'center', padding: '40px 20px', lineHeight: 1.6 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Objektet kunde inte hämtas</div>
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
          <div style={{ ...S.muted, marginTop: 18, fontFamily: 'monospace', fontSize: 10, wordBreak: 'break-word' }}>
            {fel.kod} · {fel.text}
          </div>
        </div>
      )}

      {!laddar && !fel && d && d.medellangd_m == null && (
        <div style={{ ...S.muted, textAlign: 'center', padding: 40 }}>
          Ingen massaved på {d.namn} den här månaden.
        </div>
      )}

      {!laddar && !fel && d && d.medellangd_m != null && (
        <div style={{ padding: '0 16px' }}>
          <div style={{ textAlign: 'center', padding: '26px 0 20px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>{d.namn}</div>
            <div>
              <span style={{ ...S.tal, fontSize: 56, lineHeight: 1 }}>{nf2(d.medellangd_m)}</span>
              <span style={{ ...S.tal, fontSize: 22, color: '#7a7a72', marginLeft: 6 }}>m</span>
            </div>
            <div style={{ ...S.muted, marginTop: 10, lineHeight: 1.5 }}>
              <span style={{ color: kvalitet(d.medellangd_m, d.mal_m).farg, fontWeight: 600 }}>
                {kvalitet(d.medellangd_m, d.mal_m).ord}
              </span>
              {' · '}{d.status}<br />
              mål {nf1(d.mal_m)} m · {nf1(d.total_m3fub)} m³fub
            </div>
          </div>

          {/* Vältorna, och per trädslag varav rotkap / timmerdimension */}
          {d.valtor.map(v => (
            <div key={v.valta}>
              <div style={S.rubrik}>{v.valta}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Hela vältan</span>
                <span>
                  <span style={{ ...S.tal, fontSize: 17 }}>{nf2(v.medellangd_m)}</span>
                  <span style={{ ...S.muted, marginLeft: 3 }}>m · {nf1(v.m3fub)} m³</span>
                </span>
              </div>
              {v.tradslag.map(t => (
                <div key={t.namn} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 12 }}>{t.namn}</span>
                    <span>
                      <span style={{ ...S.tal, fontSize: 15 }}>{nf2(t.medellangd_m)}</span>
                      <span style={{ ...S.muted, marginLeft: 3 }}>m · {nf1(t.m3fub)} m³</span>
                    </span>
                  </div>
                  {t.rotkap_m3 > 0 && (
                    <div style={{ ...S.muted, paddingLeft: 12, marginTop: 4, lineHeight: 1.7 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>varav rotkap</span><span style={{ color: '#e8e8e4' }}>{nf1(t.rotkap_m3)} m³</span>
                      </div>
                      {t.timmerdimension_m3 > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>varav timmerdimension</span><span style={{ color: '#e8e8e4' }}>{nf1(t.timmerdimension_m3)} m³</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}

          {/* Längdfördelningen längst ner */}
          <div style={S.rubrik}>Längdfördelning</div>
          {d.langdfordelning.map(k => (
            <div key={k.klass} style={{ padding: '7px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 12 }}>{k.klass}</span>
                <span style={S.muted}>{nf1(k.m3fub)} m³ · {nf1(k.andel)} %</span>
              </div>
              <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.05)', marginTop: 5 }}>
                <div style={{ height: '100%', borderRadius: 2, width: `${(k.andel / maxAndel) * 100}%`,
                              background: 'rgba(90,255,140,0.45)' }} />
              </div>
            </div>
          ))}

          <div style={{ marginTop: 22 }}>
            <Link href={`/massaved/${encodeURIComponent(objektId)}/bitar?manad=${manad}`}
              style={{ ...S.muted, textDecoration: 'underline' }}>
              Visa bitarna talet byggdes av ›
            </Link>
          </div>

          {/* FOTNOTERNA — hör hemma här, inte på förstaskärmen. */}
          <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.07)',
                        fontSize: 11, color: '#7a7a72', lineHeight: 1.7 }}>
            {d.hemved_m3 > 0 && (
              <p style={{ margin: '0 0 8px' }}>
                Hemved {nf1(d.hemved_m3)} m³ ingår inte — den går till markägaren, aldrig till bruket.
              </p>
            )}
            {d.massa_utan_sagbar_stock_m3 > 0 && (
              <p style={{ margin: '0 0 8px' }}>
                {nf1(d.massa_utan_sagbar_stock_m3)} m³ ({nf0(d.massa_utan_sagbar_stock_st)} bitar) är korta
                bitar ur stammar som aldrig fick timmer eller kubb. De räknas inte som rotkap — utan sågbar
                stock finns inget kapbeslut att avläsa, bara ett klent träd.
              </p>
            )}
            {d.avkap_m3 > 0 && (
              <p style={{ margin: '0 0 8px' }}>
                Avkap {nf2(d.avkap_m3)} m³ ({nf0(d.avkap_st)} bitar) ligger i egna sortiment och ingår inte
                i massavedsvolymen.
              </p>
            )}
            <p style={{ margin: 0 }}>
              Rotkap är härlett ur att biten är kortare än 3,2 m, sitter först på stammen och blev massaved.
              kvalitet_kod är NULL på samtliga stockar — maskinen har inte mätt röta.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MassavedObjekt() {
  return (
    <Suspense fallback={<div style={S.page} />}>
      <Innehall />
    </Suspense>
  );
}
