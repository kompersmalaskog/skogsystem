'use client';

// ROTKAP — vad kostar ett längre rotkap i timmer? Presentationen.
//
// Ren komponent: rader in, inget hämtas här. Det gör att den kan renderas
// med stillastående data utanför appen, och att sidan (page.tsx) bara har
// ett jobb — hämta och hålla valet.
//
// YTANS ORDNING, ögat läser nedåt i en rak linje, allt vänsterställt:
//   1. rubrikrad med väljare       "Akelius Tåget ▾"
//   2. talet, stort                 −3,46 m³
//   3. ordraden                     förlorat timmer · räknat, inte mätt
//   4. dämpad rad med skala         −7,2 % av timret · −18 l per stam
//   5. kontrollraden som text       vid 3,4 m i stället för 3,0 ▾
//   6. stilla rad om underlaget     byggt på 187 av 207 stammar
//   7. ÅTGÄRD BEHÖVS                bara när något går att göra
//   8. nivårader med ›
//   9. luft under, inte i mitten
//
// En färg på ytan. Rött finns bara i rutan. Saknade kurvor är inget fel att
// åtgärda — Ponsse skrev kurvor först från 2026-07-18 och det som avverkats
// före får aldrig någon — det är byggt på-raden. Rötan är en förklaring till
// den andra gruppen, inte ett larm.
//
// Allt är RÄKNAT, inte mätt. Simuleringen apterade samma stammar en gång
// till med rotbiten förlängd, mot maskinens egen prislista. Raden för 3,0 m
// är referensen: det föraren faktiskt körde. Skillnaden räknas här som
// rad(k) − rad(3,0), aldrig lagrad — så kan ett tal aldrig motsäga sin
// referens.

import { useState } from 'react';

export type Validering = {
  n: number; dia_median_mm: number; dia_p10: number; dia_p90: number;
  vol_median_pct: number; vol_p10: number; vol_p90: number; utanfor: number;
  bark?: Record<string, { a: number; b: number; n: number; r2: number }>;
};
export type SimRad = {
  objekt_id: string; kaplangd_cm: number; objekt_namn: string | null; maskiner: string[];
  stammar_objekt: number; stammar: number; grupp1_stammar: number; grupp2_stammar: number;
  utan_sagstock: number; utan_kurva: number;
  timmer_m3: number; kubb_m3: number; massa_m3: number; rest_m3: number;
  grupp1_timmer_m3: number; grupp2_timmer_m3: number; grupp2_kedja_fast: number;
  validering: Validering | null; anmarkning: string | null;
  stockar_antal: number; serier_antal: number; beraknad: string;
};

export const KAPLANGDER = [320, 340, 360, 380] as const;
export const REFERENS = 300;
/** Färre stammar än så är brus, inte ett tal. En enskild stam ger mellan
 *  −309 och +81 liter, var femte exakt noll (797 stammar, fyra objekt).
 *  Dras 20 slumpade stammar hamnar medlet inom ±50 % av det sanna i nio
 *  fall av tio; med 10 bara i tre av fyra, med 2 varannan gång. */
export const MIN_STAMMAR = 20;
/** Kurvan mot maskinens egna stockar: bortom det här är talet inte att lita på. */
export const VALIDERING_DIA_MM = 3;
export const VALIDERING_VOL_PCT = 2;

