'use client';

// NIVÅ 2 — ett objekt, i valt omfång.
//
// Nivå 1 listar månad för månad, nivå 2 kunde bara hela objektet. Samma trakt
// stod därför med 4,07 i listan och 3,97 på objektskärmen, utan att något
// förklarade skillnaden. Växlingen löser det: månaden är förvald och ärvs
// från raden man tryckte på, så första talet man ser är det man kom från.
//
// Växlingen styr HELA skärmen. Ett halvt omfång — rubriken för månaden,
// resten för objektet — vore samma tankelucka en nivå ner.
//
// BEGREPPEN:
//   3 m-stock  massavedsstock kapad till 3 m för att ta bort röta. INUTI
//              massavedsvolymen; det är den som drar ner medellängden.
//   Avkap      kapposten ur prislistan, 3 dm eller 6 dm. Eget sortiment,
//              UTANFÖR massavedsvolymen.
//   Sågbar     biten ryms i ett helt sortimentsfönster — längd OCH diameter.
//   dimension  Fönstren kommer ur objektets EGNA sortiment.

import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { medAbortRetry, arAbortFel } from '@/lib/supabaseRetry';

type Tradslag = { namn: string; m3fub: number; medellangd_m: number; sagbar_m3: number };
type Valta = { valta: string; m3fub: number; medellangd_m: number; antal_tradslag: number; tradslag: Tradslag[] };
type Klass = { klass: string; ordning: number; niva: 'tre_m' | 'under_mal' | 'over_mal'; m3fub: number; st: number; varav_tre_m_st: number; andel: number };
type SagbartSortiment = {
  namn: string; grupp: string; langd_min_m: number; langd_max_m: number | null;
  dia_min_mm: number; dia_max_mm: number; kalla: 'hpr' | 'harledd'; m3fub: number;
};
type Niva2 = {
  objekt_id: string; namn: string | null; status: string;
  omfang: 'manad' | 'objekt'; manad: string | null; manader: string[];
  period_fran: string | null; period_till: string | null;
  onskad_medellangd_m: number;
  medellangd_m: number | null; total_m3fub: number;
  tre_m_stock: { m3fub: number; st: number; andel: number | null; medellangd_utan_m3: number | null };
  sagbar: {
    m3fub: number; andel: number | null; sortiment: SagbartSortiment[];
    overlapp_m3: number; antal_ur_maskinen: number; antal_harledda: number;
  };
  avkap: { st: number; m3fub: number; delar: { kap: string; st: number; m3fub: number }[] };
  valtor: Valta[]; langdfordelning: Klass[];
  hemved_m3: number;
  massa_utan_sagbar_stock_m3: number; massa_utan_sagbar_stock_st: number;
};

const MANADER = ['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'];
const nf1 = (n: number) => n.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = (n: number) => n.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = (n: number) => n.toLocaleString('sv-SE', { maximumFractionDigits: 0 });

const manadNamn = (ym: string) => MANADER[Number(ym.split('-')[1]) - 1];
const manadEtikett = (ym: string) => `${manadNamn(ym)} ${ym.split('-')[0]}`;
/** "juli–augusti 2026", "augusti 2026", "juli 2026–mars 2027". */
function periodText(fran: string | null, till: string | null) {
  if (!fran || !till) return null;
  if (fran === till) return manadEtikett(fran);
  const [ay] = fran.split('-'), [by] = till.split('-');
  return ay === by ? `${manadNamn(fran)}–${manadNamn(till)} ${ay}`
                   : `${manadEtikett(fran)}–${manadEtikett(till)}`;
}

const S = {
  page: { background: '#111110', minHeight: '100vh', paddingTop: 56, paddingBottom: 90, color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif" } as const,
  muted: { color: '#7a7a72', fontSize: 11 },
  tal: { fontFamily: "'Fraunces', serif" } as const,
  rubrik: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: '#7a7a72', marginTop: 26, marginBottom: 10 },
};

const GUL = 'rgba(255,179,64,0.95)';
const GRON = 'rgba(90,255,140,0.9)';
const ROD = 'rgba(255,120,110,0.95)';

function kvalitet(m: number, onskad: number) {
  if (m < 4.0) return { ord: 'Kort', farg: ROD };
  if (m < onskad) return { ord: 'Under önskad', farg: GUL };
  return { ord: 'Godkänt', farg: GRON };
}
const klassFarg = (n: Klass['niva']) =>
  n === 'tre_m' ? GUL : n === 'over_mal' ? 'rgba(90,255,140,0.55)' : 'rgba(255,255,255,0.14)';

