"use client";
// PERIODFORMULÄRET — ETT formulär, tre ingångar:
//   1. "Extra arbete" på morgonen: klockslaget noteras, "Avsluta" noterar
//      sluttiden och öppnar det här med båda tiderna ifyllda och redigerbara.
//   2. "Lägg till i efterhand": tomt formulär med två klockslag.
//   3. Tryck på en befintlig period (Dag eller Redigera): redigera eller ta bort.
// Ersätter "Vad gjorde du?"-sheeten (som inte kunde ändra tiderna, bara
// beskrivningen) och Redigera-vyns inbäddade segmentformulär. Föraren säger
// bara "jag gjorde det här mellan de här klockslagen"; FÖRÄLDERN avgör om det
// blir ett dagsegment (inom passet, redan betalt) eller extra_tid (utanför,
// läggs till) — se klassificeraPeriod i lib/dagsegment.
//
// OBS: extra_tid.minuter är INTE en genererad kolumn. Varje väg som ändrar
// start/slut måste räkna om den (periodMin) och skriva den — annars glider
// lönen isär från tiderna. Det gäller den här komponentens förälder och
// varje framtida tredje väg att ändra tider.
//
// Ingen timer, ingen banner, ingen window.confirm: radering är ett synligt
// tvåstegsval i formuläret. Allt mot lib/design/tokens.

import { useState, type ReactNode } from "react";
import { TYP, VIKT, IKON, AVSTAND, RADIE, FARG, KNAPP, TRAFFYTA, TNUM, INAKTIV } from "@/lib/design/tokens";
import { AKTIVITETER, EXTRA_ARBETE_TYPER, type AktivitetTyp } from "@/lib/aktiviteter";
import { klassificeraPeriod, periodMin, type PeriodLage } from "@/lib/dagsegment";

export type PeriodVarden = {
  start: string;          // HH:MM
  slut: string;           // HH:MM, tom = sluttid saknas
  typ: AktivitetTyp;
  deb: boolean;
  kommentar: string;
  objektId: string | null;
};

type Props = {
  rubrik: string;
  /** "måndag 7 september" — visas under rubriken. */
  datumText?: string;
  varden: PeriodVarden;
  onAndra: (v: PeriodVarden) => void;
  /** Dagens maskinpass — avgör om perioden ligger inne/utanför. null = okänt/inget pass. */
  pass?: { start_tid: string | null; slut_tid: string | null } | null;
  /** Bara nya perioder klassificeras; en befintlig extra_tid-post förblir extra_tid. */
  klassificera: boolean;
  fel?: string | null;
  sparar?: boolean;
  onSpara: () => void | Promise<void>;
  onTaBort?: () => void | Promise<void>;
  onAvbryt: () => void;
  /** Objektnamn för valt objekt (föräldern äger listan). */
  objektNamn?: string | null;
  /** Renderar objektväljaren (föräldern äger ObjektValjarLista). */
  renderObjektValjare?: (valtId: string | null, onValj: (id: string | null) => void, stang: () => void) => ReactNode;
};

const fmtMin = (m: number) => {
  const h = Math.floor(m / 60), mm = m % 60;
  if (!h) return `${mm} min`;
  if (!mm) return `${h} tim`;
  return `${h} tim ${mm} min`;
};

