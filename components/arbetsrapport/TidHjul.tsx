"use client";
// Tid som Apples Kalender (Martin 2026-11-26): två rader, Från och Till. Ett tryck på en rad
// fäller ut två hjul under den — timmar och minuter (5-minuterssteg). Man snurrar med tummen,
// mushjulet eller drar med musen; ett tryck på en siffra väljer den. Ingen OK-knapp.
// Inget är ifyllt förrän föraren öppnar raden. Ändras Från när Till finns flyttas Till med
// (längden behålls), som i Kalender.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TYP, TNUM, AVSTAND, RADIE, FARG, TRAFFYTA, VIKT } from "@/lib/design/tokens";

const RAD_H = TRAFFYTA.min;      // en rad i hjulet = minsta träffyta
const SYNLIGA = 5;               // rader som syns, vald i mitten

const p2 = (n: number) => String(n).padStart(2, "0");
const tillMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const tillTid = (m: number) => { const x = ((m % 1440) + 1440) % 1440; return `${p2(Math.floor(x / 60))}:${p2(x % 60)}`; };

function Hjul({ varden, vald, onValj, etikett }: { varden: number[]; vald: number; onValj: (v: number) => void; etikett: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ y: number; top: number } | null>(null);
  const index = Math.max(0, varden.indexOf(vald));

  // Hjulet står där värdet är (också när värdet ändras utifrån, t.ex. Till som följer Från).
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    if (Math.round(el.scrollTop / RAD_H) !== index) el.scrollTop = index * RAD_H;
  }, [index]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onScroll = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = ref.current; if (!el) return;
      const i = Math.min(varden.length - 1, Math.max(0, Math.round(el.scrollTop / RAD_H)));
      if (varden[i] !== vald) onValj(varden[i]);
    }, 90);
  };

  return (
    <div style={{ position: "relative", flex: 1, height: RAD_H * SYNLIGA }}>
      <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: RAD_H * 2, height: RAD_H, background: FARG.fyllning, borderRadius: RADIE.rad, pointerEvents: "none" }} />
      <div ref={ref} role="listbox" aria-label={etikett} data-hjul={etikett} onScroll={onScroll}
        onPointerDown={e => { if (e.pointerType !== "mouse") return; drag.current = { y: e.clientY, top: ref.current!.scrollTop }; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }}
        onPointerMove={e => { if (!drag.current || !ref.current) return; ref.current.scrollTop = drag.current.top - (e.clientY - drag.current.y); }}
        onPointerUp={() => { drag.current = null; }}
        style={{ position: "relative", height: "100%", overflowY: "auto", scrollSnapType: "y mandatory", scrollbarWidth: "none", overscrollBehavior: "contain", touchAction: "pan-y" }}>
        <div style={{ height: RAD_H * 2 }} />
        {varden.map(v => (
          <button key={v} role="option" aria-selected={v === vald} data-hjul-val={v}
            onClick={() => { if (v !== vald) onValj(v); }}
            style={{ display: "block", width: "100%", height: RAD_H, scrollSnapAlign: "center", background: "none", border: "none", fontFamily: "inherit", cursor: "pointer",
              ...TYP.text, ...TNUM, fontWeight: v === vald ? VIKT.fet : VIKT.normal, color: v === vald ? FARG.text : FARG.text3 }}>
            {p2(v)}
          </button>
        ))}
        <div style={{ height: RAD_H * 2 }} />
      </div>
    </div>
  );
}

const TIMMAR = Array.from({ length: 24 }, (_, i) => i);
const MINUTER = Array.from({ length: 12 }, (_, i) => i * 5);

export default function TidHjul({ start, slut, onAndra, startForslag }: {
  start: string; slut: string;
  onAndra: (start: string, slut: string) => void;
  /** Var Från-hjulet börjar när inget är valt (passets slut, annars 07:00). Skrivs först när raden öppnas. */
  startForslag?: string;
}) {
  const [oppen, setOppen] = useState<"start" | "slut" | null>(null);

  const oppna = (vilken: "start" | "slut") => {
    if (oppen === vilken) { setOppen(null); return; }
    setOppen(vilken);
    // Raden får ett värde när den öppnas — som i Kalender. Till börjar där Från står.
    if (vilken === "start" && !start) onAndra(startForslag || "07:00", slut);
    if (vilken === "slut" && !slut) onAndra(start, start || startForslag || "07:00");
  };

  const sattStart = (t: string) => {
    if (slut && start) onAndra(t, tillTid(tillMin(slut) + tillMin(t) - tillMin(start)));
    else onAndra(t, slut);
  };

  const rad = (vilken: "start" | "slut", etikett: string, varde: string) => {
    const aktiv = oppen === vilken;
    const [h, m] = (varde || "00:00").split(":").map(Number);
    const minuter = MINUTER.includes(m) ? MINUTER : [...MINUTER, m].sort((a, b) => a - b);
    const satt = (nh: number, nm: number) => { const t = `${p2(nh)}:${p2(nm)}`; vilken === "start" ? sattStart(t) : onAndra(start, t); };
    return (
      <div key={vilken} style={{ borderTop: vilken === "slut" ? `1px solid ${FARG.linje}` : "none" }}>
        <button data-tidrad-knapp={vilken} onClick={() => oppna(vilken)} aria-expanded={aktiv}
          style={{ display: "flex", alignItems: "center", width: "100%", minHeight: TRAFFYTA.min + AVSTAND.s, padding: `0 ${AVSTAND.m}px`, background: "none", border: "none", color: FARG.text, fontFamily: "inherit", cursor: "pointer" }}>
          <span style={{ flex: 1, textAlign: "left", ...TYP.text, color: FARG.text2 }}>{etikett}</span>
          <span data-tid-varde={vilken} style={{ ...TYP.text, ...TNUM, fontWeight: aktiv ? VIKT.fet : VIKT.normal, padding: `${AVSTAND.xs}px ${AVSTAND.s}px`, borderRadius: RADIE.rad, background: aktiv ? FARG.fyllning : "none" }}>
            {varde || "--:--"}
          </span>
        </button>
        {aktiv && varde && (
          <div style={{ display: "flex", gap: AVSTAND.s, padding: `0 ${AVSTAND.m}px ${AVSTAND.s}px` }}>
            <Hjul etikett={`${etikett} timme`} varden={TIMMAR} vald={h} onValj={nh => satt(nh, m)} />
            <Hjul etikett={`${etikett} minut`} varden={minuter} vald={m} onValj={nm => satt(h, nm)} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ background: FARG.upphojt, borderRadius: RADIE.kort, overflow: "hidden" }}>
      {rad("start", "Från", start)}
      {rad("slut", "Till", slut)}
    </div>
  );
}
