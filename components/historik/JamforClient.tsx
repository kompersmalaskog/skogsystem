"use client";
// Historikvyn (admin): jämför 2–4 maskiner, eller "Samma förare" (SammaForare.tsx: en förare på flera maskiner). Skördare: en åtgärd i taget (gallring/slutavverkning) med viktat index mot åtgärdens egen kurva.
// Skotare: alla åtgärder tillsammans, m³/G15 och lass/G15, inget index (skotningsavstånd saknas).
// Tillstånd i URL:ens hash (#t=skordare&g=gallring&m=A|B&an=1; samma förare: #l=forare&f=Namn&g=gallring). Läser bara; RLS släpper bara in roll = 'admin'.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AVSTAND, designCss, FARG, KNAPP, RAD, TNUM, TRAFFYTA, TYP, VY_ROT, RADIE } from "@/lib/design/tokens";
import { hamtaMaskinAr } from "@/lib/historik/data";
import { felSlag, felText, type HistorikFelSlag } from "@/lib/historik/fel";
import { SKOTARE_UTAN_INDEX } from "@/lib/historik/indexForklaring";
import IndexInfo from "./IndexInfo";
import { ATGARD_ETIKETT, antagnaTotalt, jamforRader, jamforSerie, JAMFOR_MAX, JAMFOR_MIN, maskinerMedObjekt } from "@/lib/historik/berakna";
import type { AtgardKod, MaskinArRad, MaskinTyp } from "@/lib/historik/typer";
import { Linjediagram, linjeGlyf, maskinFarg, Notis, Sektion, Vaxel } from "./delar";
import SammaForare from "./SammaForare";

type Lage = "maskiner" | "forare";
type Jv = { lage: Lage; typ: MaskinTyp; atgard: "gallring" | "slutavverkning"; valda: string[] | null; antagna: boolean; forare: string | null };
const START: Jv = { lage: "maskiner", typ: "skördare", atgard: "gallring", valda: null, antagna: false, forare: null };

function urHash(): Jv {
  if (typeof window === "undefined") return START;
  const p = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const m = p.get("m");
  return {
    lage: p.get("l") === "forare" ? "forare" : "maskiner",
    forare: p.get("f") || null,
    typ: p.get("t") === "skotare" ? "skotare" : "skördare",
    atgard: p.get("g") === "slutavverkning" ? "slutavverkning" : "gallring",
    valda: m ? m.split("|").filter(Boolean) : null,
    antagna: p.get("an") === "1",
  };
}

function tillHash(v: Jv): string {
  const p = new URLSearchParams();
  if (v.lage === "forare") p.set("l", "forare");
  if (v.lage === "forare" && v.forare) p.set("f", v.forare);
  p.set("t", v.typ === "skotare" ? "skotare" : "skordare");
  if (v.typ === "skördare") p.set("g", v.atgard);
  if (v.valda) p.set("m", v.valda.join("|"));
  if (v.antagna && v.typ === "skördare") p.set("an", "1");
  return "#" + p.toString();
}

function useJv() {
  const [jv, setJv] = useState<Jv>(START);
  useEffect(() => {
    setJv(urHash());
    const lyssna = () => setJv(urHash());
    window.addEventListener("popstate", lyssna);
    window.addEventListener("hashchange", lyssna);
    return () => { window.removeEventListener("popstate", lyssna); window.removeEventListener("hashchange", lyssna); };
  }, []);
  const gaTill = useCallback((patch: Partial<Jv>) => {
    setJv((nu) => {
      const ny = { ...nu, ...patch };
      if (typeof window !== "undefined") window.history.replaceState(null, "", tillHash(ny));
      return ny;
    });
  }, []);
  return [jv, gaTill] as const;
}

export default function JamforClient() {
  const [rader, setRader] = useState<MaskinArRad[] | null>(null);
  const [fel, setFel] = useState<HistorikFelSlag | null>(null);
  const [jv, gaTill] = useJv();

  useEffect(() => {
    let avbruten = false;
    hamtaMaskinAr(supabase)
      .then((r) => { if (!avbruten) setRader(r); })
      .catch((e: unknown) => { console.error("historik: kunde inte läsa vy_hist_maskin_ar", e); if (!avbruten) setFel(felSlag(e)); });
    return () => { avbruten = true; };
  }, []);

  return (
    <div style={VY_ROT}>
      <style>{designCss}</style>
      <div style={{ maxWidth: AVSTAND.xxl * 20, margin: "0 auto", paddingBottom: AVSTAND.xxl * 2 }}>
        <a href="/admin/historik" style={{ ...KNAPP.lank, marginTop: AVSTAND.s, textDecoration: "none" }}>‹ Historik</a>
        <h1 style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.titel }}>Jämför maskiner</h1>
        {fel ? (
          <div style={{ paddingTop: AVSTAND.xl }}>
            <h2 style={{ margin: 0, ...TYP.rubrik }}>Kunde inte läsa historiken</h2>
            <p style={{ ...TYP.text, color: FARG.text2 }}>{felText(fel)}</p>
          </div>
        ) : rader === null ? (
          <p style={{ ...TYP.text, color: FARG.text2, paddingTop: AVSTAND.xl }}>Hämtar maskinsammanställningen …</p>
        ) : (
          <>
            <div style={{ marginTop: AVSTAND.l }}>
              <Vaxel varden={[{ id: "maskiner" as Lage, etikett: "Maskiner" }, { id: "forare" as Lage, etikett: "Samma förare" }]} valt={jv.lage} onVal={(l) => gaTill({ lage: l })} />
            </div>
            {jv.lage === "forare" ? <SammaForare rader={rader} forare={jv.forare} atgard={jv.atgard} gaTill={gaTill} /> : <Jamfor rader={rader} jv={jv} gaTill={gaTill} />}
          </>
        )}
      </div>
    </div>
  );
}

