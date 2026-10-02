'use client';

// UTFALL PER MEDELSTAM — vad kan man vänta sig vid en given medelstam?
//
// Ett kalkylverktyg för att värdera en post före köp: stämplingsvyn räknar när man har
// stämplingslängden, den här när man bara har medelstammen (LRK/AU man mäter själv). Samma fråga —
// hur mycket blir timmer, kubb och massaved — och samma form (components/Ytform.tsx): sammanhanget
// överst, talet stort och vänsterställt, ordrad, dämpad rad, kontroll som text, rader med › och ett tal.
//
// En skärm, inte en lista över klasser: medelstammen skrivs in som ett tal (0,47), och svaret är den
// del av volymen som blir timmer bland objekten inom ±0,05 från det — VOLYMVÄGT, inte medianen av
// deras procenttal. Under talet en stapel med hela fördelningen, sedan en rad per sortiment med
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
import { SIDA, DAMPAD, SEKUNDAR, TEXT, LINJE, TAL, nf0, nf1, nf2, kortObjekt,
         Tillbakarad, Rubrikrad, Stort, Damp, Kontroll, Mening, Rad, Rader, Teknisk } from '@/components/Ytform';
import { Sortimentstapel, Teckenforklaring, VadPosternaBestarAv, sortimentFarg } from '@/components/Sortimentstapel';
import { RADIE } from '@/lib/design/tokens';
import {
  TYPER, SORTIMENT, SORTIMENT_NAMN, FONSTER_TYP, MIN_OBJEKT, MIN_STAMMAR, tolkaMedelstam, heltalTill100, utfall, kurva,
  planarUt, rotaLutning, rotaMedian, type Objekt, type Typ, type Platå, type Andelar,
} from '@/lib/medelstam/berakna';

export const BAS = '/affarsuppfoljning/medelstam';
export type Vy = 'huvud' | 'objekt' | 'kurva';
export type Meta = Record<string, number | null>;

const NYCKEL = 'medelstam.v2';
const ROTVAL = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
const typMany = (t: Typ) => (t === 'Slutavverkning' ? 'slutavverkningar' : 'gallringar');

type Lokalt = { typ: Typ; ms: Partial<Record<Typ, string>>; rot: string };

// localStorage är en bekvämlighet per webbläsare, aldrig sanning: läs i try/catch och klara oss utan.
function lasLokalt(): Partial<Lokalt> {
  try { const s = localStorage.getItem(NYCKEL); return s ? JSON.parse(s) : {}; } catch { return {}; }
}
function sparaLokalt(v: Lokalt) { try { localStorage.setItem(NYCKEL, JSON.stringify(v)); } catch { /* privat läge m.m. */ } }

/** Förvald medelstam för en typ: medianen över dess objekt, där underlaget är som tätast. */
function forvalMs(objekt: Objekt[]): string {
  const v = objekt.map(o => o.medelstam).sort((a, b) => a - b);
  if (!v.length) return '';
  const h = v.length >> 1;
  const med = v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2;
  return nf2(med);
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
  return (
    <div style={{ marginTop: 12 }}>
      <div role="img" aria-label={`${objekt.length} objekt längs medelstamsaxeln 0 till ${nf1(max)}`}
        style={{ position: 'relative', height: 16, borderBottom: LINJE }}>
        {m != null && (
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: pos(m - fonster), width: pos(Math.min(max, m + fonster) - Math.max(0, m - fonster)),
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
function Kurvdiagram({ objekt, m }: { objekt: Objekt[]; m: number | null }) {
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
                          fontSize: 11, fontWeight: 600, color: TEXT, whiteSpace: 'nowrap' }}>{nf2(m as number)}</div>
            <div style={{ position: 'absolute', top: 16, bottom: 0, left: `${(100 * markor) / n}%`, width: 2, transform: 'translateX(-50%)', background: TEXT, zIndex: 1 }} />
          </>
        )}
        <div role="img" aria-label={`${n} objekt, ett streck vardera, sorterade på medelstam från ${nf2(k[0]?.objekt.medelstam ?? 0)} till ${nf2(k[n - 1]?.objekt.medelstam ?? 0)}`}
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
        {etiketter.map((x, i) => <span key={i}>{nf2(x)}</span>)}
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: DAMPAD, lineHeight: 1.5 }}>
        Ett streck per objekt, sorterade på medelstam (m³/stam). Höjden är objektets hela volym; den streckade linjen är 50 %.
      </div>
    </div>
  );
}

