"use client";
// PERIODFORMULÄRET — en fråga per skärm (Martin 2026-11-25: "så lätt att ett barn
// förstår det direkt"). Samma komponent för alla ingångar:
//   1. "Extra arbete" på Dag (start noteras, "Avsluta" noterar slutet),
//   2. "Lägg till i efterhand" / "Lägg till period",
//   3. frågan "Vad gjorde du 05:30–06:30?" när föraren flyttat sin start eller
//      sitt slut mot maskinen,
//   4. tryck på en befintlig period (öppnas direkt på översikten).
//
// SNABBT (Martin 2026-11-26: "det är ju inte smidigt"): en ny period sparas i
// det tryck som besvarar sista frågan — ingen översikt, ingen Spara-knapp.
//   Frågar appen om en tid (tiden känd):  Vad gjorde du?  →  Faktureras?  →  sparat
//   Lägger föraren till själv:            Vad gjorde du?  →  När?  →  Faktureras?  →  sparat
// Trakten frågas bara när perioden faktureras eller aktiviteten kräver den OCH
// dagen saknar trakt — annars blir det dagens trakt. "Annat" får översikten
// (kommentaren säger vad det var). Kvittot hos föräldern har Ändra.
// FAKTURERINGEN HAR INGET FÖRVAL: föraren väljer alltid Ja eller Nej själv.
//
// FÖRÄLDERN avgör om perioden blir ett dagsegment (inom passet, redan betalt)
// eller extra_tid (utanför, läggs till) — se klassificeraPeriod i lib/dagsegment.
//
// OBS: extra_tid.minuter är INTE en genererad kolumn. Varje väg som ändrar
// start/slut måste räkna om den (periodMin) och skriva den.
//
// Ingen timer, ingen banner, ingen window.confirm. Allt mot lib/design/tokens.

import TidHjul from "./TidHjul";
import { useState, type ReactNode } from "react";
import { TYP, VIKT, IKON, AVSTAND, RADIE, FARG, KNAPP, TRAFFYTA, TNUM, INAKTIV } from "@/lib/design/tokens";
import { AKTIVITETER, EXTRA_ARBETE_TYPER, HELA_DAGEN_TYPER, objektKravs, type AktivitetTyp } from "@/lib/aktiviteter";
import { klassificeraPeriod, periodMin, type PeriodLage } from "@/lib/dagsegment";
import { forstaVal, lasRakning, noteraAnvandning } from "@/lib/arbetsrapport/mestAnvanda";

export type PeriodVarden = {
  start: string;          // HH:MM
  slut: string;           // HH:MM, tom = sluttid saknas
  typ: AktivitetTyp;
  /** null = inte valt än. Spara kräver ett val — det finns inget förval. */
  deb: boolean | null;
  kommentar: string;
  objektId: string | null;
};

export type PeriodSteg = 'vad' | 'tid' | 'fakt' | 'trakt' | 'oversikt';

type Props = {
  rubrik: string;
  /** "måndag 7 september" — visas under rubriken. */
  datumText?: string;
  varden: PeriodVarden;
  onAndra: (v: PeriodVarden) => void;
  /** Var formuläret börjar: en ny period på "Vad gjorde du?", en befintlig på översikten. */
  startSteg?: PeriodSteg;
  /** Dagens maskinpass — avgör om perioden ligger inne/utanför. null = okänt/inget pass. */
  pass?: { start_tid: string | null; slut_tid: string | null } | null;
  /** Bara nya perioder klassificeras; en befintlig extra_tid-post förblir extra_tid. */
  klassificera: boolean;
  fel?: string | null;
  sparar?: boolean;
  /** Med värden = snabbsparning (sista frågan besvarad); föräldern stänger och visar kvittot. */
  onSpara: (snabb?: PeriodVarden) => void | Promise<void>;
  onTaBort?: () => void | Promise<void>;
  onAvbryt: () => void;
  /** Objektnamn för valt objekt (föräldern äger listan). */
  objektNamn?: string | null;
  /** Renderar objektlistan (föräldern äger ObjektValjarLista). `kravs` = "Inget objekt" visas inte. */
  renderObjektValjare?: (valtId: string | null, onValj: (id: string | null) => void, kravs: boolean) => ReactNode;
  /** KEDJAN: perioder som redan sparats i den här omgången. */
  sparade?: string[];
  /** "Klar" — stänger kedjan. */
  onKlar?: () => void;
};

