'use client';

// UTBYTE AV EN STÄMPLINGSLÄNGD — vad får vi ut i timmer, kubb och massaved?
//
// Ett kalkylverktyg för att värdera en rotpost före bud. Stämplingsrapportens
// egen utbyteskalkyl är en formel med två variabler (Dgv, minsta toppdiameter)
// och ser ingen röta: Jeppshoka räknades till 86 % timmer och blev 57,6.
// Vår stockdata innehåller rötan, kröken och våra prislistor — den här sidan
// räknar stämplingslängden mot den, klass för klass och trädslag för trädslag.
//
// Samma form som rotkap, medelstam och massaved (components/Ytform.tsx):
// sammanhanget överst, talet stort och vänsterställt, ordrad, dämpad rad,
// kontroll som text, rader med › och ett tal.
//
// SPANNET STÅR ALLTID MED TALET. Rötan är den enskilt största osäkerheten
// (Åbogen 28 %, Jeppshoka 40 % av stammarna över 20 cm), så rötandelen är
// en inställning, förvald till medianen hos oss, och spannet mellan
// kvartilerna står i den dämpade raden under talet.
//
// Modellen är FÖRBERÄKNAD (stamplings_klass, stamplings_meta) av
// berakna_stamplingsmodell.py efter import. Sidan läser två små tabeller och
// räknar i webbläsaren (lib/stampling/berakna.ts) — ingen stockdata vid anrop.
// Stämplingslängden och rapportens tal sparas lokalt i webbläsaren, inte i
// databasen: det är inköparens eget räknepapper.

import { useEffect, useState, useCallback, Suspense, type ReactNode } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { medAbortRetry, arAbortFel } from '@/lib/supabaseRetry';
import { SIDA, DAMPAD, TEXT, LINJE, nf0,
         Tillbakarad, Stort, Damp, Kontroll, Mening, Rad, Rader, Teknisk, Laddar, Fel } from '@/components/Ytform';
import { berakna, tolkaLangd, jamforRapport, SLAG_NAMN, MIN_STAMMAR, ROT_FRAN_KLASS, EXTRAPOLERAD_FRAN_CM,
         type Cell, type Meta, type Rad as LangdRad, type Slag, type Rapport } from '@/lib/stampling/berakna';

const BAS = '/affarsuppfoljning/stampling';
const SLAGEN: Slag[] = ['tall', 'gran', 'ovrigt_barr'];
const NYCKEL = { langd: 'stampling.langd.v1', rapport: 'stampling.rapport.v1', rot: 'stampling.rot.v1' };
const ROTVAL = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];

type Text3 = Record<Slag, string>;
type RapportText = { m3fub: string; timmerPct: string; massaPct: string };
const TOM_TEXT: Text3 = { tall: '', gran: '', ovrigt_barr: '' };
const TOM_RAPPORT: RapportText = { m3fub: '', timmerPct: '', massaPct: '' };

// localStorage är en bekvämlighet per webbläsare, aldrig sanning: läs i
// try/catch och klara oss utan.
function las<T>(nyckel: string, fallback: T): T {
  try { const s = localStorage.getItem(nyckel); return s ? { ...fallback, ...JSON.parse(s) } : fallback; } catch { return fallback; }
}
function spara(nyckel: string, v: unknown) { try { localStorage.setItem(nyckel, JSON.stringify(v)); } catch { /* privat läge m.m. */ } }
const tal = (s: string): number | null => { const n = Number(s.replace(',', '.').replace(/\s/g, '')); return s.trim() && Number.isFinite(n) ? n : null; };

const RUTA = {
  width: '100%', boxSizing: 'border-box' as const, background: 'rgba(255,255,255,0.04)', border: LINJE, borderRadius: 8,
  color: TEXT, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 16, lineHeight: 1.5, padding: '10px 12px',
  minHeight: 44, outline: 'none',
};

