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
// TRE PRINCIPER STYR YTAN:
//   Ett tal.        Månadens volym står ensam, stor, med luft. Vad den bestod
//                   av och var den kom ifrån är följdfrågor och bor bakom
//                   varsitt tryck: Sortiment (med sågbart och industriernas
//                   diameterklasser en nivå till in) och Objekt.
//   Fel skriker.    ÅTGÄRD BEHÖVS överst, vad som är fel och vad man gör.
//                   Risken är inte att Vida ser rutan — risken är att de ser
//                   ett tal som är fel. 1 290 m³ med 1,4 m³ utan klassning
//                   ljuger tyst; rutan gör att det rättas före mötet.
//   Tomrum bär.     Är inget fel skriker ingenting.
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
// kalkylgrund, inte köparens), dubblett-varningar, väntetidsräknare,
// medelstam, areal och m³/ha. Inte heller markägarnas namn eller
// kontaktuppgifter — de fanns i den tidigare versionen av den här vyn och
// hör inte hemma hos en köpare.

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
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

const SEKUNDAR = '#7a7a72';
const ROD = 'rgba(255,120,110,0.95)';

type AtgardBehovs = { vad: string; gor: string };

/** Bara det som går att rätta före mötet. Allt kommer ur svaret — inget räknas här. */
function atgarderFor(data: Utfall, manad: string): AtgardBehovs[] {
  const ut: AtgardBehovs[] = [];
  const ejKlassad = data.grupper.find(g => g.namn === 'Ej klassad');
  if (ejKlassad && ejKlassad.volym > 0) ut.push({
    vad: `${nf1(ejKlassad.volym)} m³ saknar sortimentsklass. Volymen ligger i totalen men i inget sortiment.`,
    gor: 'Ett sortiment ur maskinen är inte mappat i klasslistan. Lägg till det, så hamnar volymen rätt.',
  });
  const utanAtgard = data.objekt.filter(o => o.saknar_atgard);
  if (utanAtgard.length > 0) ut.push({
    vad: `${utanAtgard.length === 1 ? 'Ett objekt' : `${utanAtgard.length} objekt`} saknar angiven åtgärd: ${utanAtgard.map(o => o.namn || o.nyckel).join(', ')}. Volymen kan ligga under fel åtgärd.`,
    gor: 'Sätt avverkningsform på objektet i Redigering.',
  });
  if (data.total_volym <= 0 && data.stammar_i_urval > 0) ut.push({
    vad: `${nf(data.stammar_i_urval)} stammar är avverkade i ${manadEtikett(manad)}, men stockdatan bakom dem gick inte att läsa. Volymen är okänd, inte noll.`,
    gor: 'Kontrollera HPR-importen för månadens filer innan siffran visas för någon.',
  });
  return ut;
}

/** En stilla rad som öppnar nästa nivå. Träffyta 48 px. */
function Nivarad({ etikett, oppen, onToggle }: { etikett: string; oppen: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} aria-expanded={oppen}
      style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
               border: 'none', borderTop: '1px solid rgba(255,255,255,0.07)', background: 'none',
               padding: '14px 0', minHeight: 48, fontFamily: 'inherit', fontSize: 13,
               color: '#e8e8e4', cursor: 'pointer', textAlign: 'left' }}>
      <span>{etikett}</span>
      <span style={{ color: SEKUNDAR, fontSize: 16 }}>{oppen ? '⌄' : '›'}</span>
    </button>
  );
}

