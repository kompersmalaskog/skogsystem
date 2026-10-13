"use client";
// ─────────────────────────────────────────────────────────────
// Kalenderblad för raden Börjar i utjämningsperiodens ark (iOS Kalender-stil): ALLA månader som perioden täcker, staplade under varandra med en
// månadsrubrik per månad, plus en månad före och en efter perioden, så att Börjar går att välja i en annan månad genom att rulla.
// Bandet löper över månadsskiftena. Ett tryck på valfri dag sätter Börjar till den veckans måndag; måndagen i första veckan är en cirkel.
//
// Längd ökar → perioden går in i en ny månad, den läggs till och slutveckan rullas i sikte. Längd minskar → månader som inte längre berörs
// försvinner. Bladet har en FAST höjd och rullar inuti sig själv: stegaren under bladet ligger kvar på samma ställe medan man trycker +/−.
// Området över första månaden växer bara (ett tryck i månaden före lägger till ytterligare en månad före) och rullningen kompenseras så att
// inget hoppar. Inga pilar: man rullar.
//
// Röda dagar (lib/roda-dagar) har röd siffra, data-roda och en beskrivning i aria-label; dagar som redan ligger i en annan period för
// de valda förarna får en liten prick (periodens namn i data-krock). Det är upplysningar, aldrig spärrar.
// ─────────────────────────────────────────────────────────────
import React, { useLayoutEffect, useRef } from "react";
import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP } from "@/lib/design/tokens";
import { ymdLokal } from "@/lib/datumLokal";
import { getRödaDagar } from "@/lib/roda-dagar";
import { arDagIPerioden, krockText, manadRubrik, manadVeckor, mandagForDag, slutFranMandag, slutMandag } from "@/lib/admin/utjamningsperiod";

type Krock = { namn?: string | null; anteckning?: string | null; startdatum?: string; slutdatum?: string };

const VECKODAGAR = ["M", "T", "O", "T", "F", "L", "S"];
const KOLUMNER = { display: "grid", gridTemplateColumns: "repeat(7, 1fr)" } as const;
/**
 * Bladets synliga höjd är FAST (stegaren under flyttar sig inte): högst tio dagrader (44 px), som rymmer en period över ett månadsskifte med
 * rubrikerna, men krymper på låga fönster så att arket inte behöver rulla för att nå Längd/Förare: fönstret minus de andra raderna i arket
 * (KALENDER_OVRIGT, ett layoutmått), aldrig under sex rader. vh är reserv för webbläsare utan dvh.
 */
const KALENDER_MAX = TRAFFYTA.min * 10;
const KALENDER_MIN = TRAFFYTA.min * 6;
const KALENDER_OVRIGT = 450;
const kalenderCss = `
  .kal-rulle { height: clamp(${KALENDER_MIN}px, calc(100vh - ${KALENDER_OVRIGT}px), ${KALENDER_MAX}px); height: clamp(${KALENDER_MIN}px, calc(100dvh - ${KALENDER_OVRIGT}px), ${KALENDER_MAX}px); }
`;

/** Månadsnummer som ett tal: år*12 + månad0, så att månader går att jämföra och räkna med. */
const manadIdx = (dag: string) => Number(dag.slice(0, 4)) * 12 + (Number(dag.slice(5, 7)) - 1);

