'use client';

// Sortimentsutfall för EN månad — avsedd att VISAS FÖR köparen, inte att ge
// köparen inloggning till. Öppnas från årsvyn (/affarsuppfoljning): trycket på en stapel
// ersätter den gamla månadsväljaren, och åtgärd och bolag följer med i adressen
// (?manad=2026-09&atgard=Allt&bolag=Alla). Bolag 'Alla' tar med alla objekt; 'Vida' bara Vidas.
//
// Innehållet är kurerat för Vidas ögon (inga kronor, inga markägaruppgifter)
// men sidan är inte åtkomstbegränsad. Alla tabeller bakom den har
// select-policy med qual = true för authenticated — permissivt, inte
// bolagsscopat. Varje inloggad användare läser alla bolag, och p_bolag är
// ett filter, inte en gräns. Säker som rapport, inte som inloggad vy.
//
// YTANS ORDNING, ögat läser nedåt i en rak linje, allt vänsterställt:
//   1. tillbakarad (året) och månaden        "‹ 2026", "September 2026"
//   2. talet, stort                 1 290 m³fub
//   3. ordraden                     levererat till Vida
//   5. kontrollraden som text       slutavverkning ⌄
//   7. ÅTGÄRD BEHÖVS                bara när något går att rätta före mötet
//   8. nivårader med ›              Sortiment, N objekt, Så räknas (en egen skärm: ?vy=sa-raknas)
//   9. luft under, inte i mitten
// (4 och 6 finns inte här: ingen skala att sätta talet mot, inget underlag
//  som varierar.) Rutan står under förklaringen, inte över talet: den
//  skriker i varje månad vi sett, och "sällan" hade blivit "alltid".
//  Risken är inte att Vida ser rutan — risken är att de ser ett tal som är
//  fel. 1 290 m³ med 1,4 m³ utan sortiment ljuger tyst.
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

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { SIDA, TAL, TEXT, SEKUNDAR, LINJE, stor, Tillbakarad, Stort, Kontroll, Rad, Rader, Stycken } from '@/components/Ytform';
import { SORTIMENTFARG } from '@/lib/design/tokens';

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
function nuvarandeManad() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const ROD = 'rgba(255,120,110,0.95)';
const MUTED = { color: SEKUNDAR, fontSize: 11 } as const;
/** Samma ord som årsvyn: "allt" är alla åtgärder (slutavverkning, gallring och objekt utan angiven åtgärd). */
const ATGARD_TEXT: Record<Atgard, string> = { Slutavverkning: 'slutavverkning', Gallring: 'gallring', Grot: 'GROT', Allt: 'alla åtgärder' };

type AtgardBehovs = { vad: string; gor: string };

/** Bara det som går att rätta före mötet. Allt kommer ur svaret — inget räknas här. */
function atgarderFor(data: Utfall, manad: string): AtgardBehovs[] {
  const ut: AtgardBehovs[] = [];
  const ejKlassad = data.grupper.find(g => g.namn === 'Ej klassad');
  if (ejKlassad && ejKlassad.volym > 0) ut.push({
    vad: `${nf1(ejKlassad.volym)} m³ saknar sortiment. Volymen ligger i totalen men i ingen rad.`,
    gor: 'Ett sortiment ur maskinen saknas i vår sortimentslista. Lägg till det, så hamnar volymen rätt.',
  });
  const utanAtgard = data.objekt.filter(o => o.saknar_atgard);
  if (utanAtgard.length > 0) ut.push({
    vad: `${utanAtgard.length === 1 ? 'Ett objekt' : `${utanAtgard.length} objekt`} saknar angiven åtgärd: ${utanAtgard.map(o => o.namn || o.nyckel).join(', ')}.`,
    gor: 'Volymen kan ligga under fel åtgärd. Sätt avverkningsform på objektet i Redigering.',
  });
  if (data.total_volym <= 0 && data.stammar_i_urval > 0) ut.push({
    vad: `${nf(data.stammar_i_urval)} stammar är avverkade i ${manadEtikett(manad)}, men stockdatan bakom dem gick inte att läsa. Volymen är okänd, inte noll.`,
    gor: 'Kontrollera HPR-importen för månadens filer innan siffran visas för någon.',
  });
  return ut;
}

