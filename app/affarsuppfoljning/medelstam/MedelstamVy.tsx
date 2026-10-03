'use client';

// UTFALL PER MEDELSTAM — vad kan man vänta sig vid en given medelstam?
//
// Ett kalkylverktyg för att värdera en post före köp: stämplingsvyn räknar när man har
// stämplingslängden, den här när man bara har medelstammen (LRK/AU man mäter själv). Samma fråga —
// hur mycket blir timmer, kubb och massaved — och samma form (components/Ytform.tsx): sammanhanget
// överst, talet stort och vänsterställt, ordrad, dämpad rad, kontroll som text, rader med › och ett tal.
//
// En skärm, inte en lista över klasser: medelstammen skrivs in som ett tal (0,47), och svaret är den
// del av volymen som blir timmer bland objekten inom ±15 % av det — VOLYMVÄGT, inte medianen av
// deras procenttal. I gallring är rubriktalet massaved i stället (timmer är under 3 % i 18 av 26 gallringar). Under talet en stapel med hela fördelningen, sedan en rad per sortiment med
// andel och spann. Spannet får aldrig döljas: vid samma stamstorlek har objekt fallit ut tio
// procentenheter isär, och den dämpade raden under talet säger det.
//
// Underlaget är tunt (ett sextiotal slutavverkningar, tre till tolv i fönstret) och det står på
// skärmen. Färre än tre objekt i fönstret ger inget tal alls — "för få objekt här".
//
// Slutavverkning och gallring blandas aldrig: kurvorna är olika. Röta räknas bara för slutavverkning
// (samma definition och förval som stämplingsvyn). All räkning finns i lib/medelstam/berakna.ts; den
// här filen visar bara. Läser utfall_objekt (förberäknad), aldrig stockdata live.
//
// Ingen jämförelse mellan inköpare: bolaget finns inte ens i underlaget.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { SIDA, DAMPAD, SEKUNDAR, TEXT, LINJE, TAL, nf, nf0, nf1, kortObjekt,
         Tillbakarad, Rubrikrad, Stort, Damp, Kontroll, Mening, Rad, Rader, Teknisk } from '@/components/Ytform';
import { Sortimentstapel, Teckenforklaring, VadPosternaBestarAv, sortimentFarg } from '@/components/Sortimentstapel';
import { RADIE } from '@/lib/design/tokens';
import {
  TYPER, SORTIMENT, SORTIMENT_NAMN, FONSTER_REL, RUBRIKTAL, MIN_OBJEKT, MIN_STAMMAR, tolkaMedelstam, heltalTill100, andelarAv, delaUrval, LOV_GRANS, utfall, kurva,
  planarUt, rotaLutning, rotaMedian, type Objekt, type Typ, type Platå, type Andelar, type Sortiment,
} from '@/lib/medelstam/berakna';

export const BAS = '/affarsuppfoljning/medelstam';
export type Vy = 'huvud' | 'objekt' | 'kurva';
export type Meta = Record<string, number | null>;

const NYCKEL = 'medelstam.v2';
const ROTVAL = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
const typMany = (t: Typ) => (t === 'Slutavverkning' ? 'slutavverkningar' : 'gallringar');
/** Gallringens medelstammar är små (0,03–0,37): tre decimaler där två skulle slå ihop objekt. */
const decimaler = (t: Typ) => (t === 'Slutavverkning' ? 2 : 3);
/** Under så här många procent timmer räknas ett objekts timmer som "nästan inget" — används i förklaringen av gallringens rubriktal. */
const LAGT_TIMMER_PCT = 3;

type Lokalt = { typ: Typ; ms: Partial<Record<Typ, string>>; rot: string };

// localStorage är en bekvämlighet per webbläsare, aldrig sanning: läs i try/catch och klara oss utan.
function lasLokalt(): Partial<Lokalt> {
  try { const s = localStorage.getItem(NYCKEL); return s ? JSON.parse(s) : {}; } catch { return {}; }
}
function sparaLokalt(v: Lokalt) { try { localStorage.setItem(NYCKEL, JSON.stringify(v)); } catch { /* privat läge m.m. */ } }

/** Förvald medelstam för en typ: medianen över dess objekt, där underlaget är som tätast. */
function forvalMs(objekt: Objekt[], dec: number): string {
  const v = objekt.map(o => o.medelstam).sort((a, b) => a - b);
  if (!v.length) return '';
  const h = v.length >> 1;
  const med = v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2;
  return nf(med, dec);
}