/** Meningen under kurvan. Varje tal i den är räknat i planarUt — här sätts bara ord kring dem. */
function platamening(p: Platå, n: number): string {
  if (p.slag === 'planar') {
    return `Timmerandelen slutar stiga vid cirka ${nf2(p.brytpunkt)} m³/stam. Över det ligger de ${nf0(p.nOver)} objekten på ${nf0(p.nivaOver.timmer)} % timmer `
         + `(${nf0(p.spannOver[0])}–${nf0(p.spannOver[1])} %).`;
  }
  if (p.slag === 'stiger') {
    return `Kurvan planar inte ut i våra data. Över ${nf2(p.brytpunkt)} m³/stam stiger timmerandelen fortfarande cirka ${nf1(p.lutningOver)} procentenheter `
         + `per 0,1 m³/stam (±${nf1(p.osakerhet)}), på ${nf0(p.nOver)} objekt.`;
  }
  if (p.skal === 'fa-objekt') {
    return p.brytpunkt == null
      ? `Med ${nf0(n)} objekt går det inte att säga var kurvan planar ut.`
      : `Över ${nf2(p.brytpunkt)} m³/stam finns bara ${nf0(p.nOver)} objekt — för få för att säga var kurvan planar ut.`;
  }
  return `Det går inte att säga var kurvan planar ut: över ${nf2(p.brytpunkt ?? 0)} m³/stam är lutningen ${nf1(p.lutningOver ?? 0)} `
       + `±${nf1(p.osakerhet ?? 0)} procentenheter per 0,1 m³/stam — för osäker för att kallas stigande eller platt.`;
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

  const objTyp = useMemo(() => alla.filter(o => o.typ === typ), [alla, typ]);
  const fonster = FONSTER_TYP[typ];
  const slut = typ === 'Slutavverkning';
  const lutning = useMemo(() => (slut ? rotaLutning(alla) : null), [alla, slut]);
  const median = meta.rot20_median ?? rotaMedian(alla);
  const rotNum = rotVal === '' ? median : Number(rotVal) / 100;
  const kanRota = slut && rotLasbar && lutning != null && median != null;

  const text = msText[typ] ?? forvalMs(objTyp);
  const m = tolkaMedelstam(text);
  const u = useMemo(() => (m == null ? null : utfall(objTyp, m, kanRota ? rotNum : null, kanRota ? lutning : null, fonster)), [objTyp, m, kanRota, rotNum, lutning, fonster]);

  const pctRot = (v: number | null | undefined) => (v == null ? '–' : nf0(100 * v));
  const sedan = objTyp.map(o => o.forsta ? Number(o.forsta.slice(0, 4)) : NaN).filter(Number.isFinite).sort((a, b) => a - b)[0];
  const intervall = u ? `${nf2(Math.max(0, u.fran))} och ${nf2(u.till)}` : '';

  // ── Objekten i fönstret ──────────────────────────────────────────────
  if (vy === 'objekt' && u) {
    const sorterade = [...u.objekt].sort((a, b) => andelT(b) - andelT(a));
    return (
      <div style={SIDA}>
        <Tillbakarad href={BAS} text={`Medelstam ${nf2(u.m)}`} />
        <Stort tal={nf0(u.n)} ordrad={`objekt mellan ${intervall} m³/stam`}>
          <Damp>{typ.toLowerCase()} · {nf0(u.volym)} m³ tillsammans</Damp>
          <Mening>
            Sorterade på timmerandel, så kanterna syns. Andelarna är av objektets volym utan hemved. Snittet i talet är volymvägt,
            så de stora objekten styr det mest — volymen står på varje rad.
          </Mening>
        </Stort>
        <Rader>
          {sorterade.map(o => (
            <Rad key={o.id} text={kortObjekt(o.namn ?? o.id)}
              sub={`kubb ${nf0(100 * o.kubb / o.volym)} % · massaved ${nf0(100 * o.massa / o.volym)} % · ${nf0(o.stammar)} stammar · ${nf0(o.volym)} m³`}
              tal={`${nf0(100 * o.timmer / o.volym)} %`} hoger={`${nf2(o.medelstam)} m³/stam`} />
          ))}
        </Rader>
      </div>
    );
  }

  // ── Hela kurvan ──────────────────────────────────────────────────────
  if (vy === 'kurva') {
    const plata = planarUt(objTyp);
    return (
      <div style={SIDA}>
        <Tillbakarad href={BAS} text={m != null ? `Medelstam ${nf2(m)}` : 'Medelstam'} />
        <Stort tal={nf0(objTyp.length)} ordrad={`${typMany(typ)} längs medelstamsaxeln`}>
          <Damp>ett streck per objekt, delat i timmer, kubb, massaved och övrigt</Damp>
        </Stort>
        <div style={{ margin: '0 16px' }}>
          {objTyp.length > 0 && <Kurvdiagram objekt={objTyp} m={m} />}
          <Teckenforklaring />
          {objTyp.length > 0 && <div style={{ marginTop: 16, fontSize: 13, lineHeight: 1.6, color: TEXT }}>{platamening(plata, objTyp.length)}</div>}
          <div style={{ marginTop: 12, fontSize: 11, color: SEKUNDAR, lineHeight: 1.6 }}>
            Brytpunkten söks med en segmenterad regression över objektens timmerandel (volymvägd), med fri lutning över
            brytpunkten. ± är 95 %-intervallet. {typ === 'Slutavverkning' ? '' : 'Gallring har få objekt över brytpunkten. '}
          </div>
        </div>
      </div>
    );
  }

  // ── Huvudskärmen ─────────────────────────────────────────────────────
  const h: Andelar | null = u && !u.forFa && u.andel ? heltalTill100(u.andel) : null;
  const sp = u?.spann ?? null;
  const intSpann = (s: typeof SORTIMENT[number]) => (sp ? `${nf0(sp[s][0])}–${nf0(sp[s][1])} %` : '–');
  const ordrad = m == null ? 'skriv en medelstam' : u?.forFa ? 'för få objekt här' : 'av volymen blir timmer';
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
              <input value={text} inputMode="decimal" onFocus={e => e.target.select()} aria-label="Medelstam i kubikmeter per stam" placeholder={forvalMs(objTyp)}
                onChange={e => setMsText(t => ({ ...t, [typ]: e.target.value }))} style={RUTA} />
              <span style={{ fontSize: 13, color: DAMPAD }}>m³ per stam</span>
            </div>
            <Tathet objekt={objTyp} m={m} fonster={fonster} />
          </Falt>

          <Stort tal={h ? nf0(h.timmer) : '–'} enhet={h ? '%' : undefined} ordrad={ordrad}>
            {u && u.forFa && m != null && (
              <Damp>
                {u.n === 0 ? 'Inget objekt' : u.n === 1 ? 'Bara ett objekt' : `Bara ${nf0(u.n)} objekt`} ligger inom ±{nf2(fonster)} från {nf2(u.m)}.
                Minst {nf0(MIN_OBJEKT)} behövs för att ett snitt ska betyda något — prova en medelstam där remsan ovan är tätare.
              </Damp>
            )}
            {u && !u.forFa && sp && (
              <Damp>{nf0(u.n)} objekt i närheten gav {intSpann('timmer')}</Damp>
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
              <Mening>Röta mäts bara på slutavverkningar. Gallringens tal är fönstrets rena volymvägda snitt.</Mening>
            </div>
          )}

          <Rader>
            {u && u.n > 0 && <Rad text={`${nf0(u.n)} objekt mellan ${intervall}`} onClick={() => gaTill('objekt')} />}
            <Rad text="Hela kurvan" onClick={() => gaTill('kurva')} />
          </Rader>

          <VadPosternaBestarAv />
          <Teknisk>
            Andelen är volymvägd: summan av timmervolymen delad med summan av volymen för objekten inom ±{nf2(fonster)} m³/stam — inte
            medianen av deras procenttal. Färre än {nf0(MIN_OBJEKT)} objekt ger inget tal. Spannet är lägsta–högsta objekt.
            {kanRota && lutning && ` Röta: lutningen är skattad över ${nf0(lutning.n)} slutavverkningar — timmer ${nf2(lutning.koef.timmer / 100)} procentenheter per procentenhet röta — och fönstret flyttas från sin egen röta till den valda.`}
            {' '}Bygger på {nf0(objTyp.length)} {typMany(typ)}{Number.isFinite(sedan) ? ` sedan ${sedan}` : ''}, minst {nf0(MIN_STAMMAR)} stammar var
            {uppdaterad ? `, uppdaterat ${new Date(uppdaterad).toLocaleDateString('sv-SE')}` : ''}. Fingervisning, inte facit.
          </Teknisk>
        </>
      )}
    </div>
  );
}

const andelT = (o: Objekt) => (o.volym > 0 ? o.timmer / o.volym : 0);