/** Rutan: rubrik, en rad om vad, och "Vad du gör ›" som öppnar åtgärden. */
function Atgardsruta({ atg }: { atg: AtgardBehovs[] }) {
  const [visa, setVisa] = useState(false);
  if (atg.length === 0) return null;
  return (
    <div role="alert" style={{ margin: '18px 16px 0', padding: '12px 14px', borderRadius: 12,
                               border: '1px solid rgba(255,120,110,0.35)', background: 'rgba(255,120,110,0.06)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: ROD }}>
        Åtgärd behövs
      </div>
      {atg.map((a, i) => (
        <div key={i} style={{ marginTop: 6 }}>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>{a.vad}</div>
          {visa && <div style={{ fontSize: 12, color: SEKUNDAR, lineHeight: 1.5, marginTop: 3 }}>{a.gor}</div>}
        </div>
      ))}
      <button onClick={() => setVisa(x => !x)} aria-expanded={visa}
        style={{ border: 'none', background: 'none', padding: '8px 0 2px', minHeight: 40, fontFamily: 'inherit',
                 fontSize: 12, fontWeight: 600, color: TEXT, cursor: 'pointer' }}>
        Vad du gör {visa ? '⌄' : '›'}
      </button>
    </div>
  );
}

/** Volym + enhet + andel, högerställt, i en rad. */
function Volym({ m3, andel, liten }: { m3: number; andel?: number; liten?: boolean }) {
  return (
    <span style={{ textAlign: 'right', flexShrink: 0 }}>
      <span style={{ ...TAL, fontSize: liten ? 14 : 17, color: liten ? SEKUNDAR : TEXT }}>{nf1(m3)}</span>
      <span style={{ ...MUTED, marginLeft: 5 }}>m³{andel != null && ` · ${nf1(andel)} %`}</span>
    </span>
  );
}

function Innehall() {
  const sp = useSearchParams();
  const manad = /^\d{4}-\d{2}$/.test(sp.get('manad') ?? '') ? (sp.get('manad') as string) : nuvarandeManad();
  const bolag = sp.get('bolag') === 'Alla' ? 'Alla' : 'Vida';
  const [atgard, setAtgard] = useState<Atgard>(() => (ATGARDER.includes(sp.get('atgard') as Atgard) ? (sp.get('atgard') as Atgard) : 'Allt'));
  const [data, setData] = useState<Utfall | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);
  const [visaSortiment, setVisaSortiment] = useState(false);
  const [visaObjekt, setVisaObjekt] = useState(false);
  const [visaMatning, setVisaMatning] = useState(false);
  const [oppenIndustri, setOppenIndustri] = useState<string | null>(null);

  const hamta = useCallback(async () => {
    setLaddar(true);
    setFel(null);
    const { data, error } = await supabase.rpc('sortimentsutfall_manad', {
      p_manad: `${manad}-01`, p_atgard: atgard, p_bolag: bolag,
    });
    // Tomt får aldrig betyda två saker: ett fel är ett fel, inte noll m³.
    if (error) { setFel(error.message); setData(null); }
    else setData(data as Utfall);
    setLaddar(false);
  }, [manad, atgard, bolag]);

  useEffect(() => { hamta(); }, [hamta]);

  const maxKlass = useMemo(() => {
    const m: Record<string, number> = {};
    data?.sagbart.industrier.forEach(i => {
      m[i.namn] = Math.max(0, ...i.klasser.map(k => k.volym));
    });
    return m;
  }, [data]);

  // Status får aldrig härledas ur volym — färgen förstärker bara texten.
  // "Ej markerad" betyder att ingen status finns; frånvaro visas som frånvaro.
  const statusFarg: Record<string, string> = {
    'Skotat':           'rgba(90,255,140,0.9)',
    'Skotning pågår':   'rgba(91,143,255,0.9)',
    'Avverkning pågår': 'rgba(255,179,64,0.9)',
  };

  const harVolym = (data?.total_volym ?? 0) > 0;
  const atgarder = data ? atgarderFor(data, manad) : [];
  const vy = sp.get('vy');
  const lank = (extra = '') => `/affarsuppfoljning/manad?manad=${manad}&atgard=${atgard}&bolag=${bolag}${extra}`;

  // ── Så räknas: det som förklarar talet bor här, en nivå in ──────────────
  if (vy === 'sa-raknas') {
    return (
      <div style={SIDA}>
        <Tillbakarad href={lank()} text={stor(manadEtikett(manad))} />
        <Stycken>
          <p style={{ margin: 0 }}>
            Volymen är skördarmätt: maskinens egen mätning av varje stock, under bark, i kubikmeter
            fast (m³fub). Sortimenten följer maskinens prislista. Industrins inmätning vid mottagning
            kan avvika något.
          </p>
        </Stycken>
      </div>
    );
  }

  /** Sortimentets färg ur ljushetsskalan (mörkast = mest värt). Energi och ej sorterat är "övrigt". */
  const sortFarg = (namn: string) => SORTIMENTFARG[namn === 'Timmer' ? 'timmer' : namn === 'Kubb' ? 'kubb' : namn === 'Massa' ? 'massa' : 'ovrigt'];
  const atgardKontroll = (
    <Kontroll text={ATGARD_TEXT[atgard]} value={atgard} onChange={v => setAtgard(v as Atgard)} label="Åtgärd">
      {ATGARDER.map(a => <option key={a} value={a}>{stor(ATGARD_TEXT[a])}</option>)}
    </Kontroll>
  );

  return (
    <div style={SIDA}>
      {/* 1. Tillbaka till året, sedan månaden. Ingen väljare: staplarna i årsvyn är väljaren. */}
      <Tillbakarad href={`/affarsuppfoljning?ar=${manad.slice(0, 4)}&atgard=${atgard}&bolag=${bolag}`} text={manad.slice(0, 4)} />
      <div style={{ margin: '0 16px', fontSize: 15, fontWeight: 600 }}>{stor(manadEtikett(manad))}</div>
      {laddar && <div style={{ ...MUTED, fontSize: 12, padding: '24px 16px' }}>Hämtar {manadEtikett(manad)}…</div>}

      {!laddar && fel && (
        <div style={{ padding: '24px 16px', lineHeight: 1.6 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Utfallet kunde inte hämtas</div>
          <div style={{ fontSize: 12, color: SEKUNDAR }}>Försök igen. Står felet kvar, hör av dig — siffrorna finns, det är hämtningen som inte gick fram.</div>
        </div>
      )}

      {!laddar && !fel && data && (
        <>
          {harVolym ? (
            /* 2. Talet. 3. Ordraden. 5. Kontrollraden som text. */
            <Stort tal={nf(data.total_volym)} enhet="m³fub" ordrad={bolag === 'Vida' ? 'levererat till Vida' : 'avverkat'}>
              {atgardKontroll}
            </Stort>
          ) : (
            <div style={{ padding: '10px 16px 0' }}>
              {data.stammar_i_urval > 0 ? (
                /* Stockunderlag saknas: volymen är okänd, inte noll. Rutan nedanför säger vad. */
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>Volymen för {manadEtikett(manad)} går inte att läsa ännu.</div>
              ) : (
                /* Ingen volym är ett tillstånd, inte ett fel. */
                <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                  {bolag === 'Vida' ? 'Inget levererat till Vida' : 'Inget avverkat'} i {manadEtikett(manad)}.
                  {data.volym_per_atgard.length > 0 && (
                    <div style={{ ...MUTED, fontSize: 12, marginTop: 4 }}>
                      Den här månaden finns {data.volym_per_atgard
                        .map(v => `${nf1(v.volym)} m³ ${v.namn.toLowerCase()}`).join(' och ')} — byt åtgärd nedan.
                    </div>
                  )}
                </div>
              )}
              {atgardKontroll}
            </div>
          )}

          {/* 7. Skriker bara när något går att rätta. Annars finns rutan inte. */}
          <Atgardsruta atg={atgarder} />

          {/* 8. Nivåraderna. 9. Luften hamnar under dem. */}
          {harVolym && (
            <Rader>
              {/* Vad bestod det av. "Ej klassad" står i rutan och inte här. */}
              <Rad text="Sortiment" onClick={() => setVisaSortiment(v => !v)} oppen={visaSortiment} />
              {visaSortiment && (
                <div style={{ paddingBottom: 12 }}>
                  {data.grupper.filter(g => g.namn !== 'Ej klassad').map(g => {
                    const liten = g.andel < SMAGRANS_PCT;
                    const arMassa = g.namn === 'Massa';
                    return (
                      <div key={g.namn} style={{ padding: '9px 0', borderTop: LINJE }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12,
                                      ...(arMassa ? { minHeight: 36 } : {}) }}>
                          <span style={{ fontSize: 13, color: liten ? SEKUNDAR : TEXT }}>
                            {g.namn}
                            {/* Längddata bor på en egen sida — massaraden här
                                svarar på volymfrågan, inte på längdfrågan. */}
                            {arMassa && (
                              <Link href={`/affarsuppfoljning/kvalitet?manad=${manad}`} onClick={e => e.stopPropagation()}
                                style={{ ...MUTED, marginLeft: 8, textDecoration: 'underline' }}>längder ›</Link>
                            )}
                          </span>
                          <Volym m3={g.volym} andel={g.andel} liten={liten} />
                        </div>
                        {!liten && (
                          <div style={{ height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.05)', marginTop: 7 }}>
                            <div style={{ height: '100%', borderRadius: 1, width: `${g.andel}%`, background: sortFarg(g.namn) }} />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Till sågverk, med industrierna som underrader. Vilket sortiment
                      en industri hör till står inte i svaret, så de ligger här och
                      inte under Timmer och Kubb. Diameterklasserna öppnas per industri. */}
                  <div style={{ padding: '9px 0', borderTop: LINJE }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                      <span style={{ fontSize: 13 }}>Till sågverk</span>
                      <Volym m3={data.sagbart.volym} andel={data.sagbart.andel} />
                    </div>
                  </div>
                  {data.sagbart.industrier.map(ind => {
                    const oppen = oppenIndustri === ind.namn;
                    return (
                      <div key={ind.namn} style={{ paddingLeft: 14 }}>
                        <button onClick={() => setOppenIndustri(oppen ? null : ind.namn)} aria-expanded={oppen}
                          style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12,
                                   border: 'none', borderTop: LINJE, background: 'none', padding: '9px 0', minHeight: 44,
                                   fontFamily: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
                          <span style={{ fontSize: 13 }}>{ind.namn} <span style={{ color: SEKUNDAR }}>{oppen ? '⌄' : '›'}</span></span>
                          <Volym m3={ind.volym} andel={ind.andel} />
                        </button>
                        {oppen && (
                          <div style={{ paddingBottom: 10 }}>
                            {/* Största klassen märks med både färg och text — färg är
                                aldrig ensam informationsbärare. */}
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                              {ind.klasser.map(k => {
                                const max = maxKlass[ind.namn] || 1;
                                const storst = k.volym === max && max > 0;
                                return (
                                  <div key={k.klass} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <div style={{ height: 40, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                                      <div style={{ width: '100%', height: `${Math.max(2, (k.volym / max) * 40)}px`, borderRadius: 3,
                                                    background: storst ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.14)' }} />
                                    </div>
                                    <div style={{ fontSize: 10, marginTop: 5, color: storst ? TEXT : SEKUNDAR, fontWeight: storst ? 700 : 400 }}>{nf(k.volym)}</div>
                                    <div style={{ fontSize: 9, color: SEKUNDAR, marginTop: 2 }}>{k.klass}</div>
                                  </div>
                                );
                              })}
                            </div>
                            <div style={{ ...MUTED, marginTop: 8 }}>
                              m³ per toppdiameter i cm · mest {ind.klasser.find(k => k.volym === maxKlass[ind.namn])?.klass ?? '—'}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Var det kom ifrån */}
              <Rad text={data.antal_objekt === 1 ? 'Ett objekt' : `${nf(data.antal_objekt)} objekt`}
                onClick={() => setVisaObjekt(v => !v)} oppen={visaObjekt} />
              {visaObjekt && (
                <div style={{ paddingBottom: 12 }}>
                  {data.objekt.map(o => (
                    <div key={o.nyckel} style={{ padding: '10px 0', borderTop: LINJE }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                        <span style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{o.namn || o.nyckel}</div>
                          <div style={MUTED}>
                            {o.vo_nummer ? `VO ${o.vo_nummer}` : 'VO saknas'}
                            {o.status !== 'Ej markerad' && (
                              <> · <span style={{ color: statusFarg[o.status] ?? SEKUNDAR, fontWeight: 600 }}>{o.status}</span>
                                {o.status_datum && <> {String(o.status_datum).slice(0, 10)}</>}</>
                            )}
                            {o.saknar_atgard && ' · åtgärd ej angiven'}
                          </div>
                        </span>
                        <Volym m3={o.volym} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Hur det räknas bor en nivå in. */}
              <Rad text="Så räknas" href={lank('&vy=sa-raknas')} />
            </Rader>
          )}
        </>
      )}
    </div>
  );
}

export default function Sortimentsutfall() {
  return (
    <Suspense fallback={<div style={{ background: '#111110', minHeight: '100vh' }} />}>
      <Innehall />
    </Suspense>
  );
}
