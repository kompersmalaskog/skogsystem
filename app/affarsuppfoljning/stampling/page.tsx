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
// YTAN ÄR TAL OCH KORTA ETIKETTER. Det som förklarar talen (röta, vad posterna består av, hur PDF:en läses och kontrolleras, rapportens
// kalkyl, fotnoter) bor en nivå in, på Så räknas (?vy=sa-raknas). Tall och Gran är rader som öppnar sin fördelning (?vy=tradslag).
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
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { medAbortRetry, arAbortFel } from '@/lib/supabaseRetry';
import { SIDA, DAMPAD, TEXT, LINJE, nf0,
         Tillbakarad, Stort, Damp, Kontroll, Mening, Rad, Rader, Teknisk, Stycken, Laddar, Fel } from '@/components/Ytform';
import { berakna, tolkaLangd, jamforRapport, SLAG_NAMN, MIN_STAMMAR, ROT_FRAN_KLASS, EXTRAPOLERAD_FRAN_CM,
         type Cell, type Meta, type Rad as LangdRad, type Slag, type Rapport } from '@/lib/stampling/berakna';
import { VadPosternaBestarAv, sortimentFarg } from '@/components/Sortimentstapel';
import RapportLas from './RapportLas';
import { tillLangdText } from '@/lib/stampling/pdf/kontroll';
import type { Rapport as PdfRapport } from '@/lib/stampling/pdf/klient';
import type { Lasning } from '@/lib/stampling/pdf/rapport';

const BAS = '/affarsuppfoljning/stampling';
const SLAGEN: Slag[] = ['tall', 'gran', 'ovrigt_barr'];
const NYCKEL = { langd: 'stampling.langd.v1', rapport: 'stampling.rapport.v1', rot: 'stampling.rot.v1', aktiv: 'stampling.aktivrapport.v1' };

