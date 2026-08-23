'use client';

// Sortimentsutfall per månad — avsedd att VISAS FÖR köparen, inte att ge
// köparen inloggning till.
//
// Innehållet är kurerat för Vidas ögon (inga kronor, inga interna flaggor,
// inga markägaruppgifter) men sidan är inte åtkomstbegränsad. Alla tabeller
// bakom den har select-policy med qual = true för authenticated — permissivt,
// inte bolagsscopat. Varje inloggad användare läser alla bolag, och p_bolag
// är ett filter, inte en gräns. Säker som rapport, inte som inloggad vy.
//
// DATAKÄLLA: RPC sortimentsutfall_manad, som läser vy_skordarmatt_stock
// (detalj_stock joinad mot detalj_stam). ALDRIG fakt_sortiment — den
// upsertas med merge-duplicates och en kapad HPR-export skriver ner en redan
// komplett dag. Se 20260822_vy_skordarmatt_stock.sql.
//
// Aggregeringen sker i databasen. detalj_stock är 3,08 M rader; att hämta
// hem den till klienten är inte ett alternativ.
//
// VISAS INTE HÄR, med avsikt: kronor och kr/m³ (dim_sortiment_pris är vår
// kalkylgrund, inte köparens), interna datakvalitetsflaggor, dubblett-
// varningar, väntetidsräknare, medelstam, areal och m³/ha. Inte heller
// markägarnas namn eller kontaktuppgifter — de fanns i den tidigare
// versionen av den här vyn och hör inte hemma hos en köpare.

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

type Grupp = { namn: string; volym: number; andel: number };
type Klass = { klass: string; ordning: number; volym: number };
type Industri = { namn: string; volym: number; andel: number; klasser: Klass[] };
type ObjektRad = {
  nyckel: string; namn: string | null; vo_nummer: string | null;
  volym: number; status: string; status_datum: string | null; saknar_atgard: boolean;
};
type Utfall = {
  manad: string; atgard: string; bolag: string;
  total_volym: number; antal_objekt: number; stammar_i_urval: number;
  grupper: Grupp[];
  sagbart: { volym: number; andel: number; industrier: Industri[] };
  objekt: ObjektRad[];
  volym_per_atgard: { namn: string; volym: number }[];
};

// Drill-down bakom massaraden. Möter ingen på förstavyn — massabruket hörde
// av sig om att veden är för kort, och det här är svaret på den frågan.
type MassaTradslag = {
  namn: string; volym: number; dm: number;
  tre_m_volym: number; tre_m_andel: number; rotkap_volym: number;
};
type Massaved = {
  manad: string; total_volym: number; medellangd_dm: number | null; hemved_volym: number;
  gran: { volym: number; tre_m: number; rotkap: number; timmermatt: number } | null;
  tradslag: MassaTradslag[];
  dolda_tradslag: number;
};

const ATGARDER = ['Slutavverkning', 'Gallring', 'Grot', 'Allt'] as const;
type Atgard = typeof ATGARDER[number];