const fmtMin = (m: number) => {
  const h = Math.floor(m / 60), mm = m % 60;
  if (!h) return `${mm} min`;
  if (!mm) return `${h} tim`;
  return `${h} tim ${mm} min`;
};

/** Om trakten ska frågas: när perioden faktureras eller aktiviteten kräver den. */
export const traktFragas = (v: Pick<PeriodVarden, 'typ' | 'deb'>) => v.deb === true || objektKravs(v.typ);

/** Hela dagen för möte och utbildning: maskinpasset om det finns, annars 07:00–15:00 (8 tim). */
export const helaDagen = (pass?: { start_tid: string | null; slut_tid: string | null } | null) =>
  pass?.start_tid && pass?.slut_tid
    ? { start: pass.start_tid.slice(0, 5), slut: pass.slut_tid.slice(0, 5) }
    : { start: '07:00', slut: '15:00' };

/** Kan perioden sparas? Samma regel som knappen. */
export function periodKanSparas(v: PeriodVarden, pass?: Props['pass'], klassificera = false): boolean {
  if (!v.start || !v.slut || periodMin(v.start, v.slut) <= 0) return false;
  if (klassificera && pass && klassificeraPeriod({ start: v.start, slut: v.slut }, pass) === 'korsar') return false;
  if (v.deb === null) return false;
  if (traktFragas(v) && !v.objektId) return false;
  return true;
}

const STOR_KNAPP_HOJD = TRAFFYTA.primar + AVSTAND.l;

// Ord som inte ryms på en smal telefon (360 px) får en mjuk delning — bara här,
// etiketten i lib/aktiviteter är orörd. "Markägar-möte" i stället för text utanför knappen.
const MJUK_DELNING: Partial<Record<AktivitetTyp, string>> = { markagare: 'Markägar\u00ADmöte' };