function Jamfor({ rader, jv, gaTill }: { rader: MaskinArRad[]; jv: Jv; gaTill: (p: Partial<Jv>) => void }) {
  const typ = jv.typ;
  const atgard: AtgardKod | null = typ === "skotare" ? null : jv.atgard;
  const medAntagna = typ === "skördare" && jv.antagna;
  const kandidater = useMemo(() => maskinerMedObjekt(rader, typ, atgard, medAntagna), [rader, typ, atgard, medAntagna]);
  const antagna = typ === "skördare" ? antagnaTotalt(rader, jv.atgard) : 0;
  const finns = new Set(kandidater.map((k) => k.maskin));
  // förval: de två maskiner som har flest objekt; en tidigare vald maskin som inte har objekt i åtgärden tas bort
  const valda = (jv.valda ?? kandidater.slice(0, JAMFOR_MIN).map((k) => k.maskin)).filter((m) => finns.has(m)).slice(0, JAMFOR_MAX);
  const index = typ === "skördare";
  const serier = valda.map((m) => ({ namn: m, punkter: jamforSerie(rader, m, atgard, medAntagna) }));
  const tabell = valda.length >= JAMFOR_MIN ? jamforRader(rader, valda, typ, atgard, medAntagna) : [];

  function vaxla(m: string) {
    // en femte maskin byter ut den äldst valda: ingen knapp är någonsin inaktiv
    const nu = valda.includes(m) ? valda.filter((x) => x !== m) : valda.length < JAMFOR_MAX ? [...valda, m] : [...valda.slice(1), m];
    gaTill({ valda: nu });
  }

  return (
    <div>
      <Sektion titel="Vad ska jämföras">
        <Vaxel varden={[{ id: "skördare" as MaskinTyp, etikett: "Skördare" }, { id: "skotare" as MaskinTyp, etikett: "Skotare" }]} valt={typ} onVal={(t) => gaTill({ typ: t, valda: null })} />
        {typ === "skördare" && (
          <div style={{ marginTop: AVSTAND.m }}>
            <Vaxel varden={[{ id: "gallring", etikett: "Gallring" }, { id: "slutavverkning", etikett: "Slutavverkning" }]} valt={jv.atgard} onVal={(g) => gaTill({ atgard: g, valda: null })} />
            {antagna > 0 && (
              <button type="button" aria-pressed={jv.antagna} onClick={() => gaTill({ antagna: !jv.antagna, valda: null })} style={{ ...KNAPP.sekundar, marginTop: AVSTAND.m }}>
                {jv.antagna ? `Antagna ingår (${antagna}). Tryck för att ta bort` : `+${antagna} antagna objekt ingår inte. Tryck för att ta med`}
              </button>
            )}
          </div>
        )}
        <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.m}px 0 0` }}>
          {typ === "skördare" ? <>Index<IndexInfo rader={rader} /> mot {ATGARD_ETIKETT[jv.atgard].toLowerCase()}kurvan. Bara maskiner med objekt i {ATGARD_ETIKETT[jv.atgard].toLowerCase()} kan väljas.</> : `Skotare jämförs över alla åtgärder tillsammans. ${SKOTARE_UTAN_INDEX}`}
        </p>
      </Sektion>

      <Sektion typ={typ} titel={`Välj ${JAMFOR_MIN}–${JAMFOR_MAX} maskiner`}>
        {kandidater.length === 0 ? (
          <p style={{ ...TYP.text, color: FARG.text2, margin: 0 }}>Inga maskiner har objekt i den här åtgärden med åtgärd ur namn eller ämne.{antagna > 0 ? " Tryck på knappen ovan för att ta med antagna." : ""}</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: AVSTAND.s }}>
            {kandidater.map((k) => {
              const vald = valda.includes(k.maskin);
              return (
                <button
                  key={k.maskin}
                  type="button"
                  aria-pressed={vald}
                  onClick={() => vaxla(k.maskin)}
                  style={{
                    minHeight: TRAFFYTA.min, border: "none", borderRadius: RADIE.knapp, padding: `${AVSTAND.s}px ${AVSTAND.m}px`, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                    background: vald ? FARG.upphojt : FARG.kort, color: FARG.text, ...(vald ? TYP.listtitel : TYP.text), fontSize: TYP.meta.fontSize,
                  }}
                >
                  {vald ? `${linjeGlyf(valda.indexOf(k.maskin))} ` : ""}{k.maskin}
                  <span style={{ display: "block", ...TYP.micro, textTransform: "none", color: FARG.text2, fontWeight: 400 }}>{k.antal} objekt{!jv.antagna && k.urval === "alla" ? " (bara antagna)" : ""}</span>
                </button>
              );
            })}
          </div>
        )}
        {valda.length >= JAMFOR_MAX && <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 0` }}>Högst {JAMFOR_MAX} maskiner. Väljer du en till byts den som valdes först ut.</p>}
        {valda.length < JAMFOR_MIN && kandidater.length > 0 && <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 0` }}>Välj minst {JAMFOR_MIN} maskiner för att se jämförelsen.</p>}
      </Sektion>

      {valda.length >= JAMFOR_MIN && (
        <>
          <Sektion titel={index ? <>Viktat index<IndexInfo rader={rader} /> år för år</> : "m³/G15 år för år"}>
            <Linjediagram serier={serier} referens={index ? 100 : undefined} typ={typ} etikett={index ? "Viktat index" : "m³/G15"} decimaler={index ? 0 : 1} />
          </Sektion>

          <Sektion titel="Hela perioden">
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th scope="col" style={{ position: "sticky", left: 0, background: FARG.bg, width: AVSTAND.xxl * 3 - AVSTAND.l }} aria-label="Nyckeltal" />
                    {valda.map((m, i) => (
                      <th key={m} scope="col" style={{ textAlign: "right", padding: `${AVSTAND.s}px ${AVSTAND.xs}px`, overflowWrap: "anywhere", verticalAlign: "bottom", ...TYP.meta, fontWeight: 600, borderBottom: `1px solid ${FARG.linje}` }}>
                        <span aria-hidden style={{ color: maskinFarg(typ) }}>{linjeGlyf(i)} </span>{m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tabell.map((r) => (
                    <tr key={r.etikett}>
                      <th scope="row" style={{ ...RAD, display: "table-cell", position: "sticky", left: 0, background: FARG.bg, textAlign: "left", ...TYP.meta, color: FARG.text2, fontWeight: 400, padding: `${AVSTAND.m}px ${AVSTAND.s}px ${AVSTAND.m}px 0`, verticalAlign: "top" }}>{r.etikett}</th>
                      {r.celler.map((c, i) => (
                        <td key={i} style={{ textAlign: "right", verticalAlign: "top", padding: `${AVSTAND.m}px ${AVSTAND.xs}px`, borderBottom: `1px solid ${FARG.linje}`, overflowWrap: "anywhere" }}>
                          <div style={c.ord ? { ...TYP.meta, color: FARG.text2 } : { ...TYP.meta, ...TNUM, fontWeight: c.bast ? 700 : 400 }}>{c.text}</div>
                          {c.kalla && <div style={{ ...TYP.micro, textTransform: "none", color: FARG.text2, fontWeight: 400 }}>{c.kalla}</div>}
                          {c.bast && <div style={{ ...TYP.micro, textTransform: "none", color: FARG.text }}>bäst</div>}
                          {c.extra && <div style={{ ...TYP.micro, textTransform: "none", color: FARG.text2, fontWeight: 400 }}>{c.extra}</div>}
                          {c.notis && <div style={{ display: "flex", justifyContent: "flex-end" }}><Notis text={c.notis} /></div>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tabell.some((r) => r.celler.some((c) => c.text === "Saknas i formatet")) && (
              <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.m}px 0 0` }}>Saknas i formatet: rapportformatet för den maskinen redovisar inte uppgiften (avbrott, bränsle, lass eller stammar).</p>
            )}
            <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.m}px 0 0` }}>
              Fetstil och ordet "bäst" markerar bästa värdet i raderna viktat index och TU (högst). m³/G15 och bränsle markeras inte: de påverkas av stamstorleken, så medelstammen står under dem. Värden på färre än 5 objekt, eller TU med stopp i färre än 70 % av rapporterna, räknas inte som bäst.
              {index ? "" : " Skotarnas m³/G15 påverkas av avstånd och sortiment."}
            </p>
          </Sektion>
        </>
      )}
    </div>
  );
}
