'use client';

// ROTKAP — vad kostar ett längre rotkap i timmer? Presentationen.
//
// Ren komponent: rader in, inget hämtas här. Det gör att den kan renderas
// med stillastående data utanför appen, och att sidan (page.tsx) bara har
// ett jobb — hämta och hålla valet.
//
// TRE PRINCIPER STYR YTAN:
//   Ett tal.        Timmerförändringen står ensam, stor, med luft. Raden
//                   under förklarar den — procenten ger skalan, litern per
//                   stam gör objekt jämförbara — men tävlar inte. Allt annat
//                   bor bakom ett tryck.
//   Fel skriker.    ÅTGÄRD BEHÖVS överst, vad som är fel och vad man gör —
//                   men bara för sådant som går att göra något åt. Saknade
//                   kurvor är inte det: Ponsse skrev kurvor först från
//                   2026-07-18, och det som avverkats före får aldrig någon.
//                   Det står som en stilla rad, "byggt på X av Y stammar".
//   Tomrum bär.     Är inget fel skriker ingenting. Rötvarningen är en
//                   förklaring till grupp två, inte ett larm, och står där.
//
// Allt är RÄKNAT, inte mätt. Simuleringen apterade samma stammar en gång
// till med rotbiten förlängd, mot maskinens egen prislista. Raden för 3,0 m
// är referensen: det föraren faktiskt körde. Skillnaden räknas här som
// rad(k) − rad(3,0), aldrig lagrad — så kan ett tal aldrig motsäga sin
// referens.
//
// BEGREPPEN:
//   Rotkap        första stocken kapad kort, 3,0 m, för att ta bort röta.
//   Grupp 1       sågstocken satt direkt över rotbiten. Ett längre kap tar
//                 40 cm av det grövsta virket. Det räddar ingen apterare.
//   Grupp 2       flera massabitar i rad — rötan gick längre. Sågstocken
//                 börjar där rötan slutade, så förlängningen flyttas inom
//                 massaveden. Kostar nästan inget — så länge rötan faktiskt
//                 gick längre än det nya kapet.

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

const SEKUNDAR = '#7a7a72';
const S = {
  page: { background: '#111110', minHeight: '100vh', paddingTop: 56, paddingBottom: 90,
          color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif" } as const,
  muted: { color: SEKUNDAR, fontSize: 11 } as const,
  tal: { fontFamily: "'Fraunces', serif" } as const,
  rubrik: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8,
            color: SEKUNDAR, marginTop: 22, marginBottom: 10 } as const,
};
const GUL = 'rgba(255,179,64,0.95)';
const GRON = 'rgba(90,255,140,0.9)';
const ROD = 'rgba(255,120,110,0.95)';

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
    ut.push({ objekt_id: id, namn: ref.objekt_namn ?? id, ref, valjbar: orsak === null, orsak });
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
      vad: `Kurvan stämmer inte mot maskinens egna stockar: toppdiameter ${tecken(v.dia_median_mm, 1)} mm och volym ${tecken(v.vol_median_pct, 1)} % i median. Talet går inte att lita på.`,
      gor: 'Kontrollera barkfunktionen och att rätt fil lästes för objektet, och räkna om objektet efter rättning.',
    });
  }
  for (const a of (ref.anmarkning ?? '').split('; ').filter(Boolean)) {
    if (a.includes('avviker från filen')) ut.push({
      vad: `${a}. Apteringen räknades med filens gränser, men vyerna för massaved visar de lagrade.`,
      gor: 'Kör om fönsterbackfillen för objektet och räkna om.',
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
      gor: 'Kontrollera prislistan i maskinen — sortimentet har ingen prismatris i filen.',
    });
  }
  return ut;
}

/** En stilla rad som öppnar nästa nivå. Träffyta 48 px — hytten skakar. */
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