const RUTA = {
  width: 112, boxSizing: 'border-box' as const, background: 'rgba(255,255,255,0.04)', border: LINJE, borderRadius: 10,
  color: TEXT, ...TAL, fontSize: 20, fontWeight: 400, lineHeight: 1.2, padding: '8px 12px',
  minHeight: 44, outline: 'none',
};

/** Remsan under fältet: ett streck per avverkat objekt längs medelstamsaxeln — tätt eller glest underlag på ett ögonkast. */
function Tathet({ objekt, m, fonster }: { objekt: Objekt[]; m: number | null; fonster: number }) {
  const max = Math.max(0.1, Math.ceil(Math.max(...objekt.map(o => o.medelstam), 0) * 10 - 1e-9) / 10);
  const pos = (x: number) => `${Math.min(100, Math.max(0, (100 * x) / max))}%`;
  const inom = m != null && m <= max;
  const lo = m == null ? 0 : Math.max(0, m * (1 - fonster)), hi = m == null ? 0 : Math.min(max, m * (1 + fonster));
  return (
    <div style={{ marginTop: 12 }}>
      <div role="img" aria-label={`${objekt.length} objekt längs medelstamsaxeln 0 till ${nf1(max)}`}
        style={{ position: 'relative', height: 16, borderBottom: LINJE }}>
        {m != null && (
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: pos(lo), width: pos(hi - lo),
                        background: 'rgba(255,255,255,0.10)' }} />
        )}
        {objekt.map(o => (
          <div key={o.id} style={{ position: 'absolute', top: 2, bottom: 0, left: pos(o.medelstam), width: 1, background: DAMPAD, opacity: 0.7 }} />
        ))}
        {inom && <div style={{ position: 'absolute', top: 0, bottom: 0, left: pos(m as number), width: 2, transform: 'translateX(-50%)', background: TEXT }} />}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: SEKUNDAR }}>
        <span>0</span>
        <span>{objekt.length} objekt · {nf1(max)} m³/stam</span>
      </div>
    </div>
  );
}

/** Hela kurvan: en smal stapel per objekt, sorterade på medelstam. Inga klasser, inga hinkar. */
function Kurvdiagram({ objekt, m, ms }: { objekt: Objekt[]; m: number | null; ms: (x: number) => string }) {
  const k = kurva(objekt);
  const n = k.length;
  const markor = m == null ? null : k.filter(p => p.objekt.medelstam < m - 1e-9).length;
  const etiketter = [0, 0.25, 0.5, 0.75, 1].map(f => k[Math.min(n - 1, Math.round(f * (n - 1)))]?.objekt.medelstam).filter(x => x != null) as number[];
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ position: 'relative', paddingTop: 16 }}>
        {markor != null && n > 0 && (
          <>
            <div style={{ position: 'absolute', top: 0, left: `${Math.min(92, Math.max(8, (100 * markor) / n))}%`, transform: 'translateX(-50%)',
                          fontSize: 11, fontWeight: 600, color: TEXT, whiteSpace: 'nowrap' }}>{ms(m as number)}</div>
            <div style={{ position: 'absolute', top: 16, bottom: 0, left: `${(100 * markor) / n}%`, width: 2, transform: 'translateX(-50%)', background: TEXT, zIndex: 1 }} />
          </>
        )}
        <div role="img" aria-label={`${n} objekt, ett streck vardera, sorterade på medelstam från ${ms(k[0]?.objekt.medelstam ?? 0)} till ${ms(k[n - 1]?.objekt.medelstam ?? 0)}`}
          style={{ display: 'flex', gap: 1, height: 152, borderRadius: RADIE.stapel, overflow: 'hidden', border: LINJE, boxSizing: 'border-box',
                   position: 'relative' }}>
          {k.map(p => (
            <div key={p.objekt.id} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column-reverse' }}>
              {SORTIMENT.map(s => <div key={s} style={{ height: `${p.andel[s]}%`, background: sortimentFarg(s), flexShrink: 0 }} />)}
            </div>
          ))}
          <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: '1px dashed rgba(255,255,255,0.10)', pointerEvents: 'none' }} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: SEKUNDAR }}>
        {etiketter.map((x, i) => <span key={i}>{ms(x)}</span>)}
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: DAMPAD, lineHeight: 1.5 }}>
        Ett streck per objekt, sorterade på medelstam (m³/stam). Höjden är objektets hela volym; den streckade linjen är 50 %.
      </div>
    </div>
  );
}