const nf = (n: number, d: number) =>
  n.toLocaleString('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d });
const nf0 = (n: number) => nf(n, 0);
/** Tecknet är en del av talet: −3,19 och +2,92 ska aldrig se likadana ut. */
const tecken = (n: number, d = 2) =>
  Math.abs(n) < 0.5 * Math.pow(10, -d) ? nf(0, d) : (n < 0 ? '−' : '+') + nf(Math.abs(n), d);
const meter = (cm: number) => nf(cm / 100, 1);
/** Maskinen sätter Vidas ordernummer först i namnet. Det är inte namnet. */
export const utanPrefix = (namn: string) => namn.replace(/^\d{4,}\s+/, '');

const TEXT = '#e8e8e4';
const SEKUNDAR = '#7a7a72';
const ROD = 'rgba(255,120,110,0.95)';
const GRON = 'rgba(90,255,140,0.9)';
const LINJE = '1px solid rgba(255,255,255,0.07)';
const S = {
  page: { background: '#111110', minHeight: '100vh', paddingTop: 56, paddingBottom: 90,
          color: TEXT, fontFamily: "'Geist', system-ui, sans-serif" } as const,
  muted: { color: SEKUNDAR, fontSize: 11 } as const,
  tal: { fontFamily: "'Fraunces', serif" } as const,
  /** Osynlig native-väljare ovanpå en textrad: iOS-plockaren, men raden ser ut som text. */
  overlay: { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', opacity: 0,
             cursor: 'pointer', fontSize: 16 },
};

type ObjektVal = { objekt_id: string; namn: string; ref: SimRad; valjbar: boolean; orsak: string | null };

/** Grupperar raderna per objekt och avgör vad som går att välja. */
export function objektLista(rader: SimRad[]): ObjektVal[] {
  const per = new Map<string, SimRad[]>();
  for (const r of rader) per.set(r.objekt_id, [...(per.get(r.objekt_id) ?? []), r]);
  const ut: ObjektVal[] = [];
  per.forEach((rs, id) => {
    const ref = rs.find(r => r.kaplangd_cm === REFERENS);
    if (!ref) return;
    const orsak = ref.stammar >= MIN_STAMMAR ? null
      : ref.stammar > 0 ? 'för få stammar'
      : ref.stammar_objekt === 0 ? 'inga stockar'
      : ref.utan_sagstock + ref.utan_kurva > 0 ? 'rotkap utan sågstock eller kurva'
      : 'inga rotkap';
    ut.push({ objekt_id: id, namn: utanPrefix(ref.objekt_namn ?? id), ref, valjbar: orsak === null, orsak });
  });
  // Valbara först, störst först — sedan resten i bokstavsordning.
  return ut.sort((a, b) => Number(b.valjbar) - Number(a.valjbar)
    || (a.valjbar ? b.ref.stammar - a.ref.stammar : a.namn.localeCompare(b.namn, 'sv')));
}

export type Atgard = { vad: string; gor: string };

/** Bara sådant som går att göra något åt. Allt kommer ur raden — inget
 *  räknas här. Saknade kurvor är INTE med: de går inte att åtgärda. */
export function atgarder(ref: SimRad): Atgard[] {
  const ut: Atgard[] = [];
  const v = ref.validering;
  if (v && (Math.abs(v.dia_median_mm) > VALIDERING_DIA_MM || Math.abs(v.vol_median_pct) > VALIDERING_VOL_PCT)) {
    ut.push({
      vad: `Stammens form stämmer inte mot maskinens egna stockar (${tecken(v.dia_median_mm, 1)} mm, ${tecken(v.vol_median_pct, 1)} %). Talet går inte att lita på.`,
      gor: 'Kontrollera barkfunktionen och att rätt fil lästes för objektet, och räkna om objektet efter rättning.',
    });
  }
  for (const a of (ref.anmarkning ?? '').split('; ').filter(Boolean)) {
    if (a.includes('avviker från filen')) ut.push({
      vad: `${a}.`,
      gor: 'Apteringen räknades med filens gränser, men massavedsvyerna visar de lagrade. Kör om fönsterbackfillen för objektet och räkna om.',
    });
    else if (a.includes('ingen barkfunktion')) ut.push({
      vad: `${a}. Den maskinens stammar är inte med i talet.`,
      gor: 'Stockarna saknar över- och underbarkpar. Kontrollera importen av objektets stockar och räkna om.',
    });
    else if (a.includes('finns inte i Behandlade')) ut.push({
      vad: `${a}. Den maskinens stammar är inte med i talet.`,
      gor: 'Lägg tillbaka filen i Behandlade och räkna om objektet.',
    });
    else if (a.includes('saknar gränser')) ut.push({
      vad: `${a}. Sortimentet kan inte apteras och saknas i talet.`,
      gor: 'Sortimentet har ingen prismatris i filen. Kontrollera prislistan i maskinen.',
    });
  }
  return ut;
}

/** Rutan: rubrik, en rad om vad, och "Vad du gör ›" som öppnar åtgärden. */
export function Atgardsruta({ atg }: { atg: Atgard[] }) {
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

/** En stilla rad som öppnar nästa nivå. Träffyta 48 px — hytten skakar. */
export function Nivarad({ etikett, oppen, onToggle }: { etikett: string; oppen: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} aria-expanded={oppen}
      style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
               border: 'none', borderTop: LINJE, background: 'none', padding: '14px 0', minHeight: 48,
               fontFamily: 'inherit', fontSize: 13, color: TEXT, cursor: 'pointer', textAlign: 'left' }}>
      <span>{etikett}</span>
      <span style={{ color: SEKUNDAR, fontSize: 16 }}>{oppen ? '⌄' : '›'}</span>
    </button>
  );
}