export default function PeriodForm(p: Props) {
  const [valjerObjekt, setValjerObjekt] = useState(false);
  const [bekraftaBort, setBekraftaBort] = useState(false);
  const v = p.varden;
  const min = v.start && v.slut ? periodMin(v.start, v.slut) : 0;
  const lage: PeriodLage | null = p.klassificera && v.start && v.slut && p.pass
    ? klassificeraPeriod({ start: v.start, slut: v.slut }, p.pass)
    : null;
  const korsar = lage === 'korsar';
  const kanSpara = !!v.start && !!v.slut && min > 0 && !korsar && !p.sparar;

  const falt = (etikett: string, barn: ReactNode) => (
    <label style={{ flex: 1, minWidth: 0 }}>
      <span style={{ display: "block", ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>{etikett}</span>
      {barn}
    </label>
  );
  const tidInput = (varde: string, satt: (t: string) => void) => (
    <input type="time" step={300} value={varde} onChange={e => satt(e.target.value)}
      style={{ width: "100%", boxSizing: "border-box", minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, background: FARG.upphojt, border: "none", borderRadius: RADIE.rad, color: FARG.text, ...TYP.text, ...TNUM, fontFamily: "inherit", colorScheme: "dark" }} />
  );

  return (
    <div onClick={p.onAvbryt} className="tona-opacity"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1600, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} className="sheet-upp"
        style={{ width: "100%", maxWidth: 520, background: FARG.kort, borderRadius: `${RADIE.sheet}px ${RADIE.sheet}px 0 0`, padding: `${AVSTAND.s}px ${AVSTAND.l}px calc(${AVSTAND.xl}px + env(safe-area-inset-bottom))`, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "center", padding: `${AVSTAND.xs}px 0 ${AVSTAND.m}px` }}>
          <div style={{ width: 36, height: AVSTAND.xs, borderRadius: RADIE.rad, background: FARG.fyllning }} />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: AVSTAND.s }}>
          <h2 style={{ margin: 0, ...TYP.rubrik, color: FARG.text }}>{p.rubrik}</h2>
          <button onClick={p.onAvbryt} style={KNAPP.lank}>Avbryt</button>
        </div>
        {p.datumText && <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>{p.datumText}</p>}

        {/* Två klockslag. Sluttid tom = "sluttid saknas" (föräldralös post som ska rättas). */}
        <div style={{ display: "flex", gap: AVSTAND.s, marginTop: AVSTAND.l }}>
          {falt("Från", tidInput(v.start, t => p.onAndra({ ...v, start: t })))}
          {falt("Till", tidInput(v.slut, t => p.onAndra({ ...v, slut: t })))}
        </div>
        <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, ...TNUM, color: korsar ? FARG.orange : !v.slut ? FARG.orange : FARG.text2 }}>
          {!v.slut
            ? "Sluttid saknas — fyll i när det slutade"
            : korsar
              ? `Perioden korsar maskinpassets gräns (${(p.pass?.start_tid || '').slice(0, 5)}–${(p.pass?.slut_tid || '').slice(0, 5)}) — dela upp den`
              : min <= 0
                ? "Sluttiden måste vara efter starttiden"
                : lage === 'inne'
                  ? `${fmtMin(min)} · redan i dagen, märks bara`
                  : p.klassificera
                    ? `${fmtMin(min)} · läggs till dagen`
                    : fmtMin(min)}
        </p>

        {/* Aktivitet — valt = fyllning + fet + bock. Färgen bär aldrig ensam. */}
        <p style={{ margin: `${AVSTAND.l}px 0 ${AVSTAND.s}px`, ...TYP.micro, color: FARG.text2 }}>Aktivitet</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: AVSTAND.s }}>
          {EXTRA_ARBETE_TYPER.map(t => {
            const akt = AKTIVITETER.find(a => a.typ === t)!;
            const vald = v.typ === t;
            return (
              <button key={t} onClick={() => p.onAndra({ ...v, typ: t, deb: akt.debDefault })}
                style={{ ...KNAPP.sekundar, width: "auto", padding: `0 ${AVSTAND.m}px`, background: vald ? FARG.fyllning : "transparent", color: vald ? FARG.text : FARG.text2, ...TYP.meta, fontWeight: vald ? VIKT.halvfet : VIKT.normal, gap: AVSTAND.xs }}>
                <span className="material-symbols-outlined" style={{ fontSize: IKON.text }}>{vald ? "check" : akt.icon}</span>
                {akt.label}
              </button>
            );
          })}
        </div>

        {/* Objekt (valfritt) */}
        {p.renderObjektValjare && (
          <button onClick={() => setValjerObjekt(true)}
            style={{ ...KNAPP.tertiar, display: "flex", width: "100%", justifyContent: "space-between", marginTop: AVSTAND.m, ...TYP.text, color: FARG.text }}>
            <span>Objekt</span>
            <span style={{ display: "flex", alignItems: "center", gap: AVSTAND.xs, minWidth: 0 }}>
              <span style={{ ...TYP.meta, color: FARG.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.objektNamn || "Valfritt"}</span>
              <span className="material-symbols-outlined" style={{ fontSize: IKON.text, color: FARG.text3 }}>chevron_right</span>
            </span>
          </button>
        )}

        {/* Faktureras */}
        <button onClick={() => p.onAndra({ ...v, deb: !v.deb })}
          style={{ ...KNAPP.tertiar, display: "flex", width: "100%", justifyContent: "space-between", ...TYP.text, color: FARG.text }}>
          <span>Ska faktureras</span>
          <span style={{ display: "flex", alignItems: "center", gap: AVSTAND.xs }}>
            <span style={{ ...TYP.meta, color: v.deb ? FARG.text : FARG.text2 }}>{v.deb ? "Ja" : "Nej"}</span>
            <span className="material-symbols-outlined" style={{ fontSize: IKON.rad, color: v.deb ? FARG.gron : FARG.text3 }}>{v.deb ? "toggle_on" : "toggle_off"}</span>
          </span>
        </button>

        <input value={v.kommentar} onChange={e => p.onAndra({ ...v, kommentar: e.target.value })} placeholder="Kommentar (valfritt)"
          style={{ width: "100%", boxSizing: "border-box", minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, marginTop: AVSTAND.s, background: FARG.upphojt, border: "none", borderRadius: RADIE.rad, color: FARG.text, ...TYP.text, fontFamily: "inherit" }} />

        {p.fel && <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.rod }}>{p.fel}</p>}

        {/* Skärmens ENDA primära: Spara. */}
        <button onClick={() => { if (kanSpara) p.onSpara(); }} style={{ ...KNAPP.primar, marginTop: AVSTAND.l, ...(kanSpara ? {} : INAKTIV) }}>
          {p.sparar ? "Sparar…" : "Spara"}
        </button>

        {/* Ta bort — synligt tvåstegsval, ingen window.confirm. */}
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
      </div>

      {/* Objektväljaren stackad ovanpå */}
      {valjerObjekt && p.renderObjektValjare && (
        <div onClick={e => { e.stopPropagation(); setValjerObjekt(false); }} className="tona-opacity"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1700, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} className="sheet-upp"
            style={{ width: "100%", maxWidth: 520, background: FARG.kort, borderRadius: `${RADIE.sheet}px ${RADIE.sheet}px 0 0`, maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: `${AVSTAND.l}px`, borderBottom: `1px solid ${FARG.linje}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, ...TYP.rubrik, color: FARG.text }}>Välj objekt</h3>
              <button onClick={() => setValjerObjekt(false)} style={KNAPP.lank}>Avbryt</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {p.renderObjektValjare(v.objektId, id => { p.onAndra({ ...v, objektId: id }); setValjerObjekt(false); }, () => setValjerObjekt(false))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
