"use client";
import React, { useState } from "react";
import { AKTIVITETER, aktLabel } from "@/lib/aktiviteter";
import { DAGENS_SLUT, KVART, PLANERA_TYPER, RAST_MAX_MIN, kvartNarmast, minTillKlocka, nuKvartNarmast, nuMinut, timText } from "@/lib/planera/logik";
import {
  arArbete, arbetadMin, bytTyp, andraDel, klippDel, laggTillRast, stappaDel, taBortDel, traktForNyDel, type DagDel, type DelTyp,
} from "@/lib/planera/dag";
import { TYP, VIKT, IKON, AVSTAND, RADIE, FARG, KNAPP, KORT, TRAFFYTA, TNUM, INAKTIV, DELFARG } from "@/lib/design/tokens";

/**
 * KLIPP OCH RÄTTA DAGEN — redigeraren för en dag i delar. Martins fall (2026-10-04): han startar planering på
 * Odenssvalahult 07:00, går över till manuellt, åker en stund till Betet och GLÖMMER att byta eller avsluta.
 * På kvällen står hela dagen som en planering. Han behöver inte byta live — han behöver klippa och rätta i efterhand.
 *
 *   lista   färgstapel över hela dagen + delarna som rader + "Klipp upp dagen" / "Klipp igen" + Spara
 *   del     ändra en del: start/slut (− och +, gränsen mot grannen flyttar med), trakt, aktivitet eller rast,
 *           Faktureras, kommentar, ta bort delen
 *   klipp   klipp vid ett klockslag (förifyllt mitt i delen) och välj vad den nya delen var
 *   trakt   välj trakt för en del / en ny del
 *
 * All logik (klipp, gränser, ta bort, kontroller, skrivplan) ligger i lib/planera/dag.ts. Den här filen är bara vy.
 * Rasten är en egen del med tider men sparas som luckan mellan raderna — aldrig en siffra, aldrig förifylld.
 */