export default function RotkapVy({ rader, valt, kaplangd, onValj, onKaplangd }: {
  rader: SimRad[]; valt: string | null; kaplangd: number;
  onValj: (objektId: string) => void; onKaplangd: (cm: number) => void;
}) {
  const [visaVar, setVisaVar] = useState(false);
  const [visaRakning, setVisaRakning] = useState(false);
  const [visaDetaljer, setVisaDetaljer] = useState(false);
  const lista = objektLista(rader);
  const obj = lista.find(o => o.objekt_id === valt) ?? null;
  const ref = obj?.ref ?? null;
  const rad = obj ? rader.find(r => r.objekt_id === obj.objekt_id && r.kaplangd_cm === kaplangd) ?? null : null;
  const skift = kaplangd - REFERENS;

  // Skillnaderna — räknas här, lagras aldrig.
  const dT = ref && rad ? rad.timmer_m3 - ref.timmer_m3 : 0;
  const dK = ref && rad ? rad.kubb_m3 - ref.kubb_m3 : 0;
  const dM = ref && rad ? rad.massa_m3 - ref.massa_m3 : 0;
  const dR = ref && rad ? rad.rest_m3 - ref.rest_m3 : 0;
  const d1 = ref && rad ? rad.grupp1_timmer_m3 - ref.grupp1_timmer_m3 : 0;
  const d2 = ref && rad ? rad.grupp2_timmer_m3 - ref.grupp2_timmer_m3 : 0;
  const pct = ref && ref.timmer_m3 > 0 ? (100 * dT) / ref.timmer_m3 : 0;
  const lPerStam = ref && ref.stammar > 0 ? (1000 * dT) / ref.stammar : 0;
  const medRotkap = ref ? ref.stammar + ref.utan_sagstock + ref.utan_kurva : 0;
  const ord = Math.abs(dT) < 0.005 ? 'timret oförändrat' : dT < 0 ? 'förlorat timmer' : 'vunnet timmer';
  const maxGrupp = Math.max(Math.abs(d1), Math.abs(d2), 1e-9);
  const v = ref?.validering ?? null;
  const beraknad = ref ? new Date(ref.beraknad).toLocaleDateString('sv-SE') : null;
  const atg = ref ? atgarder(ref) : [];

  const stapel = (d: number) => (
    <div style={{ height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.05)', marginTop: 8 }}>
      <div style={{ height: '100%', borderRadius: 1, width: `${(Math.abs(d) / maxGrupp) * 100}%`,
                    background: Math.abs(d) < 0.005 ? 'rgba(255,255,255,0.14)' : d < 0 ? ROD : GRON }} />
    </div>
  );
  const grupp = (namn: string, st: number, d: number, not: React.ReactNode) => (
    <div style={{ padding: '12px 0', borderTop: LINJE }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <span>
          <div style={{ fontSize: 13 }}>{namn}</div>
          <div style={S.muted}>{nf0(st)} stammar</div>
        </span>
        <span style={{ flexShrink: 0 }}>
          <span style={{ ...S.tal, fontSize: 20 }}>{tecken(d)}</span>
          <span style={{ ...S.muted, marginLeft: 3 }}>m³</span>
        </span>
      </div>
      {stapel(d)}
      <div style={{ ...S.muted, marginTop: 6, lineHeight: 1.55 }}>{not}</div>
    </div>
  );

  return (
    <div style={S.page}>
      {/* 1. Rubrikrad med väljare. Objekt utan rotkap syns i plockaren men
          går inte att välja — att de har kurva men inget att simulera är
          också ett svar. */}
      <div style={{ position: 'relative', margin: '14px 16px 0', minHeight: 44, display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {obj ? obj.namn : 'Välj objekt'}
        </span>
        <span style={{ color: SEKUNDAR, marginLeft: 6, fontSize: 13 }}>▾</span>
        <select value={obj?.objekt_id ?? ''} onChange={e => onValj(e.target.value)} aria-label="Objekt" style={S.overlay}>
          {!obj && <option value="" disabled>Välj objekt</option>}
          {lista.filter(o => o.valjbar).map(o => (
            <option key={o.objekt_id} value={o.objekt_id}>{o.namn} · {nf0(o.ref.stammar)} st</option>
          ))}
          {lista.some(o => !o.valjbar) && (
            <optgroup label="Inget att simulera">
              {lista.filter(o => !o.valjbar).map(o => (
                <option key={o.objekt_id} value={o.objekt_id} disabled>{o.namn} · {o.orsak}</option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {obj && !obj.valjbar && (
        <div style={{ ...S.muted, padding: '24px 16px', lineHeight: 1.6 }}>
          Inget att simulera på {obj.namn}: {obj.orsak}.
          {obj.ref.stammar > 0 && <><br />{nf0(obj.ref.stammar)} stammar med rotkap och sågstock, gränsen är {MIN_STAMMAR}. Färre än så ger brus, inte ett tal.</>}
          {obj.ref.utan_sagstock > 0 && <><br />{nf0(obj.ref.utan_sagstock)} stammar med rotkap fick ingen sågstock alls.</>}
          {obj.ref.utan_kurva > 0 && <><br />{nf0(obj.ref.utan_kurva)} stammar med rotkap saknar kurva.</>}
        </div>
      )}

      {obj && obj.valjbar && ref && rad && (
        <>
          <div style={{ padding: '18px 16px 0' }}>
            {/* 2. Talet */}
            <div>
              <span style={{ ...S.tal, fontSize: 60, lineHeight: 1 }}>{tecken(dT)}</span>
              <span style={{ ...S.tal, fontSize: 22, color: SEKUNDAR, marginLeft: 6 }}>m³</span>
            </div>
            {/* 3. Ordraden — en färg. Etiketten bär skillnaden mot resten av
                appen: det här talet har ingen maskin mätt. */}
            <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5 }}>
              {ord}<span style={{ color: SEKUNDAR }}> · räknat, inte mätt</span>
            </div>
            {/* 4. Skalan — procenten säger om det är mycket, litern per stam
                gör objekt jämförbara. Som "km kvar" under ett tal. */}
            <div style={{ marginTop: 4, fontSize: 13, color: SEKUNDAR, lineHeight: 1.5 }}>
              {tecken(pct, 1)} % av timret · {tecken(lPerStam, 0)} l per stam
            </div>
            {/* 5. Kontrollraden som text */}
            <div style={{ position: 'relative', marginTop: 12, minHeight: 44, display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: 13 }}>vid {meter(kaplangd)} m i stället för {meter(REFERENS)}</span>
              <span style={{ color: SEKUNDAR, marginLeft: 6, fontSize: 13 }}>▾</span>
              <select value={kaplangd} onChange={e => onKaplangd(Number(e.target.value))} aria-label="Kaplängd" style={S.overlay}>
                {KAPLANGDER.map(cm => <option key={cm} value={cm}>{meter(cm)} m i stället för {meter(REFERENS)}</option>)}
              </select>
            </div>
            {/* 6. Underlaget. Saknade kurvor är inget fel att åtgärda —
                stammar avverkade före 2026-07-18 får aldrig någon. */}
            <div style={{ ...S.muted, marginTop: 2 }}>
              byggt på {nf0(ref.stammar)}{medRotkap > ref.stammar ? ` av ${nf0(medRotkap)}` : ''} stammar
            </div>
          </div>

          {/* 7. Skriker bara när något går att göra. Annars finns rutan inte. */}
          <Atgardsruta atg={atg} />

          {/* 8. Nivåraderna. 9. Luften hamnar under dem. */}
          <div style={{ margin: '18px 16px 0' }}>
            <Nivarad etikett="Var förlusten sitter" oppen={visaVar} onToggle={() => setVisaVar(x => !x)} />
            {visaVar && (
              <div style={{ paddingBottom: 14 }}>
                {[['Kubb', dK], ['Massaved', dM], ['Toppen blev inget sortiment', dR]].map(([namn, d]) => (
                  <div key={namn as string}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                             padding: '9px 0', borderTop: LINJE }}>
                    <span style={{ fontSize: 13 }}>{namn as string}</span>
                    <span>
                      <span style={{ ...S.tal, fontSize: 17 }}>{tecken(d as number)}</span>
                      <span style={{ ...S.muted, marginLeft: 3 }}>m³</span>
                    </span>
                  </div>
                ))}
                {grupp('Timret satt direkt över rotbiten', ref.grupp1_stammar, d1,
                  <>Rotbiten tar {skift} cm av det grövsta virket. Det räddar ingen aptering.</>)}
                {grupp('Rötan fortsatte', ref.grupp2_stammar, d2,
                  ref.grupp2_stammar === 0
                    ? 'Inga stammar med flera massabitar före timret.'
                    : <>Timret börjar där rötan slutade. Förlängningen rymdes i massaveden
                        hos {nf0(rad.grupp2_kedja_fast)} av {nf0(ref.grupp2_stammar)}
                        {rad.grupp2_kedja_fast < ref.grupp2_stammar && <>, hos resten flyttades kedjan {skift} cm</>}.
                        Var rötan slutade mäter maskinen inte: slutar den inom det nya kapet vinner
                        stammen en hel timmerstock, och det syns inte här. Talet är ett tak.</>)}
              </div>
            )}

            <Nivarad etikett="Så räknas simuleringen" oppen={visaRakning} onToggle={() => setVisaRakning(x => !x)} />
            {visaRakning && (
              <div style={{ fontSize: 12, color: SEKUNDAR, lineHeight: 1.65, paddingBottom: 10 }}>
                <p style={{ margin: '0 0 8px' }}>
                  Samma stammar apteras en gång till med rotbiten förlängd till {meter(kaplangd)} m, mot
                  maskinens egen prislista och samma fönster föraren körde med. Stammens form kommer ur
                  maskinens egen mätning var tionde centimeter, barken dras av med objektets egen barkfunktion.
                </p>
                <p style={{ margin: 0 }}>
                  {nf0(medRotkap)} av objektets {nf0(ref.stammar_objekt)} stammar har rotkap.
                  {ref.utan_sagstock > 0 && <> {nf0(ref.utan_sagstock)} fick ingen sågstock alls och är inte med, där finns inget timmer att förlora.</>}
                  {ref.utan_kurva > 0 && <> {nf0(ref.utan_kurva)} saknar kurva: Ponsse skrev kurvor först från 18 juli 2026, och stammar avverkade före det får aldrig någon.</>}
                  {' '}Färre än {MIN_STAMMAR} stammar med rotkap räknas som brus.
                </p>
                <button onClick={() => setVisaDetaljer(x => !x)} aria-expanded={visaDetaljer}
                  style={{ border: 'none', background: 'none', padding: '10px 0 4px', minHeight: 40, fontFamily: 'inherit',
                           fontSize: 12, color: SEKUNDAR, cursor: 'pointer' }}>
                  Detaljer {visaDetaljer ? '⌄' : '›'}
                </button>
                {visaDetaljer && (
                  <div style={{ fontSize: 11, lineHeight: 1.65 }}>
                    <p style={{ margin: '0 0 6px' }}>
                      Toppen är den del ovanför sista stocken som inte blev något sortiment. Bara automatiska
                      prisceller används; referensen är rotbiten som faktiskt kapades, 3,00–3,14 m.
                    </p>
                    {v && (
                      <p style={{ margin: '0 0 6px' }}>
                        Kontroll mot maskinens egna {nf0(v.n)} stockar: toppdiameter i median {tecken(v.dia_median_mm, 1)} mm
                        ({tecken(v.dia_p10, 1)} till {tecken(v.dia_p90, 1)}), volym {tecken(v.vol_median_pct, 2)} %
                        ({tecken(v.vol_p10, 2)} till {tecken(v.vol_p90, 2)}), {nf0(v.utanfor)} stockar utanför kurvan.
                        Bortom {VALIDERING_DIA_MM} mm eller {VALIDERING_VOL_PCT} % larmar vyn.
                        {v.bark && Object.keys(v.bark).length > 0 && (
                          <> Barkfunktion R² {Object.values(v.bark).map(b => nf(b.r2, 4)).join(', ')}.</>
                        )}
                      </p>
                    )}
                    <p style={{ margin: 0 }}>
                      Räknat {beraknad} ur {nf0(ref.stockar_antal)} stockar och {nf0(ref.serier_antal)} kurvor
                      {ref.maskiner.length > 0 && <>, maskin {ref.maskiner.join(', ')}</>}. Körs efter import, aldrig live.
                      {ref.anmarkning && <> Anmärkning: {ref.anmarkning}.</>}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