export default function PeriodForm(p: Props) {
  const [steg, setSteg] = useState<PeriodSteg>(p.startSteg || 'oversikt');
  const [historik, setHistorik] = useState<PeriodSteg[]>([]);
  const [bekraftaBort, setBekraftaBort] = useState(false);
  // En ny period har inget val än — typen i värdena är bara en platshållare.
  const [typValt, setTypValt] = useState(p.startSteg !== 'vad');
  // Börjar formuläret på "Vad gjorde du?" är det snabbt: sista svaret sparar.
  const snabb = p.startSteg === 'vad';
  const [forsta] = useState(() => forstaVal(lasRakning()));
  const [visaAlla, setVisaAlla] = useState(false);
  const v = p.varden;
  const akt = AKTIVITETER.find(a => a.typ === v.typ);
  const min = v.start && v.slut ? periodMin(v.start, v.slut) : 0;
  const lage: PeriodLage | null = p.klassificera && v.start && v.slut && p.pass
    ? klassificeraPeriod({ start: v.start, slut: v.slut }, p.pass)
    : null;
  const korsar = lage === 'korsar';
  const traktBehovs = traktFragas(v);
  const traktSaknas = traktBehovs && !v.objektId;
  const kanSpara = periodKanSparas(v, p.pass, p.klassificera) && !p.sparar;

  const ga = (till: PeriodSteg) => { setHistorik(h => [...h, steg]); setSteg(till); };
  const tillbaka = () => {
    setHistorik(h => {
      const forra = h[h.length - 1];
      if (forra) setSteg(forra);
      return h.slice(0, -1);
    });
  };
  // Efter ett val: nästa obesvarade steg. Snabbt: sparar när inget mer behövs.
  const klar = (nv: PeriodVarden) => {
    if (p.sparar) return;
    if (snabb && nv.typ !== 'annat' && periodKanSparas(nv, p.pass, p.klassificera)) { void p.onSpara(nv); return; }
    ga('oversikt');
  };
  const efterFakt = (nv: PeriodVarden) => {
    if (traktFragas(nv) && (!snabb || !nv.objektId)) { ga('trakt'); return; }
    klar(nv);
  };
  const tidOk = !!v.start && !!v.slut && periodMin(v.start, v.slut) > 0 && !korsar;

  const tidText = v.start && v.slut ? `${v.start}–${v.slut}` : v.start ? `från ${v.start}` : null;

  const rubrik = steg === 'vad' ? 'Vad gjorde du?'
    : steg === 'tid' ? 'När?'
    : steg === 'fakt' ? 'Ska det faktureras?'
    : steg === 'trakt' ? 'Vilken trakt?'
    : p.rubrik;
  // Tiden står i rubriken när frågan själv bär den ("Vad gjorde du 05:30–06:30?") — inte två gånger.
  const underRubrik = [tidText && steg !== 'tid' && !rubrik.includes(tidText) ? tidText : null, p.datumText].filter(Boolean).join(' · ');

  // Stor valknapp — vald = fyllning + fet + bock. Färgen bär aldrig ensam.
  const valKnapp = (nyckel: string, ikon: string | null, text: string, vald: boolean, onClick: () => void) => (
    <button key={nyckel} data-val={nyckel} onClick={onClick}
      style={{ ...KNAPP.sekundar, minHeight: STOR_KNAPP_HOJD, padding: `${AVSTAND.s}px ${AVSTAND.m}px`, justifyContent: "flex-start", gap: AVSTAND.s, textAlign: "left",
        background: vald ? FARG.upphojt : FARG.fyllning, fontWeight: vald ? VIKT.fet : VIKT.halvfet }}>
      {ikon && <span className="material-symbols-outlined" style={{ fontSize: IKON.rad, color: FARG.text2, flexShrink: 0 }}>{ikon}</span>}
      <span style={{ flex: 1, minWidth: 0, ...TYP.text, fontWeight: "inherit", lineHeight: 1.25, hyphens: "manual" }}>{text}</span>
      {vald && <span className="material-symbols-outlined" style={{ fontSize: IKON.rad, color: FARG.text, flexShrink: 0 }}>check</span>}
    </button>
  );

  // En iOS-rad i översikten: etikett vänster, värde höger, pil.
  const rad = (nyckel: string, etikett: string, varde: string, onClick: () => void, varna = false) => (
    <button key={nyckel} data-rad={nyckel} onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: AVSTAND.s, width: "100%", minHeight: TRAFFYTA.min + AVSTAND.s, padding: `0 ${AVSTAND.m}px`, background: "none", border: "none", borderTop: `1px solid ${FARG.linje}`, color: FARG.text, fontFamily: "inherit", textAlign: "left", cursor: "pointer" }}>
      <span style={{ ...TYP.text, color: FARG.text2, flexShrink: 0 }}>{etikett}</span>
      <span style={{ flex: 1, minWidth: 0, ...TYP.text, color: varna ? FARG.orange : FARG.text, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{varde}</span>
      <span className="material-symbols-outlined" style={{ fontSize: IKON.text, color: FARG.text3, flexShrink: 0 }}>chevron_right</span>
    </button>
  );

  const tidRad = !v.slut
    ? { text: "Sluttid saknas — fyll i när det slutade", varna: true }
    : korsar
      ? { text: `Perioden korsar maskinpassets gräns (${(p.pass?.start_tid || '').slice(0, 5)}–${(p.pass?.slut_tid || '').slice(0, 5)}) — dela upp den`, varna: true }
      : min <= 0
        ? { text: "Sluttiden måste vara efter starttiden", varna: true }
        : lage === 'inne'
          ? { text: `${fmtMin(min)} · redan i dagen, märks bara`, varna: false }
          : p.klassificera
            ? { text: `${fmtMin(min)} · läggs till dagen`, varna: false }
            : { text: fmtMin(min), varna: false };

  let innehall: ReactNode;
  if (steg === 'vad') {
    innehall = (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: AVSTAND.s, marginTop: AVSTAND.l }}>
        {(forsta && !visaAlla ? forsta : EXTRA_ARBETE_TYPER).map(t => {
          const a = AKTIVITETER.find(x => x.typ === t)!;
          const vald = typValt && v.typ === t;
          return valKnapp(t, a.icon, MJUK_DELNING[t] || a.label, vald, () => {
            const nv = { ...v, typ: t };
            p.onAndra(nv);
            setTypValt(true);
            noteraAnvandning(t);
            ga(nv.start && nv.slut ? 'fakt' : 'tid');
          });
        })}
        {forsta && !visaAlla && valKnapp('fler', 'more_horiz', 'Fler', false, () => setVisaAlla(true))}
      </div>
    );
  } else if (steg === 'tid') {
    innehall = (
      <>
        <div style={{ marginTop: AVSTAND.l }}>
          <TidHjul start={v.start} slut={v.slut} startForslag={(p.pass?.slut_tid || '').slice(0, 5) || undefined}
            onAndra={(start, slut) => p.onAndra({ ...v, start, slut })} />
        </div>
        {v.start && v.slut && <p data-tidrad style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, ...TNUM, color: tidRad.varna ? FARG.orange : FARG.text2 }}>{tidRad.text}</p>}
        {HELA_DAGEN_TYPER.includes(v.typ) && (
          <button data-hela-dagen onClick={() => p.onAndra({ ...v, ...helaDagen(p.pass) })} style={{ ...KNAPP.tertiar, marginTop: AVSTAND.xs }}>
            Hela dagen ({helaDagen(p.pass).start}–{helaDagen(p.pass).slut})
          </button>
        )}
        <button data-nasta onClick={() => { if (tidOk) ga('fakt'); }} style={{ ...KNAPP.primar, marginTop: AVSTAND.l, ...(tidOk ? {} : INAKTIV) }}>Nästa</button>
      </>
    );
  } else if (steg === 'fakt') {
    innehall = (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: AVSTAND.s, marginTop: AVSTAND.l }}>
          {valKnapp('ja', null, 'Ja', v.deb === true, () => { const nv = { ...v, deb: true }; p.onAndra(nv); efterFakt(nv); })}
          {valKnapp('nej', null, 'Nej', v.deb === false, () => { const nv = { ...v, deb: false }; p.onAndra(nv); efterFakt(nv); })}
        </div>
        <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.text2 }}>
          Ja = tiden kommer med på fakturan till kunden.
        </p>
      </>
    );
  } else if (steg === 'trakt') {
    innehall = (
      <div style={{ marginTop: AVSTAND.m }}>
        {v.objektId && p.objektNamn && (
          <>
            <p style={{ margin: `0 0 ${AVSTAND.s}px`, ...TYP.micro, color: FARG.text2 }}>Dagens trakt</p>
            {valKnapp('dagens', 'forest', p.objektNamn, true, () => klar(v))}
            <p style={{ margin: `${AVSTAND.l}px 0 0`, ...TYP.micro, color: FARG.text2 }}>Annan trakt</p>
          </>
        )}
        {p.renderObjektValjare
          ? <div style={{ margin: `0 -${AVSTAND.l}px` }}>{p.renderObjektValjare(v.objektId, id => { const nv = { ...v, objektId: id }; p.onAndra(nv); klar(nv); }, traktBehovs)}</div>
          : null}
      </div>
    );
  } else {
    innehall = (
      <>
        {!!p.sparade?.length && (
          <div style={{ marginTop: AVSTAND.m, padding: `${AVSTAND.s}px ${AVSTAND.m}px`, background: FARG.upphojt, borderRadius: RADIE.rad }}>
            {p.sparade.map((s, i) => (
              <p key={i} style={{ margin: 0, ...TYP.meta, ...TNUM, color: FARG.text2, display: "flex", alignItems: "center", gap: AVSTAND.xs }}>
                <span className="material-symbols-outlined" style={{ fontSize: IKON.text, color: FARG.gron }}>check</span>
                Sparat: {s}
              </p>
            ))}
          </div>
        )}

        {/* Tiden: två klockslag, alltid synliga och redigerbara. */}
        <div style={{ marginTop: AVSTAND.l }}>
          <TidHjul start={v.start} slut={v.slut} startForslag={(p.pass?.slut_tid || '').slice(0, 5) || undefined}
            onAndra={(start, slut) => p.onAndra({ ...v, start, slut })} />
        </div>
        <p data-tidrad style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, ...TNUM, color: tidRad.varna ? FARG.orange : FARG.text2 }}>{tidRad.text}</p>
        {HELA_DAGEN_TYPER.includes(v.typ) && (
          <button data-hela-dagen onClick={() => p.onAndra({ ...v, ...helaDagen(p.pass) })} style={{ ...KNAPP.tertiar, marginTop: AVSTAND.xs }}>
            Hela dagen ({helaDagen(p.pass).start}–{helaDagen(p.pass).slut})
          </button>
        )}

        <div style={{ marginTop: AVSTAND.l, background: FARG.upphojt, borderRadius: RADIE.kort, overflow: "hidden" }}>
          {rad('vad', 'Vad', akt?.label || 'Välj', () => ga('vad'))}
          {rad('fakt', 'Faktureras', v.deb === null ? 'Välj' : v.deb ? 'Ja' : 'Nej', () => ga('fakt'), v.deb === null)}
          {(traktBehovs || v.objektId) && rad('trakt', 'Trakt', p.objektNamn || 'Välj', () => ga('trakt'), traktSaknas)}
        </div>

        <input value={v.kommentar} onChange={e => p.onAndra({ ...v, kommentar: e.target.value })} placeholder="Kommentar (valfritt)"
          style={{ width: "100%", boxSizing: "border-box", minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, marginTop: AVSTAND.m, background: FARG.upphojt, border: "none", borderRadius: RADIE.rad, color: FARG.text, ...TYP.text, fontFamily: "inherit" }} />

        {p.fel && <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.rod }}>{p.fel}</p>}

        {/* Skärmens ENDA primära: Spara. */}
        <button data-spara onClick={() => { if (kanSpara) p.onSpara(); }} style={{ ...KNAPP.primar, marginTop: AVSTAND.l, ...(kanSpara ? {} : INAKTIV) }}>
          {p.sparar ? "Sparar…" : "Spara"}
        </button>
        {p.onKlar && !!p.sparade?.length && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: AVSTAND.s }}>
            <button onClick={p.onKlar} style={KNAPP.tertiar}>Klar</button>
          </div>
        )}

        {p.onTaBort && (bekraftaBort ? (
          <div className="tona-in" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: AVSTAND.s, marginTop: AVSTAND.s }}>
            <span style={{ ...TYP.meta, color: FARG.text2 }}>Ta bort posten?</span>
            <div style={{ display: "flex", gap: AVSTAND.l }}>
              <button onClick={() => setBekraftaBort(false)} style={KNAPP.tertiar}>Nej</button>
              <button onClick={() => p.onTaBort && p.onTaBort()} style={KNAPP.destruktiv}>Ja, ta bort</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "center", marginTop: AVSTAND.s }}>
            <button onClick={() => setBekraftaBort(true)} style={KNAPP.destruktiv}>
              <span className="material-symbols-outlined" style={{ fontSize: IKON.text }}>delete</span>
              Ta bort
            </button>
          </div>
        ))}
      </>
    );
  }

  return (
    <div onClick={p.onAvbryt} className="tona-opacity"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1600, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} className="sheet-upp" data-steg={steg}
        style={{ width: "100%", maxWidth: 520, background: FARG.kort, borderRadius: `${RADIE.sheet}px ${RADIE.sheet}px 0 0`, padding: `${AVSTAND.s}px ${AVSTAND.l}px calc(${AVSTAND.xl}px + env(safe-area-inset-bottom))`, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "center", padding: `${AVSTAND.xs}px 0 ${AVSTAND.m}px` }}>
          <div style={{ width: 36, height: AVSTAND.xs, borderRadius: RADIE.rad, background: FARG.fyllning }} />
        </div>
        {/* Huvudet: Tillbaka (ett steg) till vänster, Avbryt till höger. Blått = navigera. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: AVSTAND.s, minHeight: TRAFFYTA.min }}>
          {historik.length > 0
            ? <button data-tillbaka onClick={tillbaka} style={KNAPP.lank}>‹ Tillbaka</button>
            : <span />}
          <button onClick={p.onAvbryt} style={KNAPP.lank}>Avbryt</button>
        </div>
        <h2 style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.rubrik, color: FARG.text }}>{rubrik}</h2>
        {underRubrik && <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, ...TNUM, color: FARG.text2 }}>{underRubrik}</p>}
        <div key={steg} className="tona-in">{innehall}</div>
        {steg !== 'oversikt' && p.fel && <p data-fel style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.rod }}>{p.fel}</p>}
        {steg !== 'oversikt' && p.sparar && <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Sparar…</p>}
      </div>
    </div>
  );
}
