'use client';

// NIVÅ 2 — ett objekt. Varför är just det här kort?
//
// BEGREPPEN, som inte får blandas ihop:
//   3 m-stock = massavedsstock kapad till 3 m för att ta bort röta. Ligger
//               INUTI massavedsvolymen och är det som drar ner medellängden.
//   Avkap     = kapposten ur prislistan, 3 dm eller 6 dm, eget sortiment
//               (Energi: Avkap*). Ligger UTANFÖR massavedsvolymen.
// Avkap är en post i prislistan. 3 m-stock är ett kapbeslut i skogen.
// De är olika saker och får aldrig läggas ihop.
//
// Fotnoterna ligger i "Så räknas talet", default stängd. Den som redan tror
// på talet ska slippa dem; den som inte gör det ska hitta dem.

import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { medAbortRetry, arAbortFel } from '@/lib/supabaseRetry';

type Tradslag = { namn: string; m3fub: number; medellangd_m: number; timmerdimension_m3: number };
type Valta = { valta: string; m3fub: number; medellangd_m: number; antal_tradslag: number; tradslag: Tradslag[] };
type Klass = { klass: string; ordning: number; niva: 'tre_m' | 'under_mal' | 'over_mal'; m3fub: number; st: number; andel: number };
type Niva2 = {
  objekt_id: string; namn: string | null; status: string; manad: string;
  mal_m: number; medellangd_m: number | null; total_m3fub: number;
  tre_m_stock: { m3fub: number; st: number; andel: number | null; medellangd_utan_m3: number | null };
  avkap: { st: number; m3fub: number; delar: { kap: string; st: number; m3fub: number }[] };
  valtor: Valta[]; langdfordelning: Klass[];
  hemved_m3: number;
  massa_utan_sagbar_stock_m3: number; massa_utan_sagbar_stock_st: number;
};