/** En inmatning med etikett över: etiketten säger vad, raden under storleken. */
function Falt({ etikett, sub, children }: { etikett: string; sub?: string; children: ReactNode }) {
  return (
    <div style={{ margin: '14px 16px 0' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{etikett}</div>
      {children}
      {sub && <div style={{ fontSize: 11, color: DAMPAD, marginTop: 4, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

function Innehall() {
  const sp = useSearchParams();
  const router = useRouter();
  const vy = sp.get('vy');

  const [celler, setCeller] = useState<Cell[] | null>(null);
  const [meta, setMeta] = useState<Meta>({});
  const [uppdaterad, setUppdaterad] = useState<string | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<{ kod: string; text: string } | null>(null);
  const [tabellSaknas, setTabellSaknas] = useState(false);   // migrationen inte körd — ett eget, ärligt läge

  const [text, setText] = useState<Text3>(TOM_TEXT);
  const [rapportText, setRapportText] = useState<RapportText>(TOM_RAPPORT);
  const [rotVal, setRotVal] = useState<string>('');     // '' = medianen ur datan
  const [laddatLokalt, setLaddatLokalt] = useState(false);

  useEffect(() => {
    setText(las(NYCKEL.langd, TOM_TEXT));
    setRapportText(las(NYCKEL.rapport, TOM_RAPPORT));
    setRotVal(las<{ v: string }>(NYCKEL.rot, { v: '' }).v);
    setLaddatLokalt(true);
  }, []);
  useEffect(() => { if (laddatLokalt) spara(NYCKEL.langd, text); }, [text, laddatLokalt]);
  useEffect(() => { if (laddatLokalt) spara(NYCKEL.rapport, rapportText); }, [rapportText, laddatLokalt]);
  useEffect(() => { if (laddatLokalt) spara(NYCKEL.rot, { v: rotVal }); }, [rotVal, laddatLokalt]);

  const hamta = useCallback(async () => {
    setLaddar(true); setFel(null);
    const [k, m] = await Promise.all([
      medAbortRetry(() => supabase.from('stamplings_klass').select('*')),
      medAbortRetry(() => supabase.from('stamplings_meta').select('nyckel,varde,beraknad')),
    ]);
    const e = k.error ?? m.error;
    if (e && ((e as { code?: string }).code === 'PGRST205' || /schema cache|does not exist/i.test(e.message ?? ''))) {
      // Tabellerna finns inte: migrationen är inte körd. Inte ett fel att
      // trycka "försök igen" på — det säger vi rakt ut i stället.
      setTabellSaknas(true); setCeller([]); setMeta({}); setUppdaterad(null);
    } else if (e) {
      setFel({ kod: (e as { code?: string }).code ?? (arAbortFel(e) ? 'ABORT' : 'OKÄND'), text: e.message ?? String(e) });
      setCeller(null);
    } else {
      setTabellSaknas(false);
      // numeric kommer som text från PostgREST — talen ska vara tal.
      setCeller(((k.data ?? []) as Record<string, unknown>[]).map(r => ({
        slag: String(r.slag), klass: Number(r.klass), rot: r.rot as Cell['rot'],
        stammar: Number(r.stammar), objekt: Number(r.objekt), m3_per_stam: Number(r.m3_per_stam),
        timmer_pct: Number(r.timmer_pct), kubb_pct: Number(r.kubb_pct), massa_pct: Number(r.massa_pct), ovrigt_pct: Number(r.ovrigt_pct),
      })));
      const mm: Meta = {};
      let senast: string | null = null;
      for (const r of (m.data ?? []) as { nyckel: string; varde: string | number | null; beraknad: string }[]) {
        mm[r.nyckel] = r.varde == null ? null : Number(r.varde);
        if (!senast || r.beraknad > senast) senast = r.beraknad;
      }
      setMeta(mm); setUppdaterad(senast);
    }
    setLaddar(false);
  }, []);
  useEffect(() => { hamta(); }, [hamta]);

  const rader: LangdRad[] = SLAGEN.flatMap(s => tolkaLangd(text[s], s));
  const tradPerSlag = Object.fromEntries(SLAGEN.map(s => [s, rader.filter(r => r.slag === s).reduce((a, r) => a + r.antal, 0)])) as Record<Slag, number>;
  const rapport: Rapport = { m3fub: tal(rapportText.m3fub), timmerPct: tal(rapportText.timmerPct), massaPct: tal(rapportText.massaPct) };
  const rotNum = rotVal === '' ? null : Number(rotVal) / 100;
  const res = celler ? berakna(rader, celler, meta, rotNum) : null;
  const jamf = res ? jamforRapport(res, rapport) : null;
  const pct = (del: number, hel: number) => (hel > 0 ? nf0(100 * del / hel) : '–');
  const procent = (v: number | null | undefined) => (v == null ? '–' : nf0(100 * v));
  /** Per trädslag: timmer, kubb och massaved i m³fub och procent av trädslagets volym. */
  const slagSub = (v: { vol: number; timmer: number; kubb: number; massa: number }) =>
    `timmer ${nf0(v.timmer)} m³ (${pct(v.timmer, v.vol)} %) · kubb ${nf0(v.kubb)} (${pct(v.kubb, v.vol)} %) · massaved ${nf0(v.massa)} (${pct(v.massa, v.vol)} %)`;
  const url = (q: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [key, v] of Object.entries(q)) if (v) p.set(key, v);
    const s = p.toString();
    return s ? `${BAS}?${s}` : BAS;
  };

  if (laddar) return <div style={SIDA}><Tillbakarad href="/affarsuppfoljning" text="Affärsuppföljning" /><Laddar vad="modellen" /></div>;
  if (fel) return <div style={SIDA}><Tillbakarad href="/affarsuppfoljning" text="Affärsuppföljning" /><Fel rubrik="Modellen kunde inte hämtas" fel={fel} igen={hamta} /></div>;

  // ── Stämplingslängden ───────────────────────────────────────────────────
  if (vy === 'langd') {
    return (
      <div style={SIDA}>
        <Tillbakarad href={BAS} text="Utbyte" />
        <Stort tal={nf0(res?.trad ?? 0)} ordrad="träd i stämplingslängden">
          <Damp>{SLAGEN.map(s => `${SLAG_NAMN[s].toLowerCase()} ${nf0(tradPerSlag[s])}`).join(' · ')}</Damp>
          <Mening>
            En rad per diameterklass: diameter i centimeter och antal träd, så som stämplingslängden listar dem
            (klassmitt, jämna centimeter). Klistra in från rapporten. Övrigt barr räknas som gran.
          </Mening>
        </Stort>
        {SLAGEN.map(s => (
          <Falt key={s} etikett={SLAG_NAMN[s]} sub={`${nf0(tradPerSlag[s])} träd`}>
            <textarea value={text[s]} rows={text[s] ? Math.min(14, text[s].split('\n').length + 1) : 3}
              placeholder={s === 'gran' ? '12 116\n14 137\n16 212' : '26 3\n28 3'} spellCheck={false}
              aria-label={`Stämplingslängd ${SLAG_NAMN[s].toLowerCase()}`}
              onChange={e => setText(t => ({ ...t, [s]: e.target.value }))} style={RUTA} />
          </Falt>
        ))}
        <Rader>
          <Rad text="Rensa stämplingslängden" dampad onClick={() => setText(TOM_TEXT)} />
        </Rader>
      </div>
    );
  }

  // ── Rapportens egen kalkyl ──────────────────────────────────────────────
  if (vy === 'rapport') {
    const satt = (f: keyof RapportText) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setRapportText(t => ({ ...t, [f]: e.target.value }));
    const rT = rapport.m3fub != null && rapport.timmerPct != null ? rapport.m3fub * rapport.timmerPct / 100 : null;
    return (
      <div style={SIDA}>
        <Tillbakarad href={BAS} text="Utbyte" />
        <Stort tal={rT == null ? '–' : nf0(rT)} enhet={rT == null ? undefined : 'm³fub'} ordrad="timmer enligt rapportens utbyteskalkyl">
          <Mening>
            Stämplingsrapportens kalkyl bygger på grundytevägd medeldiameter och minsta toppdiameter. Den ser ingen
            röta och ingen krök. Skriv in rapportens tal, så står skillnaden mot vår data på första sidan.
          </Mening>
        </Stort>
        <Falt etikett="Volym, m³fub" sub="rapportens summa för hela posten">
          <input value={rapportText.m3fub} onChange={satt('m3fub')} inputMode="decimal" placeholder="2 677,1" aria-label="Rapportens volym m³fub" style={RUTA} />
        </Falt>
        <Falt etikett="Timmer, procent" sub="rapportens andel timmer av volymen">
          <input value={rapportText.timmerPct} onChange={satt('timmerPct')} inputMode="decimal" placeholder="86" aria-label="Rapportens timmerandel" style={RUTA} />
        </Falt>
        <Falt etikett="Massaved, procent" sub="valfritt">
          <input value={rapportText.massaPct} onChange={satt('massaPct')} inputMode="decimal" placeholder="14" aria-label="Rapportens massavedsandel" style={RUTA} />
        </Falt>
        <Rader>
          <Rad text="Ta bort rapportens tal" dampad onClick={() => setRapportText(TOM_RAPPORT)} />
        </Rader>
      </div>
    );
  }

  // ── Utbytet ─────────────────────────────────────────────────────────────
  const median = meta.rot20_median ?? null;
  const ingenModell = !celler || celler.length === 0;
  const underlag = !ingenModell && uppdaterad ? (
    <Mening>
      Röta = andel stammar över {ROT_FRAN_KLASS} cm med massaved i rotändan.
      Hos oss {procent(median)} % i median, {procent(meta.rot20_q1)}–{procent(meta.rot20_q3)} % mellan objekten.
      Bygger på {nf0(meta.objekt_antal ?? 0)} slutavverkningar och {nf0(meta.stammar_antal ?? 0)} stammar
      {meta.sedan_ar ? ` sedan ${meta.sedan_ar}` : ''}, uppdaterat {new Date(uppdaterad).toLocaleDateString('sv-SE')}.
      Fingervisning, inte facit.
    </Mening>
  ) : null;

  if (ingenModell) {
    return (
      <div style={SIDA}>
        <Tillbakarad href="/affarsuppfoljning" text="Affärsuppföljning" />
        <Stort tal="–" ordrad="inget räknat ännu">
          <Damp>
            {tabellSaknas
              ? 'Modelltabellerna finns inte ännu — migrationen 20261002_stamplingsmodell.sql är inte körd.'
              : 'Modellen fylls efter nästa import (berakna_stamplingsmodell.py).'}
            {' '}Stämplingslängden går att mata in redan nu.
          </Damp>
        </Stort>
        <Rader>
          <Rad text="Stämplingslängd" tal={`${nf0(res?.trad ?? 0)} träd`} onClick={() => router.push(url({ vy: 'langd' }))} />
        </Rader>
      </div>
    );
  }
  if (!res || res.trad === 0) {
    return (
      <div style={SIDA}>
        <Tillbakarad href="/affarsuppfoljning" text="Affärsuppföljning" />
        <Stort tal="–" ordrad="ingen stämplingslängd inmatad">
          <Damp>Mata in diameterklasserna ur stämplingsrapporten, så räknas utbytet enligt vår egen avverkade skog.</Damp>
          {underlag}
        </Stort>
        <Rader>
          <Rad text="Mata in stämplingslängd" onClick={() => router.push(url({ vy: 'langd' }))} />
        </Rader>
      </div>
    );
  }

  const t = res.total;
  const rotPct = res.rot == null ? null : Math.round(100 * res.rot);
  return (
    <div style={SIDA}>
      <Tillbakarad href="/affarsuppfoljning" text="Affärsuppföljning" />
      <Stort tal={nf0(t.timmer)} enhet="m³fub" ordrad={`timmer av ${nf0(res.trad)} träd`}>
        {/* Andelen, volymen och spannet ihop. Spannet är utfallet vid datans
            kvartiler i rötandel — vad samma post gav på våra bästa och sämsta
            objekt i röta. En inköpare som räknar utan spannet betalar för mycket. */}
        <Damp>
          {pct(t.timmer, t.vol)} % av {nf0(t.vol)} m³fub
          {res.spann && ` · ${nf0(res.spann.timmer[0])}–${nf0(res.spann.timmer[1])} m³ vid ${procent(res.spann.rot[0])}–${procent(res.spann.rot[1])} % röta`}
        </Damp>
        {median != null && (
          <Kontroll text={`röta ${rotPct ?? '–'} %${res.rotStandard ? ' · vår median' : ''}`} value={rotVal}
            label="Förväntad rötandel" onChange={setRotVal}>
            <option value="">{procent(median)} % — vår median</option>
            {ROTVAL.map(v => <option key={v} value={v}>{v} %</option>)}
          </Kontroll>
        )}
        {underlag}
      </Stort>
      <Rader>
        <Rad text="Kubb" tal={`${nf0(t.kubb)} m³`} hoger={`${pct(t.kubb, t.vol)} %`}
          sub={`kubb och klentimmer${res.spann ? ` · ${nf0(res.spann.kubb[0])}–${nf0(res.spann.kubb[1])} m³ i spannet` : ''}`} />
        <Rad text="Massaved" tal={`${nf0(t.massa)} m³`} hoger={`${pct(t.massa, t.vol)} %`}
          sub={`massaved, utan hemved${res.spann ? ` · ${nf0(res.spann.massa[0])}–${nf0(res.spann.massa[1])} m³ i spannet` : ''}`} />
        <Rad text="Övrigt" tal={`${nf0(t.ovrigt)} m³`} hoger={`${pct(t.ovrigt, t.vol)} %`} dampad sub="energived, avkap, oklassat" />
        <Rad text="Tall" tal={`${nf0(res.perSlag.tall.vol)} m³`} hoger={`${nf0(res.perSlag.tall.trad)} träd`}
          sub={res.perSlag.tall.trad ? slagSub(res.perSlag.tall) : undefined} dampad={!res.perSlag.tall.trad} />
        <Rad text="Gran" tal={`${nf0(res.perSlag.gran.vol)} m³`} hoger={`${nf0(res.perSlag.gran.trad)} träd`}
          sub={res.perSlag.gran.trad ? `${slagSub(res.perSlag.gran)} · övrigt barr räknat som gran` : undefined} dampad={!res.perSlag.gran.trad} />
        <Rad text="Stämplingslängd" tal={`${nf0(res.trad)} träd`} onClick={() => router.push(url({ vy: 'langd' }))}
          sub={SLAGEN.filter(s => tradPerSlag[s]).map(s => `${SLAG_NAMN[s].toLowerCase()} ${nf0(tradPerSlag[s])}`).join(' · ')} />
        <Rad text="Rapportens utbyteskalkyl" tal={jamf?.rapportTimmer != null ? `${nf0(jamf.rapportTimmer)} m³` : '–'}
          hoger={jamf ? `${nf0(jamf.rapportVol)} m³fub` : undefined}
          onClick={() => router.push(url({ vy: 'rapport' }))}
          sub={jamf?.diffTimmer != null
            ? `rapporten ${nf0(rapport.timmerPct ?? 0)} % timmer, vi ${pct(t.timmer, t.vol)} % — ${jamf.diffTimmer >= 0 ? '+' : '−'}${nf0(Math.abs(jamf.diffTimmer))} m³ timmer mot rapporten`
            : 'skriv in rapportens tal, så står skillnaden här'} />
      </Rader>
      {/* En budkalkyl måste säga vad posterna består av. Synligt, inte bakom en länk. */}
      <div style={{ margin: '16px 16px 0', fontSize: 12, color: DAMPAD, lineHeight: 1.6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 4 }}>Vad posterna består av</div>
        <div><b style={{ color: TEXT, fontWeight: 600 }}>Timmer</b> — sågtimmer enligt maskinens sortiment.</div>
        <div><b style={{ color: TEXT, fontWeight: 600 }}>Kubb</b> — kubb och klentimmer. Klentimmer går till såg som kubb och räknas därför hit.</div>
        <div><b style={{ color: TEXT, fontWeight: 600 }}>Massaved</b> — massaved.</div>
        <div><b style={{ color: TEXT, fontWeight: 600 }}>Övrigt</b> — energived, avkap och stockar maskinen inte sorterat.</div>
        <div style={{ marginTop: 4 }}>
          Hemved ingår i inget tal: det är virke som går till markägaren. Volymerna är m³fub, skördarmätt under bark,
          inte m³sk som stämplingsrapporten anger.
        </div>
      </div>
      {(res.extrapoleradeTrad > 0 || res.tuntTrad > 0 || res.saknadeTrad > 0) && (
        <div style={{ margin: '14px 16px 0', fontSize: 11, color: DAMPAD, lineHeight: 1.6 }}>
          {res.extrapoleradeTrad > 0 && <div>{nf0(res.extrapoleradeTrad)} träd är {EXTRAPOLERAD_FRAN_CM} cm eller grövre och räknas som 50–55 cm (extrapolerat).</div>}
          {res.tuntTrad > 0 && <div>{nf0(res.tuntTrad)} träd ligger i klasser där vi har färre än {MIN_STAMMAR} stammar.</div>}
          {res.saknadeTrad > 0 && <div>{nf0(res.saknadeTrad)} träd ligger i klasser utan data hos oss och räknas inte.</div>}
        </div>
      )}
      <Teknisk>
        Per trädslag och 5 cm-klass i brösthöjd: medelvolym m³fub per stam och andel timmer, kubb, massaved och övrigt, ur
        skördarens stockar på våra slutavverkningar. Mot Jeppshoka 1:14, med objektet utanför modellen: andelarna inom tre
        procentenheter, och volymen 12 % under på förrättarens stämplingslängd, för klaven hade 350 färre träd i
        32–46 cm än skördaren mätte. Volymen hänger på hur träden klavats, andelarna på skogen.
      </Teknisk>
    </div>
  );
}

export default function Stamplingsutbyte() {
  return (
    <Suspense fallback={<div style={SIDA} />}>
      <Innehall />
    </Suspense>
  );
}