export default function PeriodKalender({ borjar, langd, onTryck, krockerIVecka }: {
  /** Måndagen i första veckan. */
  borjar: string;
  /** Antal veckor. */
  langd: number;
  onTryck: (dag: string) => void;
  /** Perioder som ligger över veckan (måndag) för de valda förarna. */
  krockerIVecka: (mandag: string) => Krock[];
}) {
  const idag = ymdLokal(new Date());
  const period = { fran: borjar, till: slutMandag(borjar, langd) };
  const sistaDag = slutFranMandag(period.till);              // söndagen i sista veckan

  // Månaderna: en före första veckans månad, till en efter sista dagens. Början växer bara, så ett tryck i månaden före inte flyttar bladet.
  const golv = useRef<number | null>(null);
  const forstaIdx = Math.min(golv.current ?? Infinity, manadIdx(borjar) - 1);
  golv.current = forstaIdx;
  const sistaIdx = manadIdx(sistaDag) + 1;
  const manader: { ar: number; manad0: number }[] = [];
  for (let i = forstaIdx; i <= sistaIdx; i++) manader.push({ ar: Math.floor(i / 12), manad0: i % 12 });
  const rodaPerAr: Record<number, Record<string, string>> = {};
  const roda = (ar: number) => (rodaPerAr[ar] ||= getRödaDagar(ar));

  const rulle = useRef<HTMLDivElement>(null);
  const forre = useRef<{ forst: number; hojd: number; langd: number } | null>(null);
  useLayoutEffect(() => {
    const el = rulle.current;
    if (!el) return;
    const dagEl = (dag: string) => el.querySelector<HTMLElement>(`[data-dag="${dag}"]`);
    const f = forre.current;
    if (!f) {
      // Första gången: veckan där perioden börjar högst upp, med en rad före som sammanhang.
      const start = dagEl(borjar);
      if (start) el.scrollTop += start.getBoundingClientRect().top - el.getBoundingClientRect().top - TRAFFYTA.min;
    } else {
      if (forstaIdx < f.forst) el.scrollTop += el.scrollHeight - f.hojd;            // en månad lades till ÖVER det man tittar på
      if (langd !== f.langd) {
        // Längd ändrades: perioden ska synas. Ryms hela perioden (första veckan till sista) i bladet läggs den mitt i bladet; annars
        // ligger slutveckan nederst med en rad luft. Rullar inte alls om första och sista veckan redan syns.
        const start = dagEl(borjar), slut = dagEl(sistaDag);
        if (start && slut) {
          const a1 = start.getBoundingClientRect(), a2 = slut.getBoundingClientRect(), v = el.getBoundingClientRect();
          if (!(a1.top >= v.top && a2.bottom <= v.bottom)) {
            const span = a2.bottom - a1.top;
            if (span <= v.height) el.scrollTop += a1.top - (v.top + (v.height - span) / 2);
            else el.scrollTop += a2.bottom - (v.bottom - TRAFFYTA.min);
          }
        }
      }
    }
    forre.current = { forst: forstaIdx, hojd: el.scrollHeight, langd };
  });

  return (
    <div data-period-kalender style={{ padding: `${AVSTAND.xs}px ${AVSTAND.xs}px ${AVSTAND.s}px` }}>
      <div style={KOLUMNER}>
        {VECKODAGAR.map((v, i) => <span key={i} data-veckodag style={{ ...TYP.micro, color: FARG.text3, textAlign: "center", padding: `${AVSTAND.xs}px 0` }}>{v}</span>)}
      </div>
      <style>{kalenderCss}</style>
      <div ref={rulle} data-kalender-rulle className="kal-rulle" style={{ overflowY: "auto", overscrollBehavior: "contain", overflowAnchor: "none", position: "relative" }}>
        {manader.map(({ ar, manad0 }) => (
          <div key={`${ar}-${manad0}`} data-manad-nu={`${ar}-${String(manad0 + 1).padStart(2, "0")}`}>
            <div data-manad-rubrik style={{ ...TYP.listtitel, color: FARG.text, padding: `${AVSTAND.m}px ${AVSTAND.xs}px ${AVSTAND.xs}px` }}>{manadRubrik(ar, manad0)}</div>
            {manadVeckor(ar, manad0).map((rad, r) => (
              <div key={r} style={KOLUMNER}>
                {rad.map((dag, k) => {
                  if (!dag) return <span key={k} />;
                  const iPerioden = arDagIPerioden(period, dag);
                  const arStart = dag === borjar;
                  const kt = krockText(krockerIVecka(mandagForDag(dag)));
                  const rod = roda(ar)[dag];
                  const dagNr = Number(dag.slice(8));
                  return (
                    <button key={dag} type="button" data-dag={dag} data-veckodag-nr={k} aria-pressed={iPerioden}
                      aria-label={`${dagNr} ${manadRubrik(ar, manad0)}${rod ? `, röd dag (${rod})` : ""}${kt ? `, ${kt}` : ""}`}
                      data-start={arStart ? "true" : undefined} data-roda={rod ? "true" : undefined} data-krock={kt || undefined}
                      onClick={() => onTryck(dag)}
                      style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", minHeight: TRAFFYTA.min, padding: 0, border: "none", cursor: "pointer", fontFamily: "inherit",
                        background: iPerioden ? FARG.upphojt : "transparent", color: rod && !arStart ? FARG.rod : FARG.text, ...TYP.text, ...(dag === idag ? { fontWeight: TYP.listtitel.fontWeight } : null) }}>
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: AVSTAND.xxl + AVSTAND.s, height: AVSTAND.xxl + AVSTAND.s, borderRadius: RADIE.cirkel,
                        ...(arStart ? { background: FARG.text, color: FARG.bg, fontWeight: TYP.listtitel.fontWeight } : null) }}>{dagNr}</span>
                      {kt && <span data-krock-prick style={{ position: "absolute", bottom: AVSTAND.xs, width: AVSTAND.xs, height: AVSTAND.xs, borderRadius: RADIE.cirkel, background: FARG.text3 }} />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