/** Meningen under kurvan. Varje tal i den är räknat i planarUt — här sätts bara ord kring dem. */
function platamening(p: Platå, n: number, ms: (x: number) => string): string {
  const namn = SORTIMENT_NAMN[p.sortiment].toLowerCase();
  const andel = `${namn}andelen`;
  if (p.slag === 'planar') {
    return `${stor(andel)} slutar förändras vid cirka ${ms(p.brytpunkt)} m³/stam. Över det ligger de ${nf0(p.nOver)} objekten på ${nf0(p.nivaOver[p.sortiment])} % ${namn} `
         + `(${nf0(p.spannOver[0])}–${nf0(p.spannOver[1])} %).`;
  }
  if (p.slag === 'forandras') {
    return `Kurvan planar inte ut i våra data. Över ${ms(p.brytpunkt)} m³/stam ${p.riktning === 'stiger' ? 'stiger' : 'sjunker'} ${andel} fortfarande cirka ${nf1(Math.abs(p.lutningOver))} procentenheter `
         + `per 0,1 m³/stam (±${nf1(p.osakerhet)}), på ${nf0(p.nOver)} objekt.`;
  }
  if (p.skal === 'fa-objekt') {
    return p.brytpunkt == null
      ? `Med ${nf0(n)} objekt går det inte att säga var kurvan planar ut.`
      : `Över ${ms(p.brytpunkt)} m³/stam finns bara ${nf0(p.nOver)} objekt — för få för att säga var kurvan planar ut.`;
  }
  return `Det går inte att säga var kurvan planar ut: över ${ms(p.brytpunkt ?? 0)} m³/stam är lutningen ${nf1(p.lutningOver ?? 0)} `
       + `±${nf1(p.osakerhet ?? 0)} procentenheter per 0,1 m³/stam — för osäker för att kallas stigande, sjunkande eller platt.`;
}
const stor = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** De lövdominerade objekten som hålls utanför — med namn och andel, aldrig tyst. */
function Utanfor({ objekt, grans }: { objekt: Objekt[]; grans: number | null }) {
  if (!objekt.length || grans == null) return null;
  const n = objekt.length;
  const lista = objekt.map(o => `${kortObjekt(o.namn ?? o.id)} (${nf0((100 * (o.lov ?? 0)) / o.volym)} % löv)`).join(', ');
  return (
    <Mening>
      <b style={{ color: TEXT, fontWeight: 600 }}>Utanför kalkylen:</b>{' '}
      {n === 1 ? 'ett lövdominerat objekt' : `${nf0(n)} lövdominerade objekt`} — {lista}. Över {nf0(100 * grans)} % löv av volymen: där avgör arten
      utfallet och inte stamstorleken, så de ingår varken i fönster, spann eller kurva.
    </Mening>
  );
}

