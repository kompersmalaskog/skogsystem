"use client";
// Vilobrott → dagarna. Tryck på en vilobrottsrad i Översikten och se dagarna brottet gäller: dygnsvila = dagen före (slut) och dagen efter
// (start) med vilan mot kravet; veckovila = veckan med den längsta sammanhängande vilan utpekad. Ett brott per rad; har föraren flera
// är de flera rader. INGEN uträkning här: vymodellen (lib/admin/vilobrottArkVy) ställer upp det vilobrottDagar redan räknat.
//
// Admin svarar inte på ett vilobrott: svaret skrivs av föraren i sin Arbetsrapport (tabellen vilobrott, besvarat_av_forare). Arket visar
// att brottet är obesvarat, och förarens svar när det finns.
import React, { useState } from "react";
import { AVSTAND, FARG, TNUM, TYP } from "@/lib/design/tokens";
import type { VilobrottArkBrott, VilobrottArkVy, VilobrottPerson } from "@/lib/admin/vilobrottArkVy";
import { Lank, Lista, Rad, Sektion, Sheet } from "./ui";

function Dagar({ b }: { b: VilobrottArkBrott }) {
  if (b.rader.length === 0) {
    // Brottet gick inte att peka ut i underlaget: säg det och visa brottets egen beskrivning, aldrig gissade dagar.
    return <p data-vila-beskrivning="" style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text2 }}>{b.beskrivning}</p>;
  }
  return (
    <div data-vila-dagar="" style={{ marginTop: AVSTAND.s }}>
      {b.fonster && <p style={{ margin: `0 0 ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.text2 }}>{b.fonster}</p>}
      {b.rader.map(r => r.slag === "pass" ? (
        <div key={r.nyckel} data-vila-pass={r.datum} style={{ display: "flex", justifyContent: "space-between", gap: AVSTAND.m, padding: `${AVSTAND.xs}px 0`, ...TYP.text, color: FARG.text }}>
          <span>{r.dag}</span><span style={TNUM}>{r.tid}</span>
        </div>
      ) : (
        <div key={r.nyckel} data-vila-vila="" style={{ padding: `${AVSTAND.xs}px 0 ${AVSTAND.xs}px ${AVSTAND.m}px`, borderLeft: `2px solid ${FARG.orange}` }}>
          <div style={{ ...TYP.listtitel, color: FARG.orange, ...TNUM }}>{r.rubrik}</div>
          <div style={{ ...TYP.meta, color: FARG.text2, ...TNUM }}>{r.detalj}</div>
        </div>
      ))}
    </div>
  );
}

/** Listan bakom raden "Vilobrott": vem som har obesvarade. Ett tryck på en person öppnar hennes dagar (VilobrottArk). */
export function VilobrottLista({ personer, onPerson, onStang }: { personer: VilobrottPerson[]; onPerson: (id: string) => void; onStang: () => void }) {
  return (
    <Sheet titel="Vilobrott" onStang={onStang} vanster={<Lank smal onClick={onStang}>Stäng</Lank>} attr={{ "data-vilobrott-lista": "" }}>
      <Lista>
        {personer.map((p, i) => (
          <Rad key={p.medarbetare_id} attr={{ "data-vilobrott-person": p.medarbetare_id }} rubrik={p.namn} detalj={p.text} chevron
            onClick={() => onPerson(p.medarbetare_id)} sista={i === personer.length - 1} />
        ))}
      </Lista>
    </Sheet>
  );
}

export default function VilobrottArk({ vy, hamtaManad, onStang, tillbaka }: {
  vy: VilobrottArkVy;
  /** Kom man hit från listan över personer: ‹ Vilobrott tar tillbaka dit (Stäng lämnar allt). */
  tillbaka?: () => void;
  /** Vart "Se hela månaden" går: en funktion som öppnar Förare · Månad på dagen, eller null när månaden inte går att öppna än (då visas ingen länk). */
  hamtaManad: (b: VilobrottArkBrott) => (() => void) | null;
  onStang: () => void;
}) {
  // Ett brott: öppet från början (inget att välja). Flera: stängda, ett tryck fäller ut dagarna på plats.
  const [oppen, setOppen] = useState<string | null>(vy.brott.length === 1 ? vy.brott[0].nyckel : null);
  return (
    <Sheet titel={vy.forstaNamn} onStang={onStang} attr={{ "data-vilobrott-ark": vy.medarbetare_id }}
      vanster={tillbaka ? <Lank smal onClick={tillbaka}>‹ Vilobrott</Lank> : <Lank smal onClick={onStang}>Stäng</Lank>}
      hoger={tillbaka ? <Lank smal onClick={onStang}>Stäng</Lank> : undefined}>
      <Sektion orange topp={AVSTAND.s}>{vy.rubrik}</Sektion>
      <Lista>
        {vy.brott.map((b, i) => {
          const visa = oppen === b.nyckel;
          const manad = visa ? hamtaManad(b) : null;
          return (
            <Rad key={b.nyckel} attr={{ "data-vilobrott": b.nyckel }} rubrik={b.rubrik} hoger={<span style={{ ...TNUM, color: FARG.orange }}>{b.hoger}</span>}
              chevron onClick={() => setOppen(o => (o === b.nyckel ? null : b.nyckel))} sista={i === vy.brott.length - 1}>
              {visa && (
                <div data-vilobrott-detalj="">
                  <Dagar b={b} />
                  <p data-vila-svar="" style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text2 }}>{b.svarText}</p>
                  {/* Länken finns bara när månaden går att öppna; för innevarande månad är den dold, utan förklaring (arket visar redan dagarna). */}
                  {manad && <div style={{ marginTop: AVSTAND.s }}><Lank smal onClick={manad}>Se hela månaden ›</Lank></div>}
                </div>
              )}
            </Rad>
          );
        })}
      </Lista>
    </Sheet>
  );
}
