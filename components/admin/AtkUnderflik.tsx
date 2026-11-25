"use client";
import { utanMaskinkonton } from "@/lib/admin/utanMaskinkonton";
import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP } from "@/lib/design/tokens";
import Svarsrad from "@/components/design/Svarsrad";
import { byggAtkVy, statusText, valDetalj, type AtkPerson } from "@/lib/admin/atkVy";
import { Sektion, Lista, Rad, Sekundar, Primar, Besked, Fel, Laddar, Ikon } from "./ui";

type CurrentUser = { id: string; namn?: string | null; roll: string };

type Medarbetare = AtkPerson;
type AtkVal = {
  id?: string;
  medarbetare_id: string;
  period: string;
  val: "ledig" | "kontant" | "pension";
  timmar: number | null;
  belopp: number | null;
  datum_valt: string | null;
  status: string | null;
};

const AKTUELL_PERIOD = String(new Date().getFullYear());


export default function AtkUnderflik({ currentUser }: { currentUser: CurrentUser }) {
  const sp = useSearchParams();
  const förvaldPeriod = sp?.get("period") || AKTUELL_PERIOD;
  const förvaldMedId = sp?.get("medarbetare") || null;

  const [period, setPeriod] = useState(förvaldPeriod);
  const [medarbetare, setMedarbetare] = useState<Medarbetare[]>([]);
  const [val, setVal] = useState<Record<string, AtkVal>>({});
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);
  const [uppdaterar, setUppdaterar] = useState<string | null>(null);
  const [statusFel, setStatusFel] = useState<string | null>(null);
  const [paminner, setPaminner] = useState(false);
  const [paminnSvar, setPaminnSvar] = useState<{ fel: boolean; text: string } | null>(null);
  const högdaRef = useRef<HTMLDivElement>(null);

  const ladda = async () => {
    setLaddar(true); setFel(null);
    try {
      const [medRes, valRes] = await Promise.all([
        supabase.from("medarbetare").select("id, namn, roll, foretagsledare, aktiv").order("namn"),
        supabase.from("atk_val").select("*").eq("period", period),
      ]);
      if (medRes.error) throw medRes.error;
      setMedarbetare(utanMaskinkonton(medRes.data));
      const map: Record<string, AtkVal> = {};
      for (const v of (valRes.data || [])) map[v.medarbetare_id] = v;
      setVal(map);
    } catch (e: any) {
      setFel(e.message || String(e));
    } finally {
      setLaddar(false);
    }
  };

  useEffect(() => { ladda(); }, [period]);

  // Scrolla till + highlighta förvald medarbetare när raderna är laddade
  useEffect(() => {
    if (!laddar && förvaldMedId && högdaRef.current) {
      högdaRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [laddar, förvaldMedId]);

  const sättStatus = async (atkValId: string, status: string) => {
    setUppdaterar(atkValId);
    const patch: any = { status };
    if (status === "godkand") {
      patch.godkand_av = currentUser.id;
      patch.godkand_at = new Date().toISOString();
    }
    // .select() ger tillbaka raderna som faktiskt skrevs: 0 rader utan fel = RLS stoppade den tyst.
    const { data, error } = await supabase.from("atk_val").update(patch).eq("id", atkValId).select("id");
    setUppdaterar(null);
    if (error || !data?.length) {
      setStatusFel(error?.message || "Ändringen sparades inte — raden träffades inte (bara admin kan godkänna eller avslå).");
      return;
    }
    setStatusFel(null);
    await ladda();
  };

  const arAktuell = parseInt(period) >= parseInt(AKTUELL_PERIOD);
  const vy = byggAtkVy(Number(period), new Date(), medarbetare, val);
  const grupperat = vy.vantar.length + vy.valt.length > 0;

  const paminnAlla = async () => {
    setPaminner(true); setPaminnSvar(null);
    try {
      const res = await fetch("/api/atk/paminn", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ period }) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) setPaminnSvar({ fel: true, text: j?.meddelande || "Kunde inte påminna. Försök igen." });
      else if (j.koade === 0) setPaminnSvar({ fel: false, text: "Redan påmind för en stund sedan." });
      else setPaminnSvar({ fel: false, text: `Påminnelse ${j.skickades ? "skickad" : "köad"} till ${j.koade}.` });
    } catch {
      setPaminnSvar({ fel: true, text: "Kunde inte påminna. Försök igen." });
    } finally {
      setPaminner(false);
    }
  };

  const namn = (p: { namn: string | null; id: string }) => p.namn || "Namn saknas";
  const markera = (id: string, barn: React.ReactNode) =>
    id === förvaldMedId ? <div key={id} ref={högdaRef} style={{ background: FARG.tonad, borderRadius: RADIE.rad }}>{barn}</div> : <React.Fragment key={id}>{barn}</React.Fragment>;

  return (
    <>
      {/* Året: en tyst rad, inte ett kort — det byts sällan. */}
      <div data-atk-ar="" style={{ display: "flex", alignItems: "center", gap: AVSTAND.xs, marginBottom: AVSTAND.s }}>
        <button type="button" aria-label="Föregående år" onClick={() => setPeriod(String(parseInt(period) - 1))} style={arKnapp}><Ikon namn="chevron_left" farg={FARG.bla} /></button>
        <span style={{ ...TYP.listtitel, color: FARG.text, minWidth: 48, textAlign: "center" }}>{period}</span>
        <button type="button" aria-label="Nästa år" onClick={() => setPeriod(String(parseInt(period) + 1))} disabled={arAktuell} style={{ ...arKnapp, opacity: arAktuell ? 0.3 : 1 }}><Ikon namn="chevron_right" farg={FARG.bla} /></button>
      </div>

      {laddar ? (
        <Laddar />
      ) : fel ? (
        <Fel onForsok={ladda}>{fel}</Fel>
      ) : (
        <>
          <div data-svar="">
            <Svarsrad rubrik={vy.svar} avvikelse={vy.kraverDig} rad={vy.under.join(" · ")} />
          </div>
          {statusFel && <Besked>{statusFel}</Besked>}

          {vy.kanPaminna && (
            <div data-atk-paminn="" style={{ marginBottom: AVSTAND.m }}>
              <Primar onClick={paminnAlla} disabled={paminner} style={{ width: "100%" }}>Påminn alla {vy.inteValt.length}</Primar>
              {paminnSvar && <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: paminnSvar.fel ? FARG.rod : FARG.text2, textAlign: "center" }}>{paminnSvar.text}</p>}
            </div>
          )}

          {/* Väntar på dig: pengar och pension som ska godkännas. Knapparna står på raden. */}
          {vy.vantar.length > 0 && (
            <>
              <Sektion orange>Väntar på dig</Sektion>
              <Lista>
                {vy.vantar.map(({ person, val: v }, i) => markera(person.id,
                  <Rad attr={{ "data-atk-rad": "vantar" }} rubrik={namn(person)} detalj={valDetalj(v)} sista={i === vy.vantar.length - 1}>
                    {v.id && (
                      <div style={{ display: "flex", gap: AVSTAND.m, marginTop: AVSTAND.m }}>
                        <Primar onClick={() => sättStatus(v.id!, "godkand")} disabled={uppdaterar === v.id} style={{ flex: 1 }}>Godkänn</Primar>
                        <Sekundar onClick={() => sättStatus(v.id!, "avslagen")} disabled={uppdaterar === v.id} style={{ flex: 1 }}>Avslå</Sekundar>
                      </div>
                    )}
                  </Rad>))}
              </Lista>
            </>
          )}

          {/* Inte valt. Har ingen valt behövs ingen grupp: svaret ovanför säger redan vad listan är. */}
          {vy.inteValt.length > 0 && (
            <>
              {grupperat && <Sektion>{vy.lage === "stangd" ? "Valde inte" : "Inte valt"}</Sektion>}
              <Lista>
                {vy.inteValt.map((p, i) => markera(p.id,
                  <Rad attr={{ "data-atk-rad": "inte" }} rubrik={namn(p)} hoger={grupperat ? undefined : (vy.lage === "stangd" ? "Valde inte" : "Inte valt")} sista={i === vy.inteValt.length - 1} />))}
              </Lista>
            </>
          )}

          {vy.valt.length > 0 && (
            <>
              <Sektion>Valt</Sektion>
              <Lista>
                {vy.valt.map(({ person, val: v }, i) => {
                  const st = statusText(v);
                  return markera(person.id,
                    <Rad attr={{ "data-atk-rad": "valt" }} rubrik={namn(person)} detalj={st || undefined} hoger={valDetalj(v)} sista={i === vy.valt.length - 1} />);
                })}
              </Lista>
            </>
          )}
        </>
      )}
    </>
  );
}

const arKnapp: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", width: TRAFFYTA.min, height: TRAFFYTA.min,
  padding: 0, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
};