function Falt({ etikett, sub, children }: { etikett: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ margin: '4px 16px 0' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{etikett}</div>
      {children}
      {sub && <div style={{ fontSize: 11, color: DAMPAD, marginTop: 4, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

export type Props = {
  alla: Objekt[];                 // utfall_objekt ⋈ dim_objekt, filtrerat till de två huvudtyperna och minst MIN_STAMMAR stammar
  meta: Meta;                     // stamplings_meta (rot20_median m.fl.)
  uppdaterad: string | null;      // max(kontrollerad)
  rotLasbar: boolean;             // objektens rot20 går att läsa (annars görs ingen rötajustering)
  vy: Vy;
  gaTill: (vy: Vy) => void;
  start?: { typ?: Typ; ms?: string; rot?: string };   // för rendering utan lagring (verifiering)
};

export default function MedelstamVy({ alla, meta, uppdaterad, rotLasbar, vy, gaTill, start }: Props) {
  const [typ, setTyp] = useState<Typ>(start?.typ ?? 'Slutavverkning');
  const [msText, setMsText] = useState<Partial<Record<Typ, string>>>(start?.ms != null ? { [start.typ ?? 'Slutavverkning']: start.ms } : {});
  const [rotVal, setRotVal] = useState<string>(start?.rot ?? '');     // '' = medianen ur datan
  const [laddatLokalt, setLaddatLokalt] = useState(false);

  useEffect(() => {
    if (!start) {
      const l = lasLokalt();
      if (l.typ && TYPER.includes(l.typ)) setTyp(l.typ);
      if (l.ms) setMsText(l.ms);
      if (typeof l.rot === 'string') setRotVal(l.rot);
    }
    setLaddatLokalt(true);
  }, [start]);
  useEffect(() => { if (laddatLokalt && !start) sparaLokalt({ typ, ms: msText, rot: rotVal }); }, [typ, msText, rotVal, laddatLokalt, start]);

  const urval = useMemo(() => delaUrval(alla), [alla]);       // lövdominerade objekt ligger i urval.utanfor — redovisas, räknas inte
  const objTyp = useMemo(() => urval.med.filter(o => o.typ === typ), [urval, typ]);
  const utanforTyp = useMemo(() => urval.utanfor.filter(o => o.typ === typ).sort((a, b) => (b.lov ?? 0) / b.volym - (a.lov ?? 0) / a.volym), [urval, typ]);
  const fonster = FONSTER_REL;
  const slut = typ === 'Slutavverkning';
  const rubrik: Sortiment = RUBRIKTAL[typ];
  const rubrikNamn = SORTIMENT_NAMN[rubrik].toLowerCase();
  const dec = decimaler(typ);
  const ms = (x: number) => nf(x, dec);
  const lutning = useMemo(() => (slut ? rotaLutning(urval.med) : null), [urval, slut]);
  const median = meta.rot20_median ?? rotaMedian(urval.med);
  const rotNum = rotVal === '' ? median : Number(rotVal) / 100;
  const kanRota = slut && rotLasbar && lutning != null && median != null;

  const text = msText[typ] ?? forvalMs(objTyp, dec);
  const m = tolkaMedelstam(text);
  const u = useMemo(() => (m == null ? null : utfall(objTyp, m, kanRota ? rotNum : null, kanRota ? lutning : null, fonster)), [objTyp, m, kanRota, rotNum, lutning, fonster]);

  const pctRot = (v: number | null | undefined) => (v == null ? '–' : nf0(100 * v));
  const sedan = objTyp.map(o => o.forsta ? Number(o.forsta.slice(0, 4)) : NaN).filter(Number.isFinite).sort((a, b) => a - b)[0];
  const intervall = u ? `${ms(Math.max(0, u.fran))} och ${ms(u.till)}` : '';
  const andelR = (o: Objekt) => andelarAv(o)[rubrik] / 100;

  // ── Objekten i fönstret ──────────────────────────────────────────────
  if (vy === 'objekt' && u) {
    const sorterade = [...u.objekt].sort((a, b) => andelR(b) - andelR(a));
    return (
      <div style={SIDA}>
        <Tillbakarad href={BAS} text={`Medelstam ${ms(u.m)}`} />
        <Stort tal={nf0(u.n)} ordrad={`objekt mellan ${intervall} m³/stam`}>
          <Damp>{typ.toLowerCase()} · {nf0(u.volym)} m³ tillsammans</Damp>
          <Mening>
            Sorterade på {rubrikNamn}andel, så kanterna syns. Andelarna är av objektets volym utan hemved. Snittet i talet är volymvägt,
            så de stora objekten styr det mest — volymen står på varje rad.
          </Mening>
        </Stort>
        <Rader>
          {sorterade.map(o => (
            <Rad key={o.id} text={kortObjekt(o.namn ?? o.id)}
              sub={`${SORTIMENT.filter(x => x !== rubrik && x !== 'ovrigt').map(x => `${SORTIMENT_NAMN[x].toLowerCase()} ${nf0(andelarAv(o)[x])} %`).join(' · ')} · ${nf0(o.stammar)} stammar · ${nf0(o.volym)} m³`}
              tal={`${nf0(100 * andelR(o))} %`} hoger={`${ms(o.medelstam)} m³/stam`} />
          ))}
        </Rader>
      </div>
    );
  }

  // ── Hela kurvan ──────────────────────────────────────────────────────
  if (vy === 'kurva') {
    const plata = planarUt(objTyp, rubrik);
    return (
      <div style={SIDA}>
        <Tillbakarad href={BAS} text={m != null ? `Medelstam ${ms(m)}` : 'Medelstam'} />
        <Stort tal={nf0(objTyp.length)} ordrad={`${typMany(typ)} längs medelstamsaxeln`}>
          <Damp>ett streck per objekt, delat i timmer, kubb, massaved och övrigt</Damp>
        </Stort>
        <div style={{ margin: '0 16px' }}>
          {objTyp.length > 0 && <Kurvdiagram objekt={objTyp} m={m} ms={ms} />}
          <Teckenforklaring />
          {objTyp.length > 0 && <div style={{ marginTop: 16, fontSize: 13, lineHeight: 1.6, color: TEXT }}>{platamening(plata, objTyp.length, ms)}</div>}
          <Utanfor objekt={utanforTyp} grans={LOV_GRANS[typ]} />
          <div style={{ marginTop: 12, fontSize: 11, color: SEKUNDAR, lineHeight: 1.6 }}>
            Brytpunkten söks med en segmenterad regression över objektens {rubrikNamn}andel (volymvägd), med fri lutning över
            brytpunkten. ± är 95 %-intervallet.
          </div>
        </div>
      </div>
    );
  }

  // ── Huvudskärmen ─────────────────────────────────────────────────────
  const h: Andelar | null = u && !u.forFa && u.andel ? heltalTill100(u.andel) : null;
  const sp = u?.spann ?? null;
  const intSpann = (s: Sortiment) => (sp ? `${nf0(sp[s][0])}–${nf0(sp[s][1])} %` : '–');
  const ordrad = m == null ? 'skriv en medelstam' : u?.forFa ? 'för få objekt här' : `av volymen blir ${rubrikNamn}`;
  const finns = objTyp.length > 0;

  return (
    <div style={SIDA}>
      <Tillbakarad href="/affarsuppfoljning" text="Affärsuppföljning" />
      <Rubrikrad text={typ} value={typ} label="Avverkningstyp" onChange={v => setTyp(v as Typ)}>
        {TYPER.map(t => <option key={t} value={t}>{t}</option>)}
      </Rubrikrad>

      {!finns ? (
        <Stort tal="–" ordrad={`inga ${typMany(typ)} räknade`}>
          <Damp>Tabellen fylls efter nästa import.</Damp>
        </Stort>
      ) : (
        <>
          <Falt etikett="Medelstam" sub={m == null && text.trim() ? 'Skriv medelstammen som ett tal, till exempel 0,47.' : undefined}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input value={text} inputMode="decimal" onFocus={e => e.target.select()} aria-label="Medelstam i kubikmeter per stam" placeholder={forvalMs(objTyp, dec)}
                onChange={e => setMsText(t => ({ ...t, [typ]: e.target.value }))} style={RUTA} />
              <span style={{ fontSize: 13, color: DAMPAD }}>m³ per stam</span>
            </div>
            <Tathet objekt={objTyp} m={m} fonster={fonster} />
          </Falt>

          <Stort tal={h ? nf0(h[rubrik]) : '–'} enhet={h ? '%' : undefined} ordrad={ordrad}>
            {u && u.forFa && m != null && (
              <Damp>
                {u.n === 0 ? 'Inget objekt' : u.n === 1 ? 'Bara ett objekt' : `Bara ${nf0(u.n)} objekt`} ligger inom ±{nf0(100 * fonster)} % av {ms(u.m)} ({intervall.replace(' och ', '–')}).
                Minst {nf0(MIN_OBJEKT)} behövs för att ett snitt ska betyda något — prova en medelstam där remsan ovan är tätare.
              </Damp>
            )}
            {u && !u.forFa && sp && (
              <Damp>{nf0(u.n)} objekt i närheten gav {intSpann(rubrik)}</Damp>
            )}
          </Stort>

          {h && u?.andel && (
            <div style={{ margin: '0 16px' }}>
              <Sortimentstapel andel={u.andel} hela={h} />
            </div>
          )}

          {h && (
            <Rader>
              {SORTIMENT.map(s => (
                <Rad key={s} prick={sortimentFarg(s)} text={SORTIMENT_NAMN[s]} tal={`${nf0(h[s])} %`} hoger={intSpann(s)}
                  dampad={s === 'ovrigt'}
                  sub={s === 'kubb' ? 'kubb och klentimmer' : s === 'ovrigt' ? 'energived, avkap, oklassat' : undefined} />
              ))}
            </Rader>
          )}

          {/* Lövdominerade objekt som hålls utanför — aldrig tyst, och nära talen de påverkar. */}
          <div style={{ margin: '0 16px' }}><Utanfor objekt={utanforTyp} grans={LOV_GRANS[typ]} /></div>

          {/* Rötan: samma definition och förval som stämplingsvyn. Bara slutavverkning. */}
          {slut && kanRota && (
            <div style={{ margin: '12px 16px 0' }}>
              <Kontroll text={`röta ${pctRot(rotNum)} %${rotVal === '' ? ' · vår median' : ''}`} value={rotVal} label="Förväntad rötandel" onChange={setRotVal}>
                <option value="">{pctRot(median)} % — vår median</option>
                {ROTVAL.map(v => <option key={v} value={v}>{v} %</option>)}
              </Kontroll>
              <Mening>
                Röta = andel stammar över 20 cm med massaved i rotändan. Hos oss {pctRot(median)} % i median
                {meta.rot20_q1 != null && meta.rot20_q3 != null ? `, ${pctRot(meta.rot20_q1)}–${pctRot(meta.rot20_q3)} % mellan objekten` : ''}.
                {u && !u.forFa && u.rotFonster != null && u.rotJusterad &&
                  ` Objekten i fönstret hade ${pctRot(u.rotFonster)} %; talen är räknade för ${pctRot(rotNum)} %.`}
                {u && !u.forFa && u.rotFonster == null &&
                  ' Fönstrets objekt saknar mätt röta, så talen är fönstrets rena snitt.'}
              </Mening>
            </div>
          )}
          {slut && !kanRota && (
            <div style={{ margin: '12px 16px 0' }}>
              <Mening>
                Rötan går inte att räkna in: {!rotLasbar ? 'objektens rötandel är inte läsbar för din inloggning ännu' : 'för få slutavverkningar med mätt röta'}.
                Talen är fönstrets rena volymvägda snitt, utan justering för röta.
              </Mening>
            </div>
          )}
          {!slut && (
            <div style={{ margin: '12px 16px 0' }}>
              <Mening>
                Rubriktalet är massaved: timmer är under {nf0(LAGT_TIMMER_PCT)} % i {nf0(objTyp.filter(o => 100 * o.timmer / o.volym < LAGT_TIMMER_PCT).length)} av {nf0(objTyp.length)} gallringar,
                så det är massavedsandelen som följer medelstammen. Lövrik gallring är normal och ingår — björken hamnar i massaveden. Röta mäts bara på
                slutavverkningar; gallringens tal är fönstrets rena volymvägda snitt.
              </Mening>
            </div>
          )}

          <Rader>
            {u && u.n > 0 && <Rad text={`${nf0(u.n)} objekt mellan ${intervall}`} onClick={() => gaTill('objekt')} />}
            <Rad text="Hela kurvan" onClick={() => gaTill('kurva')} />
          </Rader>

          <VadPosternaBestarAv />
          <Teknisk>
            Andelen är volymvägd: summan av sortimentets volym delad med summan av volymen för objekten inom ±{nf0(100 * fonster)} % av vald
            medelstam — inte medianen av deras procenttal. Färre än {nf0(MIN_OBJEKT)} objekt ger inget tal. Spannet är lägsta–högsta objekt.
            {kanRota && lutning && ` Röta: lutningen är skattad över ${nf0(lutning.n)} slutavverkningar — timmer ${nf(lutning.koef.timmer / 100, 2)} procentenheter per procentenhet röta — och fönstret flyttas från sin egen röta till den valda.`}
            {' '}Bygger på {nf0(objTyp.length)} {typMany(typ)}{Number.isFinite(sedan) ? ` sedan ${sedan}` : ''}, minst {nf0(MIN_STAMMAR)} stammar var
            {utanforTyp.length > 0 ? ` (${nf0(utanforTyp.length)} lövdominerat utanför, se ovan)` : ''}
            {uppdaterad ? `, uppdaterat ${new Date(uppdaterad).toLocaleDateString('sv-SE')}` : ''}. Fingervisning, inte facit.
          </Teknisk>
        </>
      )}
    </div>
  );
}

