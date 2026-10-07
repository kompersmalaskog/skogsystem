"use client";
import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AVSTAND, FARG, RADIE, TYP } from "@/lib/design/tokens";
import { Sektion, Kort, Lista, Rad, Sekundar, Primar, Besked, Fel, Laddar, Tomt, Etikett, Tillbaka, Ikon } from "./ui";

type CurrentUser = { id: string; namn?: string | null; roll: string };

type Medarbetare = { id: string; namn: string | null };
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

const VAL_LABEL: Record<string, string> = {
  ledig: "Ledig tid",
  kontant: "Pengar",
  pension: "Pension",
};

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
  const högdaRef = useRef<HTMLDivElement>(null);

  const ladda = async () => {
    setLaddar(true); setFel(null);
    try {
      const [medRes, valRes] = await Promise.all([
        supabase.from("medarbetare").select("id, namn").order("namn"),
        supabase.from("atk_val").select("*").eq("period", period),
      ]);
      if (medRes.error) throw medRes.error;
      setMedarbetare(medRes.data || []);
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

  const utanVal = medarbetare.filter(m => !val[m.id]);
  const medVal = medarbetare.filter(m => val[m.id]);
  const arAktuell = parseInt(period) >= parseInt(AKTUELL_PERIOD);

  return (
    <>
      {/* Periodväljare */}
      <Kort style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${AVSTAND.s}px ${AVSTAND.l}px` }}>
        <Sekundar smal onClick={() => setPeriod(String(parseInt(period) - 1))} style={{ width: 44, padding: 0 }}><Ikon namn="chevron_left" farg={FARG.text} /></Sekundar>
        <span style={{ ...TYP.listtitel, color: FARG.text }}>ATK-period {period}</span>
        <Sekundar smal onClick={() => setPeriod(String(parseInt(period) + 1))} disabled={arAktuell} style={{ width: 44, padding: 0 }}><Ikon namn="chevron_right" farg={FARG.text} /></Sekundar>
      </Kort>

      {laddar ? (
        <div style={{ marginTop: AVSTAND.m }}><Laddar /></div>
      ) : fel ? (
        <div style={{ marginTop: AVSTAND.m }}><Fel onForsok={ladda}>{fel}</Fel></div>
      ) : (
        <>
          {statusFel && <Besked>{statusFel}</Besked>}

          {/* Saknar val */}
          {utanVal.length > 0 && (
            <>
              <Sektion>Saknar val ({utanVal.length})</Sektion>
              <Lista>
                {utanVal.map((m, i) => (
                  <Rad key={m.id} rubrik={m.namn || m.id.slice(0, 8)} hoger={<Etikett farg={FARG.orange}>Ej valt</Etikett>} sista={i === utanVal.length - 1} />
                ))}
              </Lista>
            </>
          )}

          {/* Har valt */}
          {medVal.length > 0 && (
            <>
              <Sektion>Val gjorda ({medVal.length})</Sektion>
              <Lista>
                {medVal.map((m, i) => {
                  const v = val[m.id];
                  const krävs_godkännande = v.val !== "ledig" && (v.status === "bekräftad" || !v.status);
                  const är_förvald = m.id === förvaldMedId;
                  return (
                    <div key={m.id} ref={är_förvald ? högdaRef : undefined}
                      style={{ padding: `${AVSTAND.m}px 0`, borderBottom: i === medVal.length - 1 ? "none" : `1px solid ${FARG.linje}`, background: är_förvald ? FARG.tonad : "transparent", borderRadius: är_förvald ? RADIE.rad : 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: AVSTAND.m, flexWrap: "wrap" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ ...TYP.listtitel, color: FARG.text }}>{m.namn || m.id.slice(0, 8)}</div>
                          <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>
                            {[VAL_LABEL[v.val] || v.val, v.timmar != null && `${v.timmar} h`, v.belopp != null && `${v.belopp.toLocaleString("sv-SE")} kr`, v.datum_valt && `valt ${new Date(v.datum_valt).toLocaleDateString("sv-SE")}`].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        <StatusEtikett status={v.status} />
                      </div>

                      {krävs_godkännande && v.id && (
                        <div style={{ display: "flex", gap: AVSTAND.m, marginTop: AVSTAND.m }}>
                          <Primar onClick={() => sättStatus(v.id!, "godkand")} disabled={uppdaterar === v.id} style={{ flex: 1 }}>Godkänn</Primar>
                          <Sekundar onClick={() => sättStatus(v.id!, "avslagen")} disabled={uppdaterar === v.id} style={{ flex: 1 }}>Avslå</Sekundar>
                        </div>
                      )}
                    </div>
                  );
                })}
              </Lista>
            </>
          )}

          {medVal.length === 0 && utanVal.length === 0 && <Kort style={{ marginTop: AVSTAND.m }}><Tomt>Inga medarbetare.</Tomt></Kort>}
        </>
      )}
    </>
  );
}

function StatusEtikett({ status }: { status: string | null }) {
  if (!status || status === "bekräftad") return <Etikett>Väntar</Etikett>;
  if (status === "godkand") return <Etikett farg={FARG.gron}>Godkänd</Etikett>;
  if (status === "avslagen") return <Etikett farg={FARG.rod}>Avslagen</Etikett>;
  return <Etikett>{status}</Etikett>;
}