/** Den inlästa PDF-rapporten som stämplingslängden kommer från — visas överst på resultatet. */
type AktivRapport = { id: string; namn: string | null; forrattare: string | null; datum: string | null; total: number | null; filnamn: string };
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
  const [aktiv, setAktiv] = useState<AktivRapport | null>(null);

  useEffect(() => {
    setText(las(NYCKEL.langd, TOM_TEXT));
    setRapportText(las(NYCKEL.rapport, TOM_RAPPORT));
    setRotVal(las<{ v: string }>(NYCKEL.rot, { v: '' }).v);
    setAktiv(las<AktivRapport | null>(NYCKEL.aktiv, null));
    setLaddatLokalt(true);
  }, []);
  useEffect(() => { if (laddatLokalt) spara(NYCKEL.langd, text); }, [text, laddatLokalt]);
  useEffect(() => { if (laddatLokalt) spara(NYCKEL.rapport, rapportText); }, [rapportText, laddatLokalt]);
  useEffect(() => { if (laddatLokalt) spara(NYCKEL.rot, { v: rotVal }); }, [rotVal, laddatLokalt]);
  useEffect(() => {
    if (!laddatLokalt) return;
    if (aktiv) spara(NYCKEL.aktiv, aktiv); else { try { localStorage.removeItem(NYCKEL.aktiv); } catch { /* ignorerar */ } }
  }, [aktiv, laddatLokalt]);

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
  const url = (q: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [key, v] of Object.entries(q)) if (v) p.set(key, v);
    const s = p.toString();
    return s ? `${BAS}?${s}` : BAS;
  };

  // En inläst rapport som KONTROLLEN godkänt (RapportLas anropar bara det när allt stämmer): längden in, räkna direkt.
  const anvandRapport = (r: PdfRapport, l: Lasning) => {
    setText({ ...TOM_TEXT, ...tillLangdText(l) });
    setAktiv({ id: r.id, namn: l.post.namn ?? r.namn, forrattare: l.post.forrattare, datum: l.post.datum, total: l.post.total_volym_m3sk, filnamn: r.filnamn });
    router.push(BAS);
  };

  if (laddar) return <div style={SIDA}><Tillbakarad href="/affarsuppfoljning/rakna" text="Räkna" /><Laddar vad="modellen" /></div>;
  if (fel) return <div style={SIDA}><Tillbakarad href="/affarsuppfoljning/rakna" text="Räkna" /><Fel rubrik="Modellen kunde inte hämtas" fel={fel} igen={hamta} /></div>;

  // ── Stämplingsrapport som PDF ───────────────────────────────────────────
  if (vy === 'pdf') {
    return (
      <div style={SIDA}>
        <RapportLas bas={BAS} id={sp.get('id')} kor={sp.get('kor') === '1'} anvand={anvandRapport}
          oppna={id => router.replace(url({ vy: 'pdf', id: id ?? undefined }), { scroll: false })}
          manuellt={() => router.push(url({ vy: 'langd' }))} saRaknas={() => router.push(url({ vy: 'sa-raknas' }))} />
      </div>
    );
  }

  // ── Stämplingslängden ───────────────────────────────────────────────────
  if (vy === 'langd') {
    return (
      <div style={SIDA}>
        <Tillbakarad href={BAS} text="Utbyte" />
        <Stort tal={nf0(res?.trad ?? 0)} ordrad="träd i stämplingslängden">
          <Damp>{SLAGEN.map(s => `${SLAG_NAMN[s].toLowerCase()} ${nf0(tradPerSlag[s])}`).join(' · ')}</Damp>
          <Mening>En rad per klass: diameter, antal.</Mening>
        </Stort>
        {SLAGEN.map(s => (
          <Falt key={s} etikett={SLAG_NAMN[s]} sub={`${nf0(tradPerSlag[s])} träd`}>
            <textarea value={text[s]} rows={text[s] ? Math.min(14, text[s].split('\n').length + 1) : 3}
              placeholder={s === 'gran' ? '12 116\n14 137\n16 212' : '26 3\n28 3'} spellCheck={false}
              aria-label={`Stämplingslängd ${SLAG_NAMN[s].toLowerCase()}`}
              onChange={e => { setAktiv(null); setText(t => ({ ...t, [s]: e.target.value })); }} style={RUTA} />
          </Falt>
        ))}
        <Rader>
          <Rad text="Rensa" dampad onClick={() => { setAktiv(null); setText(TOM_TEXT); }} />
          <Rad text="Ladda upp PDF" dampad onClick={() => router.push(url({ vy: 'pdf' }))} />
          <Rad text="Så räknas" onClick={() => router.push(url({ vy: 'sa-raknas' }))} />
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
        <Stort tal={rT == null ? '–' : nf0(rT)} enhet={rT == null ? undefined : 'm³fub'} ordrad="timmer enligt rapportens utbyteskalkyl" />
        <Falt etikett="Volym, m³fub">
          <input value={rapportText.m3fub} onChange={satt('m3fub')} inputMode="decimal" placeholder="2 677,1" aria-label="Rapportens volym m³fub" style={RUTA} />
        </Falt>
        <Falt etikett="Timmer, procent">
          <input value={rapportText.timmerPct} onChange={satt('timmerPct')} inputMode="decimal" placeholder="86" aria-label="Rapportens timmerandel" style={RUTA} />
        </Falt>
        <Falt etikett="Massaved, procent" sub="valfritt">
          <input value={rapportText.massaPct} onChange={satt('massaPct')} inputMode="decimal" placeholder="14" aria-label="Rapportens massavedsandel" style={RUTA} />
        </Falt>
        <Rader>
          <Rad text="Ta bort" dampad onClick={() => setRapportText(TOM_RAPPORT)} />
          <Rad text="Så räknas" onClick={() => router.push(url({ vy: 'sa-raknas' }))} />
        </Rader>
      </div>
    );
  }

  // ── Utbytet ─────────────────────────────────────────────────────────────
  const median = meta.rot20_median ?? null;
  const ingenModell = !celler || celler.length === 0;
  const underlag = !ingenModell && uppdaterad ? (
    <p style={{ margin: '0 0 8px' }}>
      Röta = andel stammar över {ROT_FRAN_KLASS} cm med massaved i rotändan.
      Hos oss {procent(median)} % i median, {procent(meta.rot20_q1)}–{procent(meta.rot20_q3)} % mellan objekten.
      Bygger på {nf0(meta.objekt_antal ?? 0)} slutavverkningar och {nf0(meta.stammar_antal ?? 0)} stammar
      {meta.sedan_ar ? ` sedan ${meta.sedan_ar}` : ''}, uppdaterat {new Date(uppdaterad).toLocaleDateString('sv-SE')}.
      Fingervisning, inte facit.
    </p>
  ) : null;

  // ── Så räknas: allt som förklarar talen bor här, en nivå in ─────────────────────────────────────────
  if (vy === 'sa-raknas') {
    const para = { margin: '0 0 8px' } as const;
    return (
      <div style={SIDA}>
        <Tillbakarad href={BAS} text="Utbyte" />
        <Stycken>
          {underlag}
          <p style={para}>
            Stämplingslängden är en rad per diameterklass: diameter i centimeter och antal träd, så som stämplingslängden listar dem
            (klassmitt, jämna centimeter). Klistra in från rapporten. Övrigt barr räknas som gran.
          </p>
          <p style={para}>
            Har du rapporten som PDF går det snabbare och säkrare att ladda upp den, även inskannad. AI:n läser tabellerna; koden kontrollerar att antalet och
            volymen per trädslag stämmer mot rapportens egna summor innan något räknas. AI:n läser bara — summorna kontrolleras med vanlig kod mot
            rapportens egna tryckta summor, per trädslag, på antal och på volym m³sk. Antalet ska stämma exakt; volymen tillåts avvika med avrundningen.
            Rapporten och resultatet sparas.
          </p>
          <p style={para}>
            Stämplingsrapportens egen kalkyl bygger på grundytevägd medeldiameter och minsta toppdiameter. Den ser ingen röta och ingen krök. Skriv in
            rapportens tal, så står skillnaden mot vår data på utbytessidan.
          </p>
          {res && res.extrapoleradeTrad > 0 && <p style={para}>{nf0(res.extrapoleradeTrad)} träd är {EXTRAPOLERAD_FRAN_CM} cm eller grövre och räknas som 50–55 cm (extrapolerat).</p>}
          {res && res.tuntTrad > 0 && <p style={para}>{nf0(res.tuntTrad)} träd ligger i klasser där vi har färre än {MIN_STAMMAR} stammar.</p>}
          {res && res.saknadeTrad > 0 && <p style={para}>{nf0(res.saknadeTrad)} träd ligger i klasser utan data hos oss och räknas inte.</p>}
        </Stycken>
        <VadPosternaBestarAv />
        <Teknisk>
          Per trädslag och 5 cm-klass i brösthöjd: medelvolym m³fub per stam och andel timmer, kubb, massaved och övrigt, ur
          skördarens stockar på våra slutavverkningar. Mot Jeppshoka 1:14, med objektet utanför modellen: andelarna inom tre
          procentenheter, och volymen 12 % under på förrättarens stämplingslängd, för klaven hade 350 färre träd i
          32–46 cm än skördaren mätte. Volymen hänger på hur träden klavats, andelarna på skogen.
        </Teknisk>
      </div>
    );
  }

  if (ingenModell) {
    return (
      <div style={SIDA}>
        <Tillbakarad href="/affarsuppfoljning/rakna" text="Räkna" />
        <Stort tal="–" ordrad="inget räknat ännu">
          <Damp>
            {tabellSaknas
              ? 'Modelltabellerna finns inte ännu — migrationen 20261002_stamplingsmodell.sql är inte körd.'
              : 'Modellen fylls efter nästa import (berakna_stamplingsmodell.py).'}
            {' '}Stämplingslängden går att mata in redan nu.
          </Damp>
        </Stort>
        <Rader>
          <Rad text="Ladda upp PDF" onClick={() => router.push(url({ vy: 'pdf' }))} />
          <Rad text="Mata in" dampad onClick={() => router.push(url({ vy: 'langd' }))} />
        </Rader>
      </div>
    );
  }
  if (!res || res.trad === 0) {
    return (
      <div style={SIDA}>
        <Tillbakarad href="/affarsuppfoljning/rakna" text="Räkna" />
        <Stort tal="–" ordrad="ingen stämplingslängd inmatad" />
        <Rader>
          <Rad text="Ladda upp PDF" onClick={() => router.push(url({ vy: 'pdf' }))} />
          <Rad text="Mata in" dampad onClick={() => router.push(url({ vy: 'langd' }))} />
        </Rader>
      </div>
    );
  }

  // ── Ett trädslag: fördelningen i timmer, kubb och massaved. Tall och gran prissätts olika, så den hör till budet. ──
  if (vy === 'tradslag') {
    const slag: 'tall' | 'gran' = sp.get('slag') === 'gran' ? 'gran' : 'tall';
    const v = res.perSlag[slag];
    return (
      <div style={SIDA}>
        <Tillbakarad href={BAS} text="Utbyte" />
        <Stort tal={nf0(v.vol)} enhet="m³fub" ordrad={`${slag}, ${nf0(v.trad)} träd`}>
          {slag === 'gran' && <Mening>Övrigt barr är räknat som gran.</Mening>}
        </Stort>
        <Rader>
          <Rad prick={sortimentFarg('timmer')} text="Timmer" tal={`${nf0(v.timmer)} m³`} hoger={`${pct(v.timmer, v.vol)} %`} />
          <Rad prick={sortimentFarg('kubb')} text="Kubb" tal={`${nf0(v.kubb)} m³`} hoger={`${pct(v.kubb, v.vol)} %`} />
          <Rad prick={sortimentFarg('massa')} text="Massaved" tal={`${nf0(v.massa)} m³`} hoger={`${pct(v.massa, v.vol)} %`} />
        </Rader>
      </div>
    );
  }

  const t = res.total;
  const rotPct = res.rot == null ? null : Math.round(100 * res.rot);
  const slagRad = (s: 'tall' | 'gran') => {
    const v = res.perSlag[s];
    return <Rad key={s} text={s === 'tall' ? 'Tall' : 'Gran'} tal={`${nf0(v.vol)} m³`} hoger={`${nf0(v.trad)} träd`} dampad={!v.trad}
      onClick={v.trad ? () => router.push(url({ vy: 'tradslag', slag: s })) : undefined} />;
  };
  return (
    <div style={SIDA}>
      <Tillbakarad href="/affarsuppfoljning/rakna" text="Räkna" />
      {aktiv && (
        <Link href={url({ vy: 'pdf', id: aktiv.id })} style={{ display: 'block', margin: '0 16px', paddingBottom: 12, borderBottom: LINJE, textDecoration: 'none', color: 'inherit' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>{aktiv.namn ?? aktiv.filnamn}</span>
            <span style={{ color: DAMPAD, fontSize: 15 }}>›</span>
          </div>
          <div style={{ fontSize: 12, color: DAMPAD, lineHeight: 1.6 }}>
            {[aktiv.forrattare, aktiv.datum, aktiv.total != null ? `${nf0(aktiv.total)} m³sk` : null].filter(Boolean).join(' · ')}
          </div>
        </Link>
      )}
      <Stort tal={nf0(t.timmer)} enhet="m³fub" ordrad={`timmer av ${nf0(res.trad)} träd`}>
        {/* Andelen, volymen och spannet ihop. Spannet är utfallet vid datans
            kvartiler i rötandel — vad samma post gav på våra bästa och sämsta
            objekt i röta. En inköpare som räknar utan spannet betalar för mycket. */}
        <Damp>
          {pct(t.timmer, t.vol)} % av {nf0(t.vol)} m³fub
          {res.spann && ` · ${nf0(res.spann.timmer[0])}–${nf0(res.spann.timmer[1])} m³ vid ${procent(res.spann.rot[0])}–${procent(res.spann.rot[1])} % röta`}
        </Damp>
        {median != null && (
          <Kontroll text={`röta ${rotPct ?? '–'} %`} value={rotVal}
            label="Förväntad rötandel" onChange={setRotVal}>
            <option value="">{procent(median)} % — vår median</option>
            {ROTVAL.map(v => <option key={v} value={v}>{v} %</option>)}
          </Kontroll>
        )}
        {/* Den enda förklarande meningen på ytan: ett bud ska aldrig läsas som ett facit. */}
        <Mening>Fingervisning, inte facit.</Mening>
      </Stort>
      <Rader>
        <Rad text="Kubb" tal={`${nf0(t.kubb)} m³`} hoger={`${pct(t.kubb, t.vol)} %`}
          sub={res.spann ? `${nf0(res.spann.kubb[0])}–${nf0(res.spann.kubb[1])} m³` : undefined} />
        <Rad text="Massaved" tal={`${nf0(t.massa)} m³`} hoger={`${pct(t.massa, t.vol)} %`}
          sub={res.spann ? `${nf0(res.spann.massa[0])}–${nf0(res.spann.massa[1])} m³` : undefined} />
        <Rad text="Övrigt" tal={`${nf0(t.ovrigt)} m³`} hoger={`${pct(t.ovrigt, t.vol)} %`} dampad />
        {slagRad('tall')}
        {slagRad('gran')}
        <Rad text="Stämplingslängd" tal={`${nf0(res.trad)} träd`} onClick={() => router.push(url({ vy: 'langd' }))} />
        <Rad text="Rapportens utbyteskalkyl" tal={jamf?.rapportTimmer != null ? `${nf0(jamf.rapportTimmer)} m³` : '–'}
          hoger={jamf ? `${nf0(jamf.rapportVol)} m³fub` : undefined}
          onClick={() => router.push(url({ vy: 'rapport' }))}
          sub={jamf?.diffTimmer != null ? `${jamf.diffTimmer >= 0 ? '+' : '−'}${nf0(Math.abs(jamf.diffTimmer))} m³ mot rapporten` : undefined} />
        <Rad text="Så räknas" onClick={() => router.push(url({ vy: 'sa-raknas' }))} />
      </Rader>
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