const MANADER = ['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'];
const nf1 = (n: number) => n.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = (n: number) => n.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = (n: number) => n.toLocaleString('sv-SE', { maximumFractionDigits: 0 });
const manadEtikett = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${MANADER[m - 1]} ${y}`; };

const S = {
  page: { background: '#111110', minHeight: '100vh', paddingTop: 56, paddingBottom: 90, color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif" } as const,
  muted: { color: '#7a7a72', fontSize: 11 },
  tal: { fontFamily: "'Fraunces', serif" } as const,
  rubrik: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: '#7a7a72', marginTop: 26, marginBottom: 10 },
};

const GUL = 'rgba(255,179,64,0.95)';
const GRON = 'rgba(90,255,140,0.9)';
const ROD = 'rgba(255,120,110,0.95)';

function kvalitet(m: number, mal: number) {
  if (m < 4.0) return { ord: 'Kort', farg: ROD };
  if (m < mal) return { ord: 'Under mål', farg: GUL };
  return { ord: 'Godkänt', farg: GRON };
}
/** Färgen förstärker klassens namn, den bär det aldrig ensam. */
const klassFarg = (n: Klass['niva']) =>
  n === 'tre_m' ? GUL : n === 'over_mal' ? 'rgba(90,255,140,0.55)' : 'rgba(255,255,255,0.14)';

function Innehall() {
  const params = useParams();
  const sp = useSearchParams();
  const objektId = decodeURIComponent(String(params.objektId));
  const manad = sp.get('manad') || new Date().toISOString().slice(0, 7);

  const [d, setD] = useState<Niva2 | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<{ kod: string; text: string } | null>(null);
  const [visaRakning, setVisaRakning] = useState(false);

  const hamta = useCallback(async () => {
    setLaddar(true); setFel(null);
    const { data, error } = await medAbortRetry(() =>
      supabase.rpc('massaved_niva2', { p_objekt_id: objektId, p_manad: `${manad}-01` }));
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
      {/* 1. Sidhuvud: objektnamnet, inte objekt-id. Månaden till höger. */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)',
                    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ minWidth: 0 }}>
          <Link href={`/massaved?manad=${manad}`} style={{ ...S.muted, textDecoration: 'none' }}>‹ Alla objekt</Link>
          {d?.namn && (
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 3, whiteSpace: 'nowrap',
                          overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.namn}</div>
          )}
        </span>
        <span style={{ ...S.muted, flexShrink: 0 }}>{manadEtikett(manad)}</span>
      </div>

      {laddar && <div style={{ ...S.muted, textAlign: 'center', padding: 40 }}>Hämtar objektet…</div>}

      {!laddar && fel && (
        <div style={{ textAlign: 'center', padding: '40px 20px', lineHeight: 1.6 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Objektet kunde inte hämtas</div>
          <div style={{ ...S.muted, marginBottom: 16 }}>
            {fel.kod === 'ABORT' ? 'Anropet avbröts. Tryck Försök igen.'
              : 'Tryck Försök igen. Står felet kvar: logga ut och in, och skicka koden nedan.'}
          </div>
          <button onClick={hamta}
            style={{ border: 'none', borderRadius: 8, padding: '12px 22px', minHeight: 44,
                     fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                     background: 'rgba(90,255,140,0.15)', color: GRON }}>Försök igen</button>
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
          {/* 2. Stora talet, statusord, mål + volym + status */}
          <div style={{ textAlign: 'center', padding: '26px 0 20px' }}>
            <div>
              <span style={{ ...S.tal, fontSize: 56, lineHeight: 1 }}>{nf2(d.medellangd_m)}</span>
              <span style={{ ...S.tal, fontSize: 22, color: '#7a7a72', marginLeft: 6 }}>m</span>
            </div>
            <div style={{ ...S.muted, marginTop: 10, lineHeight: 1.5 }}>
              <span style={{ color: kvalitet(d.medellangd_m, d.mal_m).farg, fontWeight: 600 }}>
                {kvalitet(d.medellangd_m, d.mal_m).ord}
              </span><br />
              mål {nf1(d.mal_m)} m · {nf1(d.total_m3fub)} m³fub · {d.status}
            </div>
          </div>

          {/* 3. 3 m-stockar — det som drar ner talet */}
          {d.tre_m_stock.st > 0 && (
            <>
              <div style={S.rubrik}>3 m-stockar</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span>
                  <span style={{ ...S.tal, fontSize: 28, color: GUL }}>{nf1(d.tre_m_stock.andel ?? 0)}</span>
                  <span style={{ ...S.muted, marginLeft: 3 }}>%</span>
                </span>
                <span style={S.muted}>{nf0(d.tre_m_stock.st)} st · {nf1(d.tre_m_stock.m3fub)} m³fub</span>
              </div>
              <p style={{ ...S.muted, marginTop: 8, lineHeight: 1.6 }}>
                Massavedsstockar kapade till 3 m för att ta bort röta. De ligger i massavedsvolymen
                och drar ner medellängden
                {d.tre_m_stock.medellangd_utan_m3 != null && (
                  <> — utan dem är snittet {nf2(d.tre_m_stock.medellangd_utan_m3)} m</>
                )}.
              </p>
            </>
          )}

          {/* 4. Avkap — eget sortiment, utanför massavedsvolymen */}
          {d.avkap.st > 0 && (
            <>
              <div style={S.rubrik}>Avkap</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{nf0(d.avkap.st)} st</span>
                <span style={S.muted}>{nf2(d.avkap.m3fub)} m³fub</span>
              </div>
              {d.avkap.delar.map(del => (
                <div key={del.kap} style={{ display: 'flex', justifyContent: 'space-between',
                                            paddingLeft: 12, marginTop: 4, ...S.muted }}>
                  <span>{del.kap}</span>
                  <span><span style={{ color: '#e8e8e4' }}>{nf0(del.st)}</span> st · {nf2(del.m3fub)} m³</span>
                </div>
              ))}
            </>
          )}

          {/* 5. Trädslag. "Hela vältan" bara när det finns mer än ett trädslag
                 att summera — annars är det samma siffra två gånger. */}
          {d.valtor.map(v => (
            <div key={v.valta}>
              <div style={S.rubrik}>{v.valta}</div>
              {v.antal_tradslag > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                              paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Hela vältan</span>
                  <span>
                    <span style={{ ...S.tal, fontSize: 17 }}>{nf2(v.medellangd_m)}</span>
                    <span style={{ ...S.muted, marginLeft: 3 }}>m · {nf1(v.m3fub)} m³</span>
                  </span>
                </div>
              )}
              {v.tradslag.map(t => (
                <div key={t.namn} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 12 }}>{t.namn}</span>
                    <span>
                      <span style={{ ...S.tal, fontSize: 15 }}>{nf2(t.medellangd_m)}</span>
                      <span style={{ ...S.muted, marginLeft: 3 }}>m · {nf1(t.m3fub)} m³</span>
                    </span>
                  </div>
                  {t.timmerdimension_m3 > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between',
                                  paddingLeft: 12, marginTop: 4, ...S.muted }}>
                      <span>varav timmerdimension</span>
                      <span><span style={{ color: '#e8e8e4' }}>{nf1(t.timmerdimension_m3)}</span> m³</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}

          {/* 6. Längdfördelning. Gränsen går vid 4,60 så färgen betyder exakt
                 det målet säger. */}
          <div style={S.rubrik}>Längdfördelning</div>
          {d.langdfordelning.map(k => (
            <div key={k.klass} style={{ padding: '7px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, color: k.niva === 'tre_m' ? GUL : '#e8e8e4' }}>{k.klass}</span>
                <span style={S.muted}>{nf1(k.m3fub)} m³ · {nf1(k.andel)} %</span>
              </div>
              <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.05)', marginTop: 5 }}>
                <div style={{ height: '100%', borderRadius: 2, width: `${(k.andel / maxAndel) * 100}%`,
                              background: klassFarg(k.niva) }} />
              </div>
            </div>
          ))}

          {/* 7. Länk till bitarna */}
          <div style={{ marginTop: 22 }}>
            <Link href={`/massaved/${encodeURIComponent(objektId)}/bitar?manad=${manad}`}
              style={{ ...S.muted, textDecoration: 'underline' }}>
              Visa bitarna talet byggdes av ›
            </Link>
          </div>

          {/* 8. Så räknas talet — ihopfälld, default stängd */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <button onClick={() => setVisaRakning(v => !v)}
              style={{ border: 'none', background: 'none', padding: '10px 0', minHeight: 44,
                       fontFamily: 'inherit', fontSize: 11, color: '#7a7a72', cursor: 'pointer' }}>
              Så räknas talet {visaRakning ? '⌄' : '›'}
            </button>
            {visaRakning && (
              <div style={{ fontSize: 11, color: '#7a7a72', lineHeight: 1.7, paddingBottom: 8 }}>
                <p style={{ margin: '0 0 8px' }}>
                  Medellängden är volymvägd: summan av längd gånger volym delat med volymen.
                  Aldrig ett snitt av stockarnas längder — bruket och åkeriet betalar per volym,
                  inte per stock.
                </p>
                {d.hemved_m3 > 0 && (
                  <p style={{ margin: '0 0 8px' }}>
                    Hemved {nf1(d.hemved_m3)} m³ ingår inte — den går till markägaren, aldrig till bruket.
                  </p>
                )}
                {d.avkap.st > 0 && (
                  <p style={{ margin: '0 0 8px' }}>
                    Avkap är ett eget sortiment och ligger utanför massavedsvolymen. Det påverkar
                    alltså inte medellängden.
                  </p>
                )}
                {d.massa_utan_sagbar_stock_m3 > 0 && (
                  <p style={{ margin: '0 0 8px' }}>
                    {nf1(d.massa_utan_sagbar_stock_m3)} m³ ({nf0(d.massa_utan_sagbar_stock_st)} bitar) är
                    korta bitar ur stammar som aldrig fick timmer eller kubb. De räknas inte som
                    3 m-stockar — utan sågbar stock finns inget kapbeslut att avläsa, bara ett klent träd.
                  </p>
                )}
                <p style={{ margin: 0 }}>
                  En 3 m-stock är härledd ur att biten är kortare än 3,2 m, sitter först på stammen
                  och blev massaved. kvalitet_kod är NULL på samtliga stockar — maskinen har inte
                  mätt röta.
                </p>
              </div>
            )}
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