export default function RotkapVy({ rader, valt, kaplangd, onValj, onKaplangd }: {
  rader: SimRad[]; valt: string | null; kaplangd: number;
  onValj: (objektId: string) => void; onKaplangd: (cm: number) => void;
}) {
  const [visaVar, setVisaVar] = useState(false);
  const [visaRakning, setVisaRakning] = useState(false);
  const lista = objektLista(rader);
  const obj = lista.find(o => o.objekt_id === valt) ?? null;
  const ref = obj?.ref ?? null;
  const rad = obj ? rader.find(r => r.objekt_id === obj.objekt_id && r.kaplangd_cm === kaplangd) ?? null : null;
  const skift = kaplangd - REFERENS;

  const flik = (cm: number) => (
    <button key={cm} onClick={() => onKaplangd(cm)}
      style={{ flex: 1, border: 'none', borderRadius: 7, padding: '9px 6px', minHeight: 44,
               fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer',
               background: kaplangd === cm ? 'rgba(255,255,255,0.11)' : 'transparent',
               color: kaplangd === cm ? '#e8e8e4' : SEKUNDAR }}>
      {meter(cm)} m
    </button>
  );

  // Skillnaderna — räknas här, lagras aldrig.
  const dT = ref && rad ? rad.timmer_m3 - ref.timmer_m3 : 0;
  const dK = ref && rad ? rad.kubb_m3 - ref.kubb_m3 : 0;
  const dM = ref && rad ? rad.massa_m3 - ref.massa_m3 : 0;
  const dR = ref && rad ? rad.rest_m3 - ref.rest_m3 : 0;
  const d1 = ref && rad ? rad.grupp1_timmer_m3 - ref.grupp1_timmer_m3 : 0;
  const d2 = ref && rad ? rad.grupp2_timmer_m3 - ref.grupp2_timmer_m3 : 0;
  const pct = ref && ref.timmer_m3 > 0 ? (100 * dT) / ref.timmer_m3 : 0;
  const lPerStam = ref && ref.stammar > 0 ? (1000 * dT) / ref.stammar : 0;
  const rotkapade = ref ? ref.stammar + ref.utan_sagstock + ref.utan_kurva : 0;
  const riktning = Math.abs(dT) < 0.005
    ? { ord: 'timret oförändrat', farg: SEKUNDAR }
    : dT < 0 ? { ord: 'förlorat timmer', farg: ROD } : { ord: 'vunnet timmer', farg: GRON };
  const maxGrupp = Math.max(Math.abs(d1), Math.abs(d2), 1e-9);
  const stapel = (d: number) => (
    <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.05)', marginTop: 6 }}>
      <div style={{ height: '100%', borderRadius: 2, width: `${(Math.abs(d) / maxGrupp) * 100}%`,
                    background: Math.abs(d) < 0.005 ? 'rgba(255,255,255,0.14)' : d < 0 ? ROD : GRON }} />
    </div>
  );
  const v = ref?.validering ?? null;
  const beraknad = ref ? new Date(ref.beraknad).toLocaleDateString('sv-SE') : null;
  const atg = ref ? atgarder(ref) : [];

  return (
    <div style={S.page}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        {/* Objekt utan rotkap syns men går inte att välja — att de har kurva
            men ingenting att simulera är också ett svar. */}
        <select value={obj?.objekt_id ?? ''} onChange={e => onValj(e.target.value)}
          aria-label="Objekt"
          style={{ width: '100%', minHeight: 44, padding: '0 12px', borderRadius: 9,
                   background: 'rgba(255,255,255,0.06)', color: '#e8e8e4',
                   border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'inherit', fontSize: 14 }}>
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

        <div style={{ display: 'flex', gap: 2, marginTop: 12, padding: 2, borderRadius: 9,
                      background: 'rgba(255,255,255,0.04)' }}>
          {KAPLANGDER.map(flik)}
        </div>
        <div style={{ ...S.muted, marginTop: 6, textAlign: 'center' }}>
          jämfört med {meter(REFERENS)} m som kördes
        </div>
      </div>

      {obj && !obj.valjbar && (
        <div style={{ ...S.muted, textAlign: 'center', padding: 40, lineHeight: 1.6 }}>
          Inget att simulera på {obj.namn}: {obj.orsak}.
          {obj.ref.stammar > 0 && <><br />{nf0(obj.ref.stammar)} rotkapade stammar med sågstock, gränsen är {MIN_STAMMAR}. Färre än så ger brus, inte ett tal.</>}
          {obj.ref.utan_sagstock > 0 && <><br />{nf0(obj.ref.utan_sagstock)} rotkapade stammar fick ingen sågstock alls.</>}
          {obj.ref.utan_kurva > 0 && <><br />{nf0(obj.ref.utan_kurva)} rotkapade stammar saknar kurva.</>}
        </div>
      )}

      {obj && obj.valjbar && ref && rad && (
        <div style={{ padding: '0 16px' }}>
          {/* Skriker bara när något går att göra. Annars finns rutan inte. */}
          {atg.length > 0 && (
            <div role="alert"
              style={{ marginTop: 16, padding: '14px 16px', borderRadius: 14,
                       background: 'rgba(255,120,110,0.08)', border: '1px solid rgba(255,120,110,0.35)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
                            color: ROD, marginBottom: 8 }}>Åtgärd behövs</div>
              {atg.map((a, i) => (
                <div key={i} style={{ marginTop: i === 0 ? 0 : 10 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.5 }}>{a.vad}</div>
                  <div style={{ fontSize: 12, color: SEKUNDAR, lineHeight: 1.5, marginTop: 3 }}>{a.gor}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ textAlign: 'center', padding: '48px 0 40px' }}>
            <div>
              <span style={{ ...S.tal, fontSize: 60, lineHeight: 1 }}>{tecken(dT)}</span>
              <span style={{ ...S.tal, fontSize: 22, color: SEKUNDAR, marginLeft: 6 }}>m³</span>
            </div>
            <div style={{ marginTop: 14, fontSize: 12, lineHeight: 1.6 }}>
              <span style={{ color: riktning.farg, fontWeight: 600 }}>{riktning.ord}</span>
              {/* Etiketten bär skillnaden mot resten av appen: det här talet
                  har ingen maskin mätt. */}
              <span style={{ color: GUL, fontWeight: 600 }}> · räknat, inte mätt</span>
            </div>
            {/* Raden förklarar talet, den tävlar inte med det. −7,94 m³ är
                oläsbart ensamt: procenten ger skalan, litern per stam gör
                objekt jämförbara. Som "km kvar" under ett tal. */}
            <div style={{ marginTop: 10, fontSize: 13, color: SEKUNDAR, lineHeight: 1.5 }}>
              {tecken(pct, 1)} % av timret · {tecken(lPerStam, 0)} l per stam
            </div>
            {/* Saknade kurvor är inget fel att åtgärda — stammar avverkade
                före 2026-07-18 får aldrig någon. Därför en stilla rad. */}
            <div style={{ ...S.muted, marginTop: 6 }}>
              byggt på {nf0(ref.stammar)}{rotkapade > ref.stammar ? ` av ${nf0(rotkapade)}` : ''} rotkapade stammar
            </div>
          </div>

          <Nivarad etikett="Var förlusten sitter" oppen={visaVar} onToggle={() => setVisaVar(x => !x)} />
          {visaVar && (
            <div style={{ paddingBottom: 18 }}>
              {[['Kubb', dK], ['Massaved', dM], ['Utan avsättning', dR]].map(([namn, d]) => (
                <div key={namn as string}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                           padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: 13 }}>{namn as string}</span>
                  <span>
                    <span style={{ ...S.tal, fontSize: 17 }}>{tecken(d as number)}</span>
                    <span style={{ ...S.muted, marginLeft: 3 }}>m³</span>
                  </span>
                </div>
              ))}

              <div style={S.rubrik}>Två grupper</div>
              <div style={{ padding: '6px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12 }}>Sågstock direkt över roten</span>
                  <span style={S.muted}>{nf0(ref.grupp1_stammar)} st · <span style={{ color: '#e8e8e4' }}>{tecken(d1)}</span> m³</span>
                </div>
                {stapel(d1)}
                <div style={{ ...S.muted, marginTop: 5, lineHeight: 1.5 }}>
                  Rotbiten tar {skift} cm av det grövsta virket. Det räddar ingen apterare.
                </div>
              </div>
              <div style={{ padding: '6px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12 }}>Rötan gick längre</span>
                  <span style={S.muted}>{nf0(ref.grupp2_stammar)} st · <span style={{ color: '#e8e8e4' }}>{tecken(d2)}</span> m³</span>
                </div>
                {stapel(d2)}
                {/* Rötvarningen hör hit — den förklarar den här gruppen. Den
                    är ingen avvikelse, och gul rubrik på något som inte är
                    fel lär folk att strunta i gult. */}
                <div style={{ ...S.muted, marginTop: 5, lineHeight: 1.6 }}>
                  {ref.grupp2_stammar === 0
                    ? 'Inga stammar med flera massabitar före sågstocken.'
                    : <>Sågstocken börjar där rötan slutade. Förlängningen rymdes i massaveden
                        hos {nf0(rad.grupp2_kedja_fast)} av {nf0(ref.grupp2_stammar)}
                        {rad.grupp2_kedja_fast < ref.grupp2_stammar && <> — hos resten sköts kedjan {skift} cm</>}.
                        Maskinen mäter inte röta, så var den slutade vet simuleringen inte: slutar
                        rötan inom det nya kapet vinner stammen i stället en hel sågstock, och det
                        syns inte här. Talet är ett tak på förlusten.</>}
                </div>
              </div>
            </div>
          )}

          <Nivarad etikett="Så räknas simuleringen" oppen={visaRakning} onToggle={() => setVisaRakning(x => !x)} />
          {visaRakning && (
            <div style={{ fontSize: 11, color: SEKUNDAR, lineHeight: 1.7, paddingBottom: 8 }}>
              <p style={{ margin: '0 0 8px' }}>
                {nf0(ref.stammar_objekt)} stammar på objektet, {nf0(rotkapade)} med rotkap.
                {ref.utan_sagstock > 0 && <> {nf0(ref.utan_sagstock)} av dem fick ingen sågstock alls och simuleras inte — där finns inget timmer att förlora.</>}
                {ref.utan_kurva > 0 && <> {nf0(ref.utan_kurva)} saknar kurva: Ponsse skrev avsmalningskurvor först från 18 juli 2026, och stammar avverkade före det får aldrig någon.</>}
                {' '}Bara objekt där maskinen skrev kurva i filen går att välja, och färre än {MIN_STAMMAR} rotkapade stammar räknas som brus.
              </p>
              <p style={{ margin: '0 0 8px' }}>
                Samma stammar apteras en gång till med rotbiten förlängd till {meter(kaplangd)} m,
                värdeoptimalt mot maskinens egen prislista och samma fönster föraren körde med.
                Bara automatiska prisceller används. Referensen är rotbiten som faktiskt kapades,
                3,00–3,14 m.
              </p>
              <p style={{ margin: '0 0 8px' }}>
                Stammens form kommer ur maskinens egen avsmalningskurva, en diameter var tionde
                centimeter över bark. Barken dras av med objektets egen barkfunktion ur maskinens
                över- och underbarkpar
                {v?.bark && Object.keys(v.bark).length > 0 && (
                  <> (R² {Object.values(v.bark).map(b => nf(b.r2, 4)).join(', ')})</>
                )}.
              </p>
              {v && (
                <p style={{ margin: '0 0 8px' }}>
                  Kontroll mot maskinens egna {nf0(v.n)} stockar: toppdiameter i median {tecken(v.dia_median_mm, 1)} mm
                  ({tecken(v.dia_p10, 1)} till {tecken(v.dia_p90, 1)}), volym {tecken(v.vol_median_pct, 2)} %
                  ({tecken(v.vol_p10, 2)} till {tecken(v.vol_p90, 2)}), {nf0(v.utanfor)} stockar utanför kurvan.
                  Bortom {VALIDERING_DIA_MM} mm eller {VALIDERING_VOL_PCT} % i median larmar vyn.
                </p>
              )}
              <p style={{ margin: '0 0 8px' }}>
                Utan avsättning är toppen ovanför sista stocken, det som inte blev någon produkt.
              </p>
              <p style={{ margin: ref.anmarkning ? '0 0 8px' : 0 }}>
                Räknat {beraknad} ur {nf0(ref.stockar_antal)} stockar och {nf0(ref.serier_antal)} kurvor
                {ref.maskiner.length > 0 && <>, maskin {ref.maskiner.join(', ')}</>}. Körs efter import,
                aldrig live.
              </p>
              {ref.anmarkning && (
                <p style={{ margin: 0 }}>Anmärkning från beräkningen: {ref.anmarkning}.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