const MANADER = ['januari', 'februari', 'mars', 'april', 'maj', 'juni',
                 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

/** Grupper under denna andel visas utan stapel och dämpat. */
const SMAGRANS_PCT = 2;

const nf = (n: number) => n.toLocaleString('sv-SE', { maximumFractionDigits: 0 });
const nf1 = (n: number) => n.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function manadEtikett(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return `${MANADER[m - 1]} ${y}`;
}
function stegaManad(ym: string, steg: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + steg, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function nuvarandeManad() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Sortimentsutfall() {
  const [manad, setManad] = useState(nuvarandeManad);
  const [atgard, setAtgard] = useState<Atgard>('Slutavverkning');
  const [data, setData] = useState<Utfall | null>(null);
  const [granser, setGranser] = useState<{ fran: string; till: string } | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);

  // Bakre gräns = min(detalj_stam.tidpunkt) över hela tabellen, oavsett bolag.
  // Det är den enda punkt där datan verkligen tar slut.
  useEffect(() => {
    supabase.rpc('sortimentsutfall_granser').then(({ data, error }) => {
      if (!error && data) setGranser(data as { fran: string; till: string });
    });
  }, []);

  const hamta = useCallback(async () => {
    setLaddar(true);
    setFel(null);
    const { data, error } = await supabase.rpc('sortimentsutfall_manad', {
      p_manad: `${manad}-01`, p_atgard: atgard, p_bolag: 'Vida',
    });
    // Tomt får aldrig betyda två saker: ett fel är ett fel, inte noll m³.
    if (error) { setFel(error.message); setData(null); }
    else setData(data as Utfall);
    setLaddar(false);
  }, [manad, atgard]);

  useEffect(() => { hamta(); }, [hamta]);

  // Massavedens längder — hämtas först när raden öppnas, och om på nytt när
  // månad eller åtgärd ändras medan den är öppen.
  const [massaOppen, setMassaOppen] = useState(false);
  const [massa, setMassa] = useState<Massaved | null>(null);
  const [massaLaddar, setMassaLaddar] = useState(false);
  const [massaFel, setMassaFel] = useState(false);

  useEffect(() => {
    if (!massaOppen) return;
    let avbruten = false;
    setMassaLaddar(true);
    setMassaFel(false);
    supabase
      .rpc('massaved_langder', { p_manad: `${manad}-01`, p_atgard: atgard, p_bolag: 'Vida' })
      .then(({ data, error }) => {
        if (avbruten) return;
        // Ett fel får inte se ut som noll längd.
        if (error) { setMassaFel(true); setMassa(null); }
        else setMassa(data as Massaved);
        setMassaLaddar(false);
      });
    return () => { avbruten = true; };
  }, [massaOppen, manad, atgard]);

  const kanBakat = !granser || manad > granser.fran;
  const kanFramat = manad < nuvarandeManad();

  const s = {
    page: { background: '#111110', minHeight: '100vh', paddingTop: 56, paddingBottom: 90, color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif" } as const,
    filterBar: { padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' } as const,
    manadRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 10 } as const,
    arrow: { border: 'none', background: 'none', color: '#e8e8e4', fontSize: 20, cursor: 'pointer', padding: '10px 16px', minWidth: 44, minHeight: 44, lineHeight: 1 } as const,
    arrowAv: { color: '#3a3a38', cursor: 'default' } as const,
    manadLabel: { fontSize: 14, fontWeight: 600, minWidth: 150, textAlign: 'center' as const },
    chips: { display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' as const },
    chip: { border: 'none', borderRadius: 8, padding: '10px 16px', minHeight: 44, fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' } as const,
    chipAv: { background: 'rgba(255,255,255,0.05)', color: '#7a7a72' } as const,
    chipPa: { background: 'rgba(90,255,140,0.15)', color: 'rgba(90,255,140,0.9)' } as const,
    body: { padding: '0 16px' } as const,
    hero: { padding: '28px 0 20px', textAlign: 'center' as const },
    heroVal: { fontFamily: "'Fraunces', serif", fontSize: 56, lineHeight: 1 } as const,
    heroEnhet: { fontFamily: "'Fraunces', serif", fontSize: 22, color: '#7a7a72', marginLeft: 6 } as const,
    heroUnder: { fontSize: 12, color: '#7a7a72', marginTop: 10, lineHeight: 1.5 } as const,
    sectionTitle: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: '#7a7a72', marginBottom: 10, marginTop: 24 },
    card: { background: '#1a1a18', borderRadius: 14, padding: 16, marginBottom: 10 } as const,
    rad: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 } as const,
    prog: { height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' as const, marginTop: 8 },
    progFill: { height: '100%', borderRadius: 2, background: 'rgba(90,255,140,0.5)' },
    tal: { fontFamily: "'Fraunces', serif", fontSize: 20 } as const,
    muted: { color: '#7a7a72', fontSize: 11 },
    tomt: { background: '#1a1a18', borderRadius: 14, padding: '32px 20px', textAlign: 'center' as const, marginTop: 24 },
    tomtRubrik: { fontSize: 14, fontWeight: 600, marginBottom: 8 } as const,
    tomtText: { fontSize: 12, color: '#7a7a72', lineHeight: 1.6 } as const,
    statusText: { fontSize: 11, fontWeight: 600 } as const,
  };

  // Status får aldrig härledas ur volym — färgen förstärker bara texten.
  const statusFarg: Record<string, string> = {
    'Skotat':           'rgba(90,255,140,0.9)',
    'Skotning pågår':   'rgba(91,143,255,0.9)',
    'Avverkning pågår': 'rgba(255,179,64,0.9)',
    'Ej markerad':      '#7a7a72',
  };

  const maxKlass = useMemo(() => {
    const m: Record<string, number> = {};
    data?.sagbart.industrier.forEach(i => {
      m[i.namn] = Math.max(0, ...i.klasser.map(k => k.volym));
    });
    return m;
  }, [data]);

  const harVolym = (data?.total_volym ?? 0) > 0;

  return (
    <div style={s.page}>
      <div style={s.filterBar}>
        <div style={s.manadRow}>
          <button aria-label="Föregående månad" disabled={!kanBakat}
            style={{ ...s.arrow, ...(kanBakat ? {} : s.arrowAv) }}
            onClick={() => kanBakat && setManad(m => stegaManad(m, -1))}>‹</button>
          <span style={s.manadLabel}>{manadEtikett(manad)}</span>
          <button aria-label="Nästa månad" disabled={!kanFramat}
            style={{ ...s.arrow, ...(kanFramat ? {} : s.arrowAv) }}
            onClick={() => kanFramat && setManad(m => stegaManad(m, 1))}>›</button>
        </div>
        <div style={s.chips}>
          {ATGARDER.map(a => (
            <button key={a} style={{ ...s.chip, ...(atgard === a ? s.chipPa : s.chipAv) }}
              onClick={() => setAtgard(a)}>{a}</button>
          ))}
        </div>
      </div>

      {laddar && <div style={{ textAlign: 'center', padding: 40, color: '#7a7a72', fontSize: 12 }}>Hämtar {manadEtikett(manad)}…</div>}

      {!laddar && fel && (
        <div style={{ ...s.tomt, margin: '24px 16px 0' }}>
          <div style={s.tomtRubrik}>Utfallet kunde inte hämtas</div>
          <div style={s.tomtText}>Försök igen. Står felet kvar, hör av dig — siffrorna finns, det är hämtningen som inte gick fram.</div>
        </div>
      )}

      {!laddar && !fel && data && (
        <div style={s.body}>
          {/* ── 1. Rubriktal ─────────────────────────────────────────── */}
          {harVolym && (
            <div style={s.hero}>
              <div>
                <span style={s.heroVal}>{nf(data.total_volym)}</span>
                <span style={s.heroEnhet}>m³fub</span>
              </div>
              <div style={s.heroUnder}>
                {data.antal_objekt} objekt<br />
                skördarmätt volym under bark
              </div>
            </div>
          )}

          {/* Tomt tillstånd — skiljer "inget avverkat" från "underlag saknas" */}
          {!harVolym && (
            <div style={s.tomt}>
              {data.stammar_i_urval > 0 ? (
                <>
                  <div style={s.tomtRubrik}>Stockunderlag saknas för {manadEtikett(manad)}</div>
                  <div style={s.tomtText}>
                    {nf(data.stammar_i_urval)} stammar är avverkade den här månaden, men
                    stockdatan bakom dem gick inte att läsa. Volymen är alltså inte noll —
                    den är okänd. Underlaget kommer när stockdatan är rättad.
                  </div>
                </>
              ) : (
                <>
                  <div style={s.tomtRubrik}>Ingen volym avverkad åt Vida i {manadEtikett(manad)}</div>
                  <div style={s.tomtText}>
                    {data.volym_per_atgard.length > 0 ? (
                      <>Den här månaden finns {data.volym_per_atgard
                        .map(v => `${nf1(v.volym)} m³ ${v.namn.toLowerCase()}`).join(' och ')} — byt
                        åtgärd ovan för att se den.</>
                    ) : (
                      <>Bläddra till en annan månad.</>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {harVolym && (
            <>
              {/* ── 2. Sortimentsgrupper ─────────────────────────────── */}
              <div style={s.sectionTitle}>Sortiment</div>
              <div style={s.card}>
                {data.grupper.map((g, i) => {
                  const liten = g.andel < SMAGRANS_PCT;
                  const arMassa = g.namn === 'Massa';
                  return (
                    <div key={g.namn} style={{ marginTop: i === 0 ? 0 : 14 }}>
                      <div
                        style={{ ...s.rad, ...(arMassa ? { cursor: 'pointer', minHeight: 44, alignItems: 'center' } : {}) }}
                        onClick={arMassa ? () => setMassaOppen(o => !o) : undefined}
                        role={arMassa ? 'button' : undefined}
                        aria-expanded={arMassa ? massaOppen : undefined}
                      >
                        <span style={{ fontSize: 13, fontWeight: 600, color: liten ? '#7a7a72' : '#e8e8e4' }}>
                          {g.namn}
                          {arMassa && (
                            <span style={{ ...s.muted, marginLeft: 8 }}>
                              {massaOppen ? 'dölj längder ▾' : 'längder ▸'}
                            </span>
                          )}
                        </span>
                        <span style={{ textAlign: 'right' }}>
                          <span style={{ ...s.tal, fontSize: liten ? 14 : 20, color: liten ? '#7a7a72' : '#e8e8e4' }}>{nf1(g.volym)}</span>
                          <span style={{ ...s.muted, marginLeft: 6 }}>m³ · {g.andel}%</span>
                        </span>
                      </div>
                      {!liten && (
                        <div style={s.prog}><div style={{ ...s.progFill, width: `${g.andel}%` }} /></div>
                      )}

                      {/* ── Massavedens längder ────────────────────────── */}
                      {arMassa && massaOppen && (
                        <div style={{ background: '#111110', borderRadius: 10, padding: 16, marginTop: 12 }}>
                          {massaLaddar && <div style={{ ...s.muted, textAlign: 'center', padding: 12 }}>Hämtar längder…</div>}

                          {!massaLaddar && massaFel && (
                            <div style={{ ...s.muted, textAlign: 'center', padding: 12 }}>
                              Längderna kunde inte hämtas. Volymen ovan står kvar — det är hämtningen som inte gick fram.
                            </div>
                          )}

                          {!massaLaddar && !massaFel && massa && massa.medellangd_dm === null && (
                            <div style={{ ...s.muted, textAlign: 'center', padding: 12 }}>
                              Ingen massaved den här månaden.
                            </div>
                          )}

                          {!massaLaddar && !massaFel && massa && massa.medellangd_dm !== null && (
                            <>
                              {/* Rubriktal — volymvägt, aldrig snitt per stock */}
                              <div style={{ textAlign: 'center', padding: '4px 0 18px' }}>
                                <div>
                                  <span style={{ fontFamily: "'Fraunces', serif", fontSize: 40, lineHeight: 1 }}>
                                    {nf1(massa.medellangd_dm)}
                                  </span>
                                  <span style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: '#7a7a72', marginLeft: 5 }}>dm</span>
                                </div>
                                <div style={{ ...s.muted, marginTop: 8, lineHeight: 1.5 }}>
                                  volymvägd medellängd<br />
                                  {nf1(massa.total_volym)} m³ massaved
                                  {massa.hemved_volym > 0 && ` · hemved ${nf1(massa.hemved_volym)} m³ ej medräknad`}
                                </div>
                              </div>

                              {/* Kedjan — gäller granen, och rubriken säger det */}
                              {massa.gran && massa.gran.volym > 0 && (
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 14 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Granmassaved</div>
                                  {[
                                    { etikett: 'Totalt',                        v: massa.gran.volym,      niva: 0 },
                                    { etikett: 'varav kapat i 3 meter',         v: massa.gran.tre_m,      niva: 1 },
                                    { etikett: 'varav rotkap',                  v: massa.gran.rotkap,     niva: 2 },
                                    { etikett: 'varav toppdiameter 18 cm eller grövre', v: massa.gran.timmermatt, niva: 3 },
                                  ].map(r => (
                                    <div key={r.etikett} style={{
                                      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                                      padding: '6px 0', paddingLeft: r.niva * 12,
                                      color: r.niva === 0 ? '#e8e8e4' : '#7a7a72',
                                    }}>
                                      <span style={{ fontSize: 12 }}>{r.etikett}</span>
                                      <span>
                                        <span style={{ fontFamily: "'Fraunces', serif", fontSize: r.niva === 0 ? 18 : 15, color: '#e8e8e4' }}>
                                          {nf(r.v)}
                                        </span>
                                        <span style={{ ...s.muted, marginLeft: 5 }}>m³</span>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Per trädslag */}
                              <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 14, paddingTop: 14 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Per trädslag</div>
                                {massa.tradslag.map(t => (
                                  <div key={t.namn} style={{ padding: '7px 0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                      <span style={{ fontSize: 12 }}>{t.namn}</span>
                                      <span>
                                        <span style={{ fontFamily: "'Fraunces', serif", fontSize: 17 }}>{nf1(t.dm)}</span>
                                        <span style={{ ...s.muted, marginLeft: 5 }}>dm</span>
                                      </span>
                                    </div>
                                    <div style={{ ...s.muted, marginTop: 2 }}>
                                      {nf(t.volym)} m³ · {nf1(t.tre_m_andel)} % kapat i 3 meter
                                      {t.tre_m_volym > 0 && ` (${nf(t.tre_m_volym)} m³)`}
                                    </div>
                                  </div>
                                ))}
                                {massa.dolda_tradslag > 0 && (
                                  <div style={{ ...s.muted, marginTop: 8 }}>
                                    {massa.dolda_tradslag} trädslag under 1 m³ visas inte.
                                  </div>
                                )}
                              </div>

                              {/* Fotnoten — måste stå, och får aldrig påstå mätt röta */}
                              <div style={{
                                borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 14, paddingTop: 12,
                                fontSize: 11, color: '#7a7a72', lineHeight: 1.6,
                              }}>
                                &quot;Rotkap&quot; är härlett ur att biten är 3 meter, sitter först på stammen och
                                blev massaved. Filen innehåller ingen rötkod — maskinen har inte mätt röta.
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── 3. Sågbart ───────────────────────────────────────── */}
              <div style={s.sectionTitle}>Sågbart — timmer och kubb</div>
              <div style={s.card}>
                <div style={s.rad}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Till sågverk</span>
                  <span style={{ textAlign: 'right' }}>
                    <span style={s.tal}>{nf1(data.sagbart.volym)}</span>
                    <span style={{ ...s.muted, marginLeft: 6 }}>m³ · {data.sagbart.andel}% av volymen</span>
                  </span>
                </div>
              </div>

              {data.sagbart.industrier.map(ind => (
                <div key={ind.namn} style={s.card}>
                  <div style={s.rad}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{ind.namn}</span>
                    <span style={{ textAlign: 'right' }}>
                      <span style={s.tal}>{nf1(ind.volym)}</span>
                      <span style={{ ...s.muted, marginLeft: 6 }}>m³ · {ind.andel}%</span>
                    </span>
                  </div>

                  {/* Toppdiameterklasser. Största klassen märks med både färg
                      och text — färg är aldrig ensam informationsbärare. */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 16 }}>
                    {ind.klasser.map(k => {
                      const max = maxKlass[ind.namn] || 1;
                      const storst = k.volym === max && max > 0;
                      return (
                        <div key={k.klass} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ height: 48, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                            <div style={{
                              width: '100%',
                              height: `${Math.max(2, (k.volym / max) * 48)}px`,
                              borderRadius: 3,
                              background: storst ? 'rgba(90,255,140,0.55)' : 'rgba(255,255,255,0.14)',
                            }} />
                          </div>
                          <div style={{ fontSize: 10, marginTop: 6, color: storst ? '#e8e8e4' : '#7a7a72', fontWeight: storst ? 700 : 400 }}>
                            {nf(k.volym)}
                          </div>
                          <div style={{ fontSize: 9, color: '#7a7a72', marginTop: 2 }}>{k.klass}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ ...s.muted, marginTop: 10 }}>
                    Toppdiameter under bark, cm · störst andel {ind.klasser.find(k => k.volym === maxKlass[ind.namn])?.klass ?? '—'}
                  </div>
                </div>
              ))}

              {/* ── 4. Objektlista ───────────────────────────────────── */}
              <div style={s.sectionTitle}>Objekt</div>
              {data.objekt.map(o => (
                <div key={o.nyckel} style={s.card}>
                  <div style={s.rad}>
                    <span style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{o.namn || o.nyckel}</div>
                      <div style={s.muted}>
                        {o.vo_nummer ? `VO ${o.vo_nummer}` : 'VO saknas'}
                        {o.saknar_atgard && ' · Åtgärd ej angiven'}
                      </div>
                    </span>
                    <span style={{ textAlign: 'right' }}>
                      <div style={s.tal}>{nf1(o.volym)}</div>
                      <div style={s.muted}>m³</div>
                    </span>
                  </div>
                  <div style={{ ...s.statusText, color: statusFarg[o.status] ?? '#7a7a72', marginTop: 10 }}>
                    {o.status}
                    {o.status_datum && (
                      <span style={{ color: '#7a7a72', fontWeight: 400 }}> {String(o.status_datum).slice(0, 10)}</span>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