function Innehall() {
  const params = useParams();
  const sp = useSearchParams();
  const objektId = decodeURIComponent(String(params.objektId));
  const manad = sp.get('manad');

  // Månaden är förvald när man kommer från listan — samma tal som raden.
  const [omfang, setOmfang] = useState<'manad' | 'objekt'>(manad ? 'manad' : 'objekt');
  const [d, setD] = useState<Niva2 | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<{ kod: string; text: string } | null>(null);
  const [visaRakning, setVisaRakning] = useState(false);
  const [visaTak, setVisaTak] = useState(false);

  const hamta = useCallback(async () => {
    setLaddar(true); setFel(null);
    const { data, error } = await medAbortRetry(() =>
      supabase.rpc('massaved_niva2', {
        p_objekt_id: objektId,
        p_manad: omfang === 'manad' && manad ? `${manad}-01` : null,
      }));
    if (error) {
      setFel({ kod: (error as { code?: string }).code ?? (arAbortFel(error) ? 'ABORT' : 'OKÄND'),
               text: error.message ?? String(error) });
      setD(null);
    } else setD(data as Niva2);
    setLaddar(false);
  }, [objektId, manad, omfang]);

  useEffect(() => { hamta(); }, [hamta]);

  const maxAndel = Math.max(1, ...(d?.langdfordelning ?? []).map(k => k.andel));
  // Finns bara en månad har växlingen inget att välja mellan.
  const visaVaxling = !!manad && (d?.manader?.length ?? 0) > 1;

  const flik = (val: 'manad' | 'objekt', etikett: string) => (
    <button key={val} onClick={() => setOmfang(val)}
      style={{ flex: 1, border: 'none', borderRadius: 7, padding: '9px 10px', minHeight: 44,
               fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer',
               background: omfang === val ? 'rgba(255,255,255,0.11)' : 'transparent',
               color: omfang === val ? '#e8e8e4' : '#7a7a72' }}>
      {etikett}
    </button>
  );

  return (
    <div style={S.page}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ minWidth: 0 }}>
            <Link href={manad ? `/massaved?manad=${manad}` : '/massaved'}
              style={{ ...S.muted, textDecoration: 'none' }}>‹ Alla objekt</Link>
            {d?.namn && (
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 3, whiteSpace: 'nowrap',
                            overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.namn}</div>
            )}
          </span>
          {d?.status && <span style={{ ...S.muted, flexShrink: 0 }}>{d.status}</span>}
        </div>

        {visaVaxling && manad && (
          <div style={{ display: 'flex', gap: 2, marginTop: 10, padding: 2, borderRadius: 9,
                        background: 'rgba(255,255,255,0.04)' }}>
            {flik('manad', manadNamn(manad).replace(/^./, c => c.toUpperCase()))}
            {flik('objekt', 'Hela objektet')}
          </div>
        )}
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
          Ingen massaved på {d.namn ?? 'objektet'}
          {d.omfang === 'manad' && manad ? ` i ${manadEtikett(manad)}` : ''}.
        </div>
      )}

      {!laddar && !fel && d && d.medellangd_m != null && (
        <div style={{ padding: '0 16px' }}>
          <div style={{ textAlign: 'center', padding: '26px 0 20px' }}>
            <div>
              <span style={{ ...S.tal, fontSize: 56, lineHeight: 1 }}>{nf2(d.medellangd_m)}</span>
              <span style={{ ...S.tal, fontSize: 22, color: '#7a7a72', marginLeft: 6 }}>m</span>
            </div>
            <div style={{ ...S.muted, marginTop: 10, lineHeight: 1.5 }}>
              <span style={{ color: kvalitet(d.medellangd_m, d.onskad_medellangd_m).farg, fontWeight: 600 }}>
                {kvalitet(d.medellangd_m, d.onskad_medellangd_m).ord}
              </span><br />
              {/* Vidas önskade medellängd i vältan — inte ett avtalat golv.
                  Samma tal för alla fyra kombinationer av åtgärd och välta:
                  bruket ser bara vältan. */}
              Vidas önskade medellängd {nf1(d.onskad_medellangd_m)} m · {nf1(d.total_m3fub)} m³fub
              {/* Perioden ersätter månadslistan som låg i botten. Visas också
                  när växlingen är gömd — annars står talet på ett enmånads-
                  objekt helt utan angiven period. */}
              {(d.omfang === 'objekt' || !visaVaxling) && periodText(d.period_fran, d.period_till) && (
                <><br />{periodText(d.period_fran, d.period_till)}</>
              )}
            </div>
          </div>

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
              {/* Simuleringen svarar på frågan den här raden väcker: vad
                  kostar ett längre rotkap i timmer? Räknat, inte mätt. */}
              <Link href={`/rotkap?objekt=${encodeURIComponent(objektId)}`}
                style={{ ...S.muted, textDecoration: 'underline' }}>
                Vad kostar ett längre rotkap? ›
              </Link>
            </>
          )}

          {d.sagbar.sortiment.length > 0 && (
            <>
              <div style={S.rubrik}>Sågbar dimension</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span>
                  <span style={{ ...S.tal, fontSize: 28 }}>{nf1(d.sagbar.andel ?? 0)}</span>
                  <span style={{ ...S.muted, marginLeft: 3 }}>%</span>
                </span>
                <span style={S.muted}>{nf1(d.sagbar.m3fub)} m³fub</span>
              </div>
              <p style={{ ...S.muted, marginTop: 8, lineHeight: 1.6 }}>
                Massaved som ryms i ett helt sortimentsfönster — både längd och diameter — bland
                de sortiment objektet faktiskt körde.
              </p>
              {/* Mätt och gissat får INTE se likadana ut. Skillnaden bärs av
                  formen först (intervall mot "från"), sedan av ordet, sist av
                  färgen — i hytten är färg det som försvinner först. */}
              {d.sagbar.sortiment.map(so => (
                <div key={so.namn} style={{ paddingLeft: 12, marginTop: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 12, minWidth: 0, whiteSpace: 'nowrap',
                                   overflow: 'hidden', textOverflow: 'ellipsis' }}>{so.namn}</span>
                    <span style={{ ...S.muted, flexShrink: 0 }}>{nf1(so.m3fub)} m³</span>
                  </div>
                  <div style={{ ...S.muted, marginTop: 1 }}>
                    {so.kalla === 'hpr' && so.langd_max_m != null ? (
                      <>
                        {nf2(so.langd_min_m)}–{nf2(so.langd_max_m)} m · {nf0(so.dia_min_mm)}–{nf0(so.dia_max_mm)} mm
                        <span style={{ color: GRON }}> · ur maskinen</span>
                      </>
                    ) : (
                      <>
                        från {nf2(so.langd_min_m)} m · {nf0(so.dia_min_mm)}–{nf0(so.dia_max_mm)} mm
                        <span style={{ color: GUL }}> · taket härlett</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {d.sagbar.overlapp_m3 > 0 && (
                <p style={{ ...S.muted, marginTop: 8, lineHeight: 1.6 }}>
                  {nf1(d.sagbar.overlapp_m3)} m³ ryms i flera av sortimenten och räknas en gång i totalen.
                </p>
              )}
              {d.sagbar.antal_harledda > 0 && (
                <div style={{ marginTop: 2 }}>
                  <button onClick={() => setVisaTak(v => !v)}
                    style={{ border: 'none', background: 'none', padding: '10px 0', minHeight: 44,
                             fontFamily: 'inherit', fontSize: 11, color: GUL, cursor: 'pointer',
                             textAlign: 'left' }}>
                    Taket är härlett, inte mätt {visaTak ? '⌄' : '›'}
                  </button>
                  {visaTak && (
                    <p style={{ ...S.muted, margin: '0 0 8px', lineHeight: 1.7 }}>
                      De undre gränserna står i prislistan. De övre gör det inte — de är härledda
                      ur högsta prisklassens undre gräns. Maskinens HPR-fil bär de riktiga
                      gränserna, och där de har lästs in står det &quot;ur maskinen&quot; i stället.
                      Skillnaden är inte liten: för kubb visade sig taket vara 260 mm och inte 220,
                      och dessutom fanns ett längdtak som prislistan inte har alls.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

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
                  {t.sagbar_m3 > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between',
                                  paddingLeft: 12, marginTop: 4, ...S.muted }}>
                      <span>varav sågbar dimension</span>
                      <span><span style={{ color: '#e8e8e4' }}>{nf1(t.sagbar_m3)}</span> m³</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}

          {/* Klassen summerar till totalen, kortet räknar kapbeslut. Varav-
              talet i raden gör att båda syns utan att motsäga varandra. */}
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
              <div style={{ ...S.muted, marginTop: 4 }}>
                {nf0(k.st)} st
                {k.varav_tre_m_st > 0 && <>, varav {nf0(k.varav_tre_m_st)} är 3 m-stockar</>}
              </div>
            </div>
          ))}

          <div style={{ marginTop: 22 }}>
            <Link href={`/massaved/${encodeURIComponent(objektId)}/bitar`}
              style={{ ...S.muted, textDecoration: 'underline' }}>
              Visa bitarna talet byggdes av ›
            </Link>
          </div>

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
                <p style={{ margin: '0 0 8px' }}>
                  4,6 m är Vidas önskade medellängd i vältan, inte ett avtalat golv. Samma tal
                  gäller oavsett åtgärd och välta — bruket ser bara vältan.
                </p>
                <p style={{ margin: '0 0 8px' }}>
                  Sågbar dimension kräver att biten ryms i BÅDA gränserna för ett sortiment,
                  längd och diameter, som den redan är kapad. Regeln är alltså &quot;biten ÄR
                  en sågbar stock&quot;, inte &quot;biten hade kunnat ge en sågbar stock&quot;.
                </p>
                <p style={{ margin: '0 0 8px' }}>
                  Det får en följd som ser konstig ut tills man vet den: kubben är en
                  fastlängdsprodukt, 3,05–3,25 m. En grov massavedsstock på 4,80 m och 150 mm
                  räknas därför INTE som kubbdimension, trots att en 3,05-kubb hade gått att
                  kapa ur den. Vad som hade kunnat bli om stammen kapats annorlunda är en
                  annan fråga än den här vyn svarar på.
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