/** Segmenterad väljare — vald = fyllning + fet text. `kolumner` > 0 lägger knapparna i ett rutnät (flera rader). */
export function Segment<T extends string>({ varden, valt, onVal, etikett, inaktiva = [], kolumner = 0 }: {
  varden: { key: T; label: string }[]; valt: T | null; onVal: (k: T) => void; etikett: string; inaktiva?: T[]; kolumner?: number;
}) {
  return (
    <div role="group" aria-label={etikett}
      style={{ display: kolumner ? "grid" : "flex", ...(kolumner ? { gridTemplateColumns: `repeat(${kolumner}, 1fr)` } : {}), background: FARG.linje, borderRadius: RADIE.rad, padding: AVSTAND.xs, gap: AVSTAND.xs }}>
      {varden.map(v => {
        const vald = v.key === valt;
        const av = inaktiva.includes(v.key);
        return (
          <button key={v.key} type="button" aria-pressed={vald} disabled={av} onClick={() => onVal(v.key)}
            style={{ flex: 1, minWidth: 0, minHeight: TRAFFYTA.min, padding: 0, border: "none", borderRadius: RADIE.rad - 2, cursor: "pointer", fontFamily: "inherit", ...TYP.meta, fontWeight: vald ? VIKT.halvfet : VIKT.normal, background: vald ? FARG.fyllning : "transparent", color: vald ? FARG.text : FARG.text2, ...(av ? { opacity: 0.4, cursor: "default" } : {}) }}>
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

/** "Hade du rast?" — ett AKTIVT val, aldrig en gissning. Ersätter Spara tills föraren svarat. */
export function RastFraga({ onIngen, onLagg }: { onIngen: () => void; onLagg: () => void }) {
  return (
    <div role="group" aria-label="Hade du rast?" className="tona-in" style={{ marginTop: AVSTAND.l }}>
      <p style={{ margin: 0, ...TYP.rubrik }}>Hade du rast?</p>
      <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Dagen är längre än 5 timmar och ingen rast är inlagd. Svara innan du sparar.</p>
      <div style={{ display: "flex", gap: AVSTAND.s, marginTop: AVSTAND.m }}>
        <button type="button" onClick={onIngen} style={{ ...KNAPP.sekundar, flex: 1, width: "auto" }}>Ingen rast</button>
        <button type="button" onClick={onLagg} style={{ ...KNAPP.sekundar, flex: 1, width: "auto" }}>Lägg till rast</button>
      </div>
    </div>
  );
}

/**
 * "Hur lång rast?" — efter "Lägg till rast". 15 · 30 · 45 · 60 min, INGEN förvald, och en knapp för annan längd
 * (stegare i 5 min). Valet lägger rasten MITT i perioden (lib/planera/dag.laggTillRast) och den går att flytta efteråt;
 * Spara finns inte förrän en längd valts. (Förr hamnade rasten på periodens slut och blev flera timmar om man inte
 * flyttade den — Martin 2026-10-05.)
 */
export function RastLangd({ onVal, onTillbaka }: { onVal: (min: number) => void; onTillbaka: () => void }) {
  const [annan, setAnnan] = useState<number | null>(null);
  const stegKnapp = (ikon: string, etikett: string, paa: boolean, onClick: () => void) => (
    <button type="button" aria-label={etikett} disabled={!paa} onClick={onClick}
      style={{ width: 64, minHeight: TRAFFYTA.min, border: "none", borderRadius: RADIE.rad, cursor: "pointer", fontFamily: "inherit", background: FARG.fyllning, color: FARG.text, display: "inline-flex", alignItems: "center", justifyContent: "center", ...(paa ? {} : { opacity: 0.4, cursor: "default" }) }}>
      <span className="material-symbols-outlined" style={{ fontSize: IKON.rad }}>{ikon}</span>
    </button>
  );
  return (
    <div role="group" aria-label="Hur lång rast?" className="tona-in" style={{ marginTop: AVSTAND.l }}>
      <p style={{ margin: 0, ...TYP.rubrik }}>Hur lång rast?</p>
      <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Rasten läggs mitt i perioden — du kan flytta den efteråt.</p>
      {annan == null ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: AVSTAND.s, marginTop: AVSTAND.m }}>
            {[15, 30, 45, 60].map(m => (
              <button key={m} type="button" aria-pressed={false} onClick={() => onVal(m)} style={{ ...KNAPP.sekundar, width: "auto", padding: 0 }}>{m} min</button>
            ))}
          </div>
          <button type="button" onClick={() => setAnnan(60)} style={{ ...KNAPP.sekundar, marginTop: AVSTAND.s }}>Annan längd</button>
        </>
      ) : (
        <>
          <div role="group" aria-label="Annan längd" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: AVSTAND.m, marginTop: AVSTAND.m }}>
            <span style={{ ...TYP.text, ...TNUM, color: FARG.text }}>Rast {annan} min</span>
            <span style={{ display: "flex", gap: AVSTAND.s }}>
              {stegKnapp("remove", "Kortare rast", annan > 5, () => setAnnan(a => Math.max(5, (a ?? 60) - 5)))}
              {stegKnapp("add", "Längre rast", annan < RAST_MAX_MIN, () => setAnnan(a => Math.min(RAST_MAX_MIN, (a ?? 60) + 5)))}
            </span>
          </div>
          <button type="button" onClick={() => onVal(annan)} style={{ ...KNAPP.primar, marginTop: AVSTAND.m }}>Lägg till rast {annan} min</button>
        </>
      )}
      <div style={{ display: "flex", justifyContent: "center", marginTop: AVSTAND.xs }}>
        <button type="button" onClick={() => (annan == null ? onTillbaka() : setAnnan(null))} style={KNAPP.tertiar}>Tillbaka</button>
      </div>
    </div>
  );
}

const TYPER_SEGMENT: { key: DelTyp; label: string }[] = [
  ...PLANERA_TYPER.map(t => ({ key: t as DelTyp, label: (AKTIVITETER.find(a => a.typ === t)?.label ?? t).replace("Manuellt arbete", "Manuellt").replace("Markägarmöte", "Markägare") })),
  { key: "rast", label: "Rast" },
];
const delTypLabel = (typ: DelTyp) => typ === "rast" ? "Rast" : typ === "lucka" ? "Ej inlagd tid" : aktLabel(typ).replace("Manuellt arbete", "Manuellt").replace("Markägarmöte", "Markägare");
const hm = (min: number) => minTillKlocka(min);
const langd = (d: DagDel) => timText(d.slut - d.start);

/** Färg per del: arbetsdelar får var sin färg i ordning, rast är grå, "Ej inlagd tid" nästan osynlig. */
function delFarger(delar: DagDel[]): string[] {
  let n = 0;
  return delar.map(d => (d.typ === "rast" ? FARG.text3 : d.typ === "lucka" ? FARG.linje : DELFARG[n++ % DELFARG.length]));
}

type Klipp = { nyckel: string; tid: number; typ: DelTyp | null; objektId: string | null; till: number };
type Lage = { k: "lista" } | { k: "del"; nyckel: string } | { k: "klipp" } | { k: "trakt"; mal: "del" | "klipp"; nyckel?: string };

/** Mitt i delen, närmaste kvart, alltid strikt inuti delen. */
function mittITid(d: DagDel): number {
  let mid = kvartNarmast((d.start + d.slut) / 2);
  if (mid <= d.start || mid >= d.slut) mid = Math.floor((d.start + d.slut) / 2);
  return mid;
}

export default function DagRedigerare(p: {
  titel: string; datum: string; idag: string; nu: Date;
  delar: DagDel[]; onDelar: (d: DagDel[]) => void;
  traktNamn: (id: string | null) => string | null;
  traktLista: (onVal: (id: string) => void) => React.ReactNode;
  oppnaMed: "klipp" | null;
  fel: string | null; sparar: boolean;
  rastFraga: boolean; onRastSvar: (svar: "ingen") => void;
  onSpara: () => void; onTillbaka: () => void; tillbakaText: string;
}) {
  // ── ALLA hooks först ──
  const kandidater = (delar: DagDel[]) => delar.filter(d => !d.last && d.slut - d.start >= 2);
  const startKlipp = (typ: DelTyp | null): Klipp | null => {
    const ks = kandidater(p.delar);
    if (!ks.length) return null;
    // Den sista delen (det man oftast glömt att byta bort från).
    const mal = ks[ks.length - 1];
    return { nyckel: mal.nyckel, tid: mittITid(mal), typ, objektId: traktForNyDel(p.delar, mal.nyckel), till: mal.slut };
  };
  const [klipp, setKlipp] = useState<Klipp | null>(() => (p.oppnaMed ? startKlipp(null) : null));
  const [lage, setLage] = useState<Lage>(() => (p.oppnaMed && startKlipp(null) ? { k: "klipp" } : { k: "lista" }));
  // "Lägg till rast" på frågan → "Hur lång rast?" (15 · 30 · 45 · 60 · annan). Ingen längd är förvald.
  const [langdVal, setLangdVal] = useState(false);
  const [rastFel, setRastFel] = useState<string | null>(null);
  const [bekraftaBort, setBekraftaBort] = useState(false);
  const [kommentarOppen, setKommentarOppen] = useState<string | null>(null);

  const tak = p.datum === p.idag ? Math.max(nuMinut(p.nu), nuKvartNarmast(p.nu)) : DAGENS_SLUT;
  const farger = delFarger(p.delar);
  const arbetad = arbetadMin(p.delar);
  const forstaTid = p.delar[0]?.start ?? 0;
  const sistaTid = p.delar[p.delar.length - 1]?.slut ?? 0;

  // ── små byggstenar ──
  const stegKnapp = (ikon: string, etikett: string, paa: boolean, onClick: () => void) => (
    <button type="button" aria-label={etikett} disabled={!paa} onClick={onClick}
      style={{ width: 64, minHeight: TRAFFYTA.min, border: "none", borderRadius: RADIE.rad, cursor: "pointer", fontFamily: "inherit", background: FARG.fyllning, color: FARG.text, display: "inline-flex", alignItems: "center", justifyContent: "center", ...(paa ? {} : { opacity: 0.4, cursor: "default" }) }}>
      <span className="material-symbols-outlined" style={{ fontSize: IKON.rad }}>{ikon}</span>
    </button>
  );
  const tidsRad = (etikett: string, tid: number, minus: (() => void) | null, plus: (() => void) | null, namn: string) => (
    <div role="group" aria-label={namn} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: AVSTAND.m, marginTop: AVSTAND.s }}>
      <span style={{ ...TYP.text, color: FARG.text2 }}>{etikett} <span style={{ ...TYP.listtitel, ...TNUM, color: FARG.text }}>{hm(tid)}</span></span>
      <span style={{ display: "flex", gap: AVSTAND.s }}>
        {stegKnapp("remove", `${namn} tidigare`, !!minus, () => minus && minus())}
        {stegKnapp("add", `${namn} senare`, !!plus, () => plus && plus())}
      </span>
    </div>
  );
  const traktRad = (objektId: string | null, onClick: () => void) => (
    <button type="button" onClick={onClick}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", minHeight: TRAFFYTA.min, marginTop: AVSTAND.m, padding: `0 ${AVSTAND.m}px`, background: FARG.kort, border: "none", borderRadius: RADIE.rad, cursor: "pointer", fontFamily: "inherit", color: FARG.text, ...TYP.text }}>
      <span>Trakt</span>
      <span style={{ display: "flex", alignItems: "center", gap: AVSTAND.xs, minWidth: 0 }}>
        <span style={{ ...TYP.meta, color: objektId ? FARG.text2 : FARG.orange, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.traktNamn(objektId) || "Välj trakt"}</span>
        <span className="material-symbols-outlined" style={{ fontSize: IKON.text, color: FARG.text3 }}>chevron_right</span>
      </span>
    </button>
  );
  const bakLank = (text: string, onClick: () => void) => (
    <button type="button" onClick={onClick} style={{ ...KNAPP.lank, display: "inline-flex", alignItems: "center", marginBottom: AVSTAND.s }}>
      <span className="material-symbols-outlined" style={{ fontSize: IKON.rad }}>chevron_left</span>{text}
    </button>
  );

  // ── TRAKT ──
  if (lage.k === "trakt") {
    return (
      <>
        {bakLank("Tillbaka", () => setLage(lage.mal === "klipp" ? { k: "klipp" } : { k: "del", nyckel: lage.nyckel as string }))}
        {p.traktLista(id => {
          if (lage.mal === "klipp") setKlipp(k => (k ? { ...k, objektId: id } : k));
          else p.onDelar(andraDel(p.delar, lage.nyckel as string, { objektId: id }));
          setLage(lage.mal === "klipp" ? { k: "klipp" } : { k: "del", nyckel: lage.nyckel as string });
        })}
      </>
    );
  }

  // ── KLIPP ──
  if (lage.k === "klipp" && klipp) {
    const mal = p.delar.find(d => d.nyckel === klipp.nyckel);
    const ks = kandidater(p.delar);
    if (!mal) { return <>{bakLank("Delar", () => setLage({ k: "lista" }))}</>; }
    const stegTid = (rikt: -1 | 1) => {
      const nu = klipp.tid;
      const ny = rikt < 0 ? (nu % KVART ? Math.floor(nu / KVART) * KVART : nu - KVART) : (nu % KVART ? Math.ceil(nu / KVART) * KVART : nu + KVART);
      return ny > mal.start && ny < mal.slut ? ny : null;
    };
    const stegTill = (rikt: -1 | 1) => {
      const nu = klipp.till;
      const ny = rikt < 0 ? (nu % KVART ? Math.floor(nu / KVART) * KVART : nu - KVART) : (nu % KVART ? Math.ceil(nu / KVART) * KVART : nu + KVART);
      return ny > klipp.tid && ny <= mal.slut ? ny : null;
    };
    const valdTyp = klipp.typ;
    const arRast = valdTyp === "rast";
    const klar = !!valdTyp;
    const gor = () => {
      if (!valdTyp) return;
      let r = klippDel(p.delar, mal.nyckel, klipp.tid, { typ: valdTyp, objektId: arRast ? null : klipp.objektId });
      if (r && arRast && klipp.till < mal.slut) {
        // Rast med slut före delens slut: resten fortsätter som delen var (samma aktivitet, trakt, fakturering).
        const rastNyckel = r.find(d => d.start === klipp.tid && d.typ === "rast")?.nyckel;
        if (rastNyckel) {
          const efter = klippDel(r, rastNyckel, klipp.till, { typ: mal.typ, objektId: mal.objektId });
          if (efter) r = andraDel(efter, efter.find(d => d.start === klipp.till && d.slut === mal.slut)!.nyckel, { deb: mal.deb });
        }
      }
      if (r) { p.onDelar(r); setKlipp(null); setLage({ k: "lista" }); }
    };
    return (
      <>
        {bakLank("Avbryt", () => { setKlipp(null); setLage({ k: "lista" }); })}
        <h1 style={{ margin: 0, ...TYP.titel }}>Klipp upp dagen</h1>
        {ks.length > 1 && (
          <>
            <p style={{ margin: `${AVSTAND.l}px 0 ${AVSTAND.s}px`, ...TYP.micro, color: FARG.text2 }}>I vilken del?</p>
            <section style={{ ...KORT, paddingTop: AVSTAND.xs, paddingBottom: AVSTAND.xs }}>
              {ks.map((d, i) => (
                <button key={d.nyckel} type="button" aria-pressed={d.nyckel === klipp.nyckel}
                  onClick={() => setKlipp(k => (k ? { ...k, nyckel: d.nyckel, tid: mittITid(d), till: d.slut, objektId: traktForNyDel(p.delar, d.nyckel) } : k))}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", minHeight: TRAFFYTA.min, padding: 0, background: "none", border: "none", borderTop: i === 0 ? "none" : `1px solid ${FARG.linje}`, cursor: "pointer", fontFamily: "inherit", color: FARG.text, ...TYP.text }}>
                  <span style={{ fontWeight: d.nyckel === klipp.nyckel ? VIKT.halvfet : VIKT.normal }}>{delTypLabel(d.typ)} <span style={{ ...TNUM, color: FARG.text2 }}>{hm(d.start)}–{hm(d.slut)}</span></span>
                  {d.nyckel === klipp.nyckel && <span className="material-symbols-outlined" style={{ fontSize: IKON.rad, color: FARG.text2 }}>check</span>}
                </button>
              ))}
            </section>
          </>
        )}
        {tidsRad("Klipp vid", klipp.tid, stegTid(-1) != null ? () => setKlipp(k => (k ? { ...k, tid: stegTid(-1) as number, till: Math.max(k.till, (stegTid(-1) as number) + 1) } : k)) : null,
          stegTid(1) != null ? () => setKlipp(k => (k ? { ...k, tid: stegTid(1) as number, till: Math.max(k.till, (stegTid(1) as number) + 1) } : k)) : null, "Klipp")}
        <p style={{ margin: `${AVSTAND.l}px 0 ${AVSTAND.s}px`, ...TYP.micro, color: FARG.text2 }}>Vad var den nya delen?</p>
        <Segment etikett="Ny del" kolumner={3} valt={valdTyp} onVal={(t: DelTyp) => setKlipp(k => (k ? { ...k, typ: t } : k))} varden={TYPER_SEGMENT} />
        {arRast && (
          <>
            {tidsRad("Rast till", klipp.till, stegTill(-1) != null ? () => setKlipp(k => (k ? { ...k, till: stegTill(-1) as number } : k)) : null,
              stegTill(1) != null ? () => setKlipp(k => (k ? { ...k, till: stegTill(1) as number } : k)) : null, "Rast till")}
            <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, ...TNUM, color: FARG.text2 }}>Rast {hm(klipp.tid)}–{hm(klipp.till)} · {timText(klipp.till - klipp.tid)}{klipp.till < mal.slut ? "" : " — flytta 'Rast till' till när rasten tog slut"}</p>
          </>
        )}
        {valdTyp && !arRast && traktRad(klipp.objektId, () => setLage({ k: "trakt", mal: "klipp" }))}
        <button type="button" onClick={() => { if (klar) gor(); }} aria-disabled={!klar} style={{ ...KNAPP.primar, marginTop: AVSTAND.xl, ...(klar ? {} : INAKTIV) }}>
          {arRast ? "Lägg till rast" : "Klipp"}
        </button>
      </>
    );
  }

  // ── DEL ──
  if (lage.k === "del") {
    const i = p.delar.findIndex(d => d.nyckel === lage.nyckel);
    const d = p.delar[i];
    if (!d) return <>{bakLank("Delar", () => setLage({ k: "lista" }))}</>;
    const arAr = arArbete(d);
    const steg = (kant: "start" | "slut", rikt: -1 | 1) => stappaDel(p.delar, i, kant, rikt, tak);
    return (
      <>
        {bakLank("Delar", () => { setBekraftaBort(false); setLage({ k: "lista" }); })}
        <h1 style={{ margin: 0, ...TYP.titel }}>{delTypLabel(d.typ)}</h1>
        {d.last
          ? <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text2 }}>{hm(d.start)}–{hm(d.slut)}. Den här tiden ändras under Dag eller Kalender.</p>
          : (
            <>
              {tidsRad("Start", d.start, steg("start", -1) ? () => p.onDelar(steg("start", -1) as DagDel[]) : null, steg("start", 1) ? () => p.onDelar(steg("start", 1) as DagDel[]) : null, "Start")}
              {tidsRad("Slut", d.slut, steg("slut", -1) ? () => p.onDelar(steg("slut", -1) as DagDel[]) : null, steg("slut", 1) ? () => p.onDelar(steg("slut", 1) as DagDel[]) : null, "Slut")}
              <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text3 }}>Gränsen mot grannen flyttar med, så det aldrig blir hål eller krockar.</p>
              {arAr && traktRad(d.objektId, () => setLage({ k: "trakt", mal: "del", nyckel: d.nyckel }))}
              <p style={{ margin: `${AVSTAND.l}px 0 ${AVSTAND.s}px`, ...TYP.micro, color: FARG.text2 }}>Aktivitet eller rast</p>
              <Segment etikett="Aktivitet" kolumner={3} valt={d.typ} onVal={(t: DelTyp) => p.onDelar(bytTyp(p.delar, d.nyckel, t))} varden={TYPER_SEGMENT} />
              {arAr && (
                <section style={{ ...KORT, marginTop: AVSTAND.m, paddingTop: AVSTAND.xs, paddingBottom: AVSTAND.xs }}>
                  <button type="button" role="switch" aria-checked={d.deb} onClick={() => p.onDelar(andraDel(p.delar, d.nyckel, { deb: !d.deb }))}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", minHeight: TRAFFYTA.min, padding: 0, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", color: FARG.text, ...TYP.text }}>
                    <span>Faktureras</span>
                    <span style={{ display: "flex", alignItems: "center", gap: AVSTAND.xs }}>
                      <span style={{ ...TYP.meta, color: d.deb ? FARG.text : FARG.text2 }}>{d.deb ? "Ja" : "Nej"}</span>
                      <span className="material-symbols-outlined" style={{ fontSize: IKON.rad, color: d.deb ? FARG.gron : FARG.text3 }}>{d.deb ? "toggle_on" : "toggle_off"}</span>
                    </span>
                  </button>
                  <div style={{ borderTop: `1px solid ${FARG.linje}` }}>
                    {(kommentarOppen === d.nyckel || d.kommentar) ? (
                      <textarea value={d.kommentar} rows={2} aria-label="Kommentar" placeholder="Kommentar"
                        onChange={e => p.onDelar(andraDel(p.delar, d.nyckel, { kommentar: e.target.value }))}
                        style={{ width: "100%", boxSizing: "border-box", margin: `${AVSTAND.s}px 0`, padding: `${AVSTAND.s}px ${AVSTAND.m}px`, background: FARG.upphojt, border: "none", borderRadius: RADIE.rad, color: FARG.text, ...TYP.text, fontFamily: "inherit", resize: "none" }} />
                    ) : (
                      <button type="button" onClick={() => setKommentarOppen(d.nyckel)} style={{ ...KNAPP.lank, display: "flex", alignItems: "center", justifyContent: "flex-start", width: "100%" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: IKON.rad, marginRight: AVSTAND.s }}>add_comment</span>Lägg till kommentar
                      </button>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        <button type="button" onClick={() => { setBekraftaBort(false); setLage({ k: "lista" }); }} style={{ ...KNAPP.primar, marginTop: AVSTAND.l }}>Klar</button>
        {!d.last && (bekraftaBort ? (
          <div className="tona-in" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: AVSTAND.s, marginTop: AVSTAND.m }}>
            <span style={{ ...TYP.meta, color: FARG.text2 }}>{p.delar.length === 1 ? "Ta bort hela perioden?" : "Ta bort delen? Tiden går till närmaste arbetsdel."}</span>
            <div style={{ display: "flex", gap: AVSTAND.l }}>
              <button type="button" onClick={() => setBekraftaBort(false)} style={KNAPP.tertiar}>Nej</button>
              <button type="button" onClick={() => { const r = taBortDel(p.delar, d.nyckel); if (r) { p.onDelar(r); setBekraftaBort(false); setLage({ k: "lista" }); } }} style={KNAPP.destruktiv}>Ja, ta bort</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "center", marginTop: AVSTAND.s }}>
            <button type="button" onClick={() => setBekraftaBort(true)} style={KNAPP.destruktiv}>
              <span className="material-symbols-outlined" style={{ fontSize: IKON.text }}>delete</span>Ta bort delen
            </button>
          </div>
        ))}
      </>
    );
  }

  // ── LISTA ──
  const kanKlippa = kandidater(p.delar).length > 0;
  return (
    <>
      {bakLank(p.tillbakaText, p.onTillbaka)}
      <h1 style={{ margin: 0, ...TYP.titel }}>{p.titel}</h1>
      <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, ...TNUM, color: FARG.text2 }}>{timText(arbetad)} arbetad · {p.delar.length} {p.delar.length === 1 ? "del" : "delar"}</p>

      {p.delar.length > 0 && (
        <div style={{ marginTop: AVSTAND.l }}>
          <div role="img" aria-label="Dagens delar" style={{ display: "flex", gap: AVSTAND.xs, height: AVSTAND.m, borderRadius: AVSTAND.s, overflow: "hidden" }}>
            {p.delar.map((d, i) => <div key={d.nyckel} style={{ flex: Math.max(1, d.slut - d.start), background: farger[i] }} />)}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: AVSTAND.xs, ...TYP.micro, ...TNUM, color: FARG.text3 }}>
            <span>{hm(forstaTid)}</span><span>{hm(sistaTid)}</span>
          </div>
        </div>
      )}

      <section style={{ ...KORT, marginTop: AVSTAND.m, paddingTop: AVSTAND.xs, paddingBottom: AVSTAND.xs }}>
        {p.delar.length === 0 && <p style={{ margin: 0, padding: `${AVSTAND.m}px 0`, ...TYP.meta, color: FARG.text2 }}>Inga delar kvar — Spara tar bort perioden.</p>}
        {p.delar.map((d, i) => (
          <button key={d.nyckel} type="button" onClick={() => { setBekraftaBort(false); setLage({ k: "del", nyckel: d.nyckel }); }}
            style={{ display: "flex", alignItems: "center", gap: AVSTAND.m, width: "100%", minHeight: TRAFFYTA.min + AVSTAND.m, padding: `${AVSTAND.s}px 0`, background: "none", border: "none", borderTop: i === 0 ? "none" : `1px solid ${FARG.linje}`, cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: "inherit" }}>
            <span aria-hidden="true" style={{ width: AVSTAND.m, height: AVSTAND.m, borderRadius: AVSTAND.s, background: farger[i], flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", ...TYP.text, color: d.last ? FARG.text2 : FARG.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {delTypLabel(d.typ)}{arArbete(d) && d.objektId ? ` · ${p.traktNamn(d.objektId)}` : ""}
              </span>
              <span style={{ display: "block", ...TYP.meta, ...TNUM, color: FARG.text2 }}>{hm(d.start)}–{hm(d.slut)}{d.last && d.typ !== "lucka" ? " · ändras i Dag" : ""}</span>
            </span>
            <span style={{ ...TYP.text, ...TNUM, color: FARG.text, whiteSpace: "nowrap" }}>{langd(d)}</span>
            <span className="material-symbols-outlined" style={{ fontSize: IKON.text, color: FARG.text3, flexShrink: 0 }}>chevron_right</span>
          </button>
        ))}
      </section>

      {kanKlippa && (
        <button type="button" onClick={() => { const k = startKlipp(null); if (k) { setKlipp(k); setLage({ k: "klipp" }); } }} style={{ ...KNAPP.sekundar, marginTop: AVSTAND.m }}>
          <span className="material-symbols-outlined" style={{ fontSize: IKON.rad }}>content_cut</span>{p.delar.length > 1 ? "Klipp igen" : "Klipp upp dagen"}
        </button>
      )}

      {p.fel && <p role="alert" style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.orange }}>{p.fel}</p>}

      {rastFel && p.rastFraga && <p role="alert" style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.orange }}>{rastFel}</p>}
      {p.rastFraga
        ? (langdVal
          ? <RastLangd onTillbaka={() => { setLangdVal(false); setRastFel(null); }} onVal={min => {
              const r = laggTillRast(p.delar, min);
              if (r) { setLangdVal(false); setRastFel(null); p.onDelar(r); }
              else setRastFel("Rasten får inte plats i någon arbetsdel.");
            }} />
          : <RastFraga onIngen={() => p.onRastSvar("ingen")} onLagg={() => setLangdVal(true)} />)
        : (
          <button type="button" onClick={() => { if (!p.sparar) p.onSpara(); }} aria-disabled={p.sparar}
            style={{ ...KNAPP.primar, marginTop: AVSTAND.l, ...(p.sparar ? INAKTIV : {}) }}>
            {p.sparar ? "Sparar…" : p.delar.length === 0 ? "Ta bort perioden" : `Spara ${timText(arbetad)}`}
          </button>
        )}
    </>
  );
}
