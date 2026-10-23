"use client";
// Förare · Månad — varför blev lönen, övertiden och milen som de blev? Ett ark som Martin öppnar ur Löneunderlag.
//
// INGEN egen beräkning: allt kommer ur samma dry_run-svar som listan bakom, exporten och förarens egen spec (lönemotorn,
// lib/lonesystem/loneunderlag). Vymodellen (lib/admin/forarManadVy) ställer bara upp det; förarens spec-hjälpare
// (lib/lonesystem/forarText) ger samma ord och samma varningar som hon/han ser.
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getRödaDagar } from "@/lib/roda-dagar";
import { AVSTAND, FARG, TNUM, TRAFFYTA, TYP } from "@/lib/design/tokens";
import ManadRubrik from "@/components/design/ManadRubrik";
import { byggForarManad, type VyDag, type VyExtra } from "@/lib/admin/forarManadVy";
import { Ikon, Lank, Lista, Rad, Sektion, Sheet, Stod } from "./ui";

const fet = { color: FARG.text, fontWeight: TYP.listtitel.fontWeight, ...TNUM } as const;

function ExtraRader({ poster }: { poster: VyExtra[] }) {
  return (
    <>
      {poster.map((e, i) => (
        <Rad key={e.nyckel} attr={{ "data-extra-post": e.datum }} rubrik={e.text} detalj={e.kommentar ?? undefined}
          hoger={<span style={{ ...fet }}>{e.tid}</span>} sista={i === poster.length - 1} />
      ))}
    </>
  );
}

/** Bitarna skrivs med " · " emellan och bryts bara mellan bitarna, aldrig mitt i en ("160 km egen (appen: 118 km)"). */
function Bitar({ delar }: { delar: string[] }) {
  return <>{delar.map((t, i) => <React.Fragment key={i}>{i > 0 && " · "}<span style={{ display: "inline-block" }}>{t}</span></React.Fragment>)}</>;
}