export default function Sortimentsutfall() {
  const [manad, setManad] = useState(nuvarandeManad);
  const [atgard, setAtgard] = useState<Atgard>('Slutavverkning');
  const [data, setData] = useState<Utfall | null>(null);
  const [granser, setGranser] = useState<{ fran: string; till: string } | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);
  const [visaSortiment, setVisaSortiment] = useState(false);
  const [visaObjekt, setVisaObjekt] = useState(false);
  const [oppenIndustri, setOppenIndustri] = useState<string | null>(null);

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
    chipAv: { background: 'rgba(255,255,255,0.05)', color: SEKUNDAR } as const,
    chipPa: { background: 'rgba(90,255,140,0.15)', color: 'rgba(90,255,140,0.9)' } as const,
    body: { padding: '0 16px' } as const,
    hero: { padding: '48px 0 40px', textAlign: 'center' as const },
    heroVal: { fontFamily: "'Fraunces', serif", fontSize: 60, lineHeight: 1 } as const,
    heroEnhet: { fontFamily: "'Fraunces', serif", fontSize: 22, color: SEKUNDAR, marginLeft: 6 } as const,
    heroUnder: { fontSize: 13, color: SEKUNDAR, marginTop: 14, lineHeight: 1.5 } as const,
    sectionTitle: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: SEKUNDAR, marginBottom: 10, marginTop: 18 },
    card: { background: '#1a1a18', borderRadius: 14, padding: 16, marginBottom: 10 } as const,
    rad: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 } as const,
    prog: { height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' as const, marginTop: 8 },
    progFill: { height: '100%', borderRadius: 2, background: 'rgba(90,255,140,0.5)' },
    tal: { fontFamily: "'Fraunces', serif", fontSize: 20 } as const,
    muted: { color: SEKUNDAR, fontSize: 11 },
    tomt: { background: '#1a1a18', borderRadius: 14, padding: '32px 20px', textAlign: 'center' as const, marginTop: 24 },
    tomtRubrik: { fontSize: 14, fontWeight: 600, marginBottom: 8 } as const,
    tomtText: { fontSize: 12, color: SEKUNDAR, lineHeight: 1.6 } as const,
    statusText: { fontSize: 11, fontWeight: 600 } as const,
    alert: { marginTop: 16, padding: '14px 16px', borderRadius: 14, background: 'rgba(255,120,110,0.08)', border: '1px solid rgba(255,120,110,0.35)' } as const,
    alertRubrik: { fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' as const, color: ROD, marginBottom: 8 },
  };

  // Status får aldrig härledas ur volym — färgen förstärker bara texten.
  const statusFarg: Record<string, string> = {
    'Skotat':           'rgba(90,255,140,0.9)',
    'Skotning pågår':   'rgba(91,143,255,0.9)',
    'Avverkning pågår': 'rgba(255,179,64,0.9)',
    'Ej markerad':      SEKUNDAR,
  };

  const maxKlass = useMemo(() => {
    const m: Record<string, number> = {};
    data?.sagbart.industrier.forEach(i => {
      m[i.namn] = Math.max(0, ...i.klasser.map(k => k.volym));
    });
    return m;
  }, [data]);

  const harVolym = (data?.total_volym ?? 0) > 0;
  const atgarder = data ? atgarderFor(data, manad) : [];

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

      {laddar && <div style={{ textAlign: 'center', padding: 40, color: SEKUNDAR, fontSize: 12 }}>Hämtar {manadEtikett(manad)}…</div>}

      {!laddar && fel && (
        <div style={{ ...s.tomt, margin: '24px 16px 0' }}>
          <div style={s.tomtRubrik}>Utfallet kunde inte hämtas</div>
          <div style={s.tomtText}>Försök igen. Står felet kvar, hör av dig — siffrorna finns, det är hämtningen som inte gick fram.</div>
        </div>
      )}

      {!laddar && !fel && data && (
        <div style={s.body}>
          {/* ── Fel skriker, och säger vad. Finns inget fel finns inte rutan. ── */}
          {atgarder.length > 0 && (
            <div role="alert" style={s.alert}>
              <div style={s.alertRubrik}>Åtgärd behövs</div>
              {atgarder.map((a, i) => (
                <div key={i} style={{ marginTop: i === 0 ? 0 : 10 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.5 }}>{a.vad}</div>
                  <div style={{ fontSize: 12, color: SEKUNDAR, lineHeight: 1.5, marginTop: 3 }}>{a.gor}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Ett tal ─────────────────────────────────────────────── */}
          {harVolym && (
            <div style={s.hero}>
              <div>
                <span style={s.heroVal}>{nf(data.total_volym)}</span>
                <span style={s.heroEnhet}>m³fub</span>
              </div>
              <div style={s.heroUnder}>skördarmätt volym under bark</div>
            </div>
          )}

          {/* Ingen volym är ett tillstånd, inte ett fel. Saknat stockunderlag
              är ett fel och står i rutan ovanför. */}
          {!harVolym && data.stammar_i_urval === 0 && (
            <div style={s.tomt}>
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
            </div>
          )}

          {harVolym && (
            <>
              {/* ── Vad bestod det av — bakom ett tryck ─────────────── */}
              <Nivarad etikett="Sortiment" oppen={visaSortiment} onToggle={() => setVisaSortiment(v => !v)} />
              {visaSortiment && (
                <div style={{ paddingBottom: 12 }}>
                  <div style={{ ...s.card, marginTop: 4 }}>
                    {data.grupper.map((g, i) => {
                      const liten = g.andel < SMAGRANS_PCT;
                      const arMassa = g.namn === 'Massa';
                      return (
                        <div key={g.namn} style={{ marginTop: i === 0 ? 0 : 14 }}>
                          <div style={{ ...s.rad, ...(arMassa ? { minHeight: 44, alignItems: 'center' } : {}) }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: liten ? SEKUNDAR : '#e8e8e4' }}>
                              {g.namn}
                              {/* Längddata bor på en egen sida — massaraden här
                                  svarar på volymfrågan, inte på längdfrågan. */}
                              {arMassa && (
                                <Link href={`/massaved?manad=${manad}`}
                                  onClick={e => e.stopPropagation()}
                                  style={{ ...s.muted, marginLeft: 8, textDecoration: 'underline' }}>
                                  längder ›
                                </Link>
                              )}
                            </span>
                            <span style={{ textAlign: 'right' }}>
                              <span style={{ ...s.tal, fontSize: liten ? 14 : 20, color: liten ? SEKUNDAR : '#e8e8e4' }}>{nf1(g.volym)}</span>
                              <span style={{ ...s.muted, marginLeft: 6 }}>m³ · {nf1(g.andel)} %</span>
                            </span>
                          </div>
                          {!liten && (
                            <div style={s.prog}><div style={{ ...s.progFill, width: `${g.andel}%` }} /></div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Sågbart och industrierna: samma fråga, en nivå till in.
                      Diameterklasserna öppnas per industri. */}
                  <div style={s.sectionTitle}>Sågbart — timmer och kubb</div>
                  <div style={s.card}>
                    <div style={s.rad}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Till sågverk</span>
                      <span style={{ textAlign: 'right' }}>
                        <span style={s.tal}>{nf1(data.sagbart.volym)}</span>
                        <span style={{ ...s.muted, marginLeft: 6 }}>m³ · {nf1(data.sagbart.andel)} % av volymen</span>
                      </span>
                    </div>
                    {data.sagbart.industrier.map(ind => {
                      const oppen = oppenIndustri === ind.namn;
                      return (
                        <div key={ind.namn} style={{ marginTop: 14 }}>
                          <button onClick={() => setOppenIndustri(oppen ? null : ind.namn)} aria-expanded={oppen}
                            style={{ ...s.rad, width: '100%', border: 'none', background: 'none', padding: '4px 0',
                                     minHeight: 44, fontFamily: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
                            <span style={{ fontSize: 13 }}>{ind.namn} <span style={{ color: SEKUNDAR }}>{oppen ? '⌄' : '›'}</span></span>
                            <span style={{ textAlign: 'right' }}>
                              <span style={s.tal}>{nf1(ind.volym)}</span>
                              <span style={{ ...s.muted, marginLeft: 6 }}>m³ · {nf1(ind.andel)} %</span>
                            </span>
                          </button>
                          {oppen && (
                            <>
                              {/* Toppdiameterklasser. Största klassen märks med både färg
                                  och text — färg är aldrig ensam informationsbärare. */}
                              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 12 }}>
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
                                      <div style={{ fontSize: 10, marginTop: 6, color: storst ? '#e8e8e4' : SEKUNDAR, fontWeight: storst ? 700 : 400 }}>
                                        {nf(k.volym)}
                                      </div>
                                      <div style={{ fontSize: 9, color: SEKUNDAR, marginTop: 2 }}>{k.klass}</div>
                                    </div>
                                  );
                                })}
                              </div>
                              <div style={{ ...s.muted, marginTop: 10 }}>
                                Toppdiameter under bark, cm · störst andel {ind.klasser.find(k => k.volym === maxKlass[ind.namn])?.klass ?? '—'}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Var det kom ifrån — bakom ett tryck ─────────────── */}
              <Nivarad etikett={`${data.antal_objekt === 1 ? 'Ett objekt' : `${nf(data.antal_objekt)} objekt`}`}
                oppen={visaObjekt} onToggle={() => setVisaObjekt(v => !v)} />
              {visaObjekt && (
                <div style={{ paddingTop: 4, paddingBottom: 12 }}>
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
                      <div style={{ ...s.statusText, color: statusFarg[o.status] ?? SEKUNDAR, marginTop: 10 }}>
                        {o.status}
                        {o.status_datum && (
                          <span style={{ color: SEKUNDAR, fontWeight: 400 }}> {String(o.status_datum).slice(0, 10)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