/** En dag: datum och tid överst (hela bredden), tider och plats/km på egna rader under, varningen i orange. Hela raden är en knapp. */
function DagRad({ d, oppen, onVal, sista }: { d: VyDag; oppen: boolean; onVal: () => void; sista: boolean }) {
  return (
    <div data-dag={d.datum} style={{ padding: `${AVSTAND.m}px 0`, borderBottom: sista ? "none" : `1px solid ${FARG.linje}` }}>
      <button type="button" onClick={onVal} aria-expanded={oppen}
        style={{ display: "block", width: "100%", padding: 0, background: "none", border: "none", color: "inherit", fontFamily: "inherit", textAlign: "left", cursor: "pointer", minHeight: TRAFFYTA.min }}>
        <span style={{ display: "flex", alignItems: "center", gap: AVSTAND.m }}>
          <span style={{ flex: 1, minWidth: 0, ...TYP.listtitel, color: FARG.text }}>{d.rubrik}</span>
          <span style={{ ...TYP.meta, ...fet, whiteSpace: "nowrap" }}>{d.tid}</span>
          <Ikon namn="chevron_right" farg={FARG.text3} />
        </span>
        {d.radTid.length > 0 && <span style={{ display: "block", marginTop: AVSTAND.xs, ...TYP.meta, color: FARG.text2, ...TNUM }}><Bitar delar={d.radTid} /></span>}
        {d.radKm.length > 0 && <span style={{ display: "block", marginTop: AVSTAND.xs, ...TYP.meta, color: FARG.text2, ...TNUM }}><Bitar delar={d.radKm} /></span>}
        {d.avvikelser.length > 0 && <span data-dag-varning="" style={{ display: "block", marginTop: AVSTAND.xs, ...TYP.meta, color: FARG.orange }}>{d.avvikelser.join(" · ")}</span>}
      </button>
      {oppen && (
        <div data-dag-detalj="" style={{ paddingTop: AVSTAND.s }}>
          {d.detalj.map((t, i) => <p key={i} style={{ margin: i ? `${AVSTAND.xs}px 0 0` : 0, ...TYP.meta, color: t.includes("ingen uppgift") ? FARG.text3 : FARG.text2, ...TNUM }}>{t}</p>)}
          {d.extra.map(e => (
            <p key={e.nyckel} style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>
              Extra tid {e.tid} · {e.text.split(" · ").slice(1).join(" · ")}{e.kommentar ? ` · ${e.kommentar}` : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ForarManadArk({ m, arbetsManad, dag, onStang }: { m: any; arbetsManad: string; /** Dagen som ska stå öppen när arket öppnas (från ett vilobrott i Översikten). */ dag?: string; onStang: () => void }) {
  const [maskinNamn, setMaskinNamn] = useState<Record<string, string>>({});
  const [oppenDag, setOppenDag] = useState<string | null>(null);
  const [visaMil, setVisaMil] = useState(false);

  useEffect(() => {
    let avbruten = false;
    supabase.from("dim_maskin").select("maskin_id, visningsnamn, modell").then(({ data }) => {
      if (avbruten) return;
      const ut: Record<string, string> = {};
      for (const r of data || []) ut[r.maskin_id] = r.visningsnamn || r.modell || r.maskin_id;
      setMaskinNamn(ut);
    });
    return () => { avbruten = true; };
  }, []);

  const vy = useMemo(() => {
    const ar = Number(arbetsManad.slice(0, 4));
    return byggForarManad(m, { rodaDagar: { ...getRödaDagar(ar - 1), ...getRödaDagar(ar) }, maskinNamn });
  }, [m, arbetsManad, maskinNamn]);

  // En dag som angetts utifrån (?dag=) står öppen och rullas fram — en gång, så att ett eget tryck sedan gäller.
  const [dagVald, setDagVald] = useState<string | null>(null);
  useEffect(() => {
    if (!dag || dagVald === dag) return;
    const rad = vy.dagar.find(d => d.datum === dag);
    if (!rad) return;
    setDagVald(dag);
    setOppenDag(rad.nyckel);
    setTimeout(() => document.querySelector(`[data-dag="${dag}"]`)?.scrollIntoView?.({ block: "center" }), 50);
  }, [dag, dagVald, vy.dagar]);

  const u = vy.utrakning;
  const forNamn = vy.namn.split(" ")[0];

  return (
    <Sheet titel={forNamn} onStang={onStang} vanster={<Lank smal onClick={onStang}>Stäng</Lank>} attr={{ "data-forare-manad": m.medarbetare_id }}>
      {/* Svaret först: övertiden, stor, med decimalen bredvid. */}
      <div style={{ textAlign: "center", padding: `${AVSTAND.s}px 0 ${AVSTAND.l}px` }}>
        <p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}><ManadRubrik arbetsManad={arbetsManad} /></p>
        {vy.foretagsledare ? (
          <p data-foretagsledare="" style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.listtitel, color: FARG.text2 }}>Företagsledare – lön utanför appen</p>
        ) : (
          <>
            <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.micro, color: FARG.text2 }}>Övertid</p>
            <p data-svar="" style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.tal, color: FARG.text, ...TNUM }}>{vy.overtid}</p>
          </>
        )}
      </div>

      {!vy.foretagsledare && (
        <>
          <Sektion topp={AVSTAND.s}>Så blev det</Sektion>
          <Lista>
            {u.delar.map((d, i) => (
              <Rad key={d.nyckel} attr={{ "data-del": d.nyckel }} rubrik={`${i === 0 ? "" : "+ "}${d.text}`} hoger={<span style={fet}>{d.varde}</span>} />
            ))}
            <Rad attr={{ "data-arbetat": "" }} rubrik="= Arbetat" hoger={<span style={fet}>{u.arbetat}</span>} />
            <Rad attr={{ "data-ordinarie": "" }} rubrik="− Ordinarie" detalj={u.ordinarieForklaring} hoger={<span style={fet}>{u.ordinarie}</span>} />
            <Rad attr={{ "data-overtid": "" }} rubrik="= Övertid" hoger={<span style={fet}>{u.overtid}</span>} sista />
          </Lista>
          {u.notis && <Stod farg={FARG.orange}>{u.notis}</Stod>}

          {u.extra.length > 0 && (
            <>
              <Sektion>Extra tid, rad för rad</Sektion>
              <Lista><ExtraRader poster={u.extra} /></Lista>
            </>
          )}

          {vy.lonerader.length > 0 && (
            <>
              <Sektion>Lönerader</Sektion>
              <Lista>
                {vy.lonerader.map((r, i) => (
                  <Rad key={r.nyckel} attr={{ "data-lonerad": r.nyckel }} rubrik={r.rubrik} detalj={r.detalj ?? undefined}
                    hoger={<span style={fet}>{r.varde}</span>} sista={i === vy.lonerader.length - 1} />
                ))}
              </Lista>
            </>
          )}

          <Sektion>Mil</Sektion>
          <Lista>
            <Rad attr={{ "data-mil": "" }} rubrik="Ersätts" detalj={vy.km.sa} hoger={<span style={fet}>{vy.km.mil}</span>} />
            <Rad attr={{ "data-km": "" }} rubrik="Körda" detalj={vy.km.over ?? undefined} hoger={<span style={fet}>{vy.km.totalt}</span>}
              sista={vy.km.dagarOver.length === 0} />
            {vy.km.dagarOver.length > 0 && (
              <Rad rubrik={`${vy.km.dagarOver.length} ${vy.km.dagarOver.length === 1 ? "dag" : "dagar"} över gränsen`} chevron onClick={() => setVisaMil(v => !v)} sista>
                {visaMil && vy.km.dagarOver.map(d => <p key={d.datum} style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2, ...TNUM }}>{d.text}</p>)}
              </Rad>
            )}
          </Lista>
        </>
      )}

      <Sektion>Maskintid</Sektion>
      <Lista>
        <Rad attr={{ "data-lonekvot": "" }} rubrik="Lönekvot" detalj={vy.lonekvot.detalj} hoger={<span style={fet}>{vy.lonekvot.varde}</span>} sista />
      </Lista>

      <Sektion>Dagar</Sektion>
      {vy.dagar.length === 0 ? (
        <Stod>Inga arbetsdagar den här månaden.</Stod>
      ) : (
        <Lista>
          {vy.dagar.map((d, i) => (
            <DagRad key={d.nyckel} d={d} oppen={oppenDag === d.nyckel} onVal={() => setOppenDag(o => (o === d.nyckel ? null : d.nyckel))} sista={i === vy.dagar.length - 1} />
          ))}
        </Lista>
      )}
    </Sheet>
  );
}
