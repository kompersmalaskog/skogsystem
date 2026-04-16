"use client";
import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { C, secHead, Card } from "./design";

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

const VAL_FÄRG: Record<string, string> = {
  ledig: "#5ac8fa",
  kontant: "#34c759",
  pension: "#bf5af2",
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
    await supabase.from("atk_val").update(patch).eq("id", atkValId);
    setUppdaterar(null);
    await ladda();
  };

  const utanVal = medarbetare.filter(m => !val[m.id]);
  const medVal = medarbetare.filter(m => val[m.id]);

  return (
    <>
      {/* Periodväljare */}
      <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px" }}>
        <button onClick={() => setPeriod(String(parseInt(period) - 1))} style={{
          background: "rgba(255,255,255,0.05)", border: "none", borderRadius: 8,
          width: 36, height: 36, cursor: "pointer", color: "#fff", fontSize: 18, fontFamily: "inherit",
        }}>‹</button>
        <span style={{ fontSize: 16, fontWeight: 600, color: C.text }}>ATK-period {period}</span>
        <button
          onClick={() => setPeriod(String(parseInt(period) + 1))}
          disabled={parseInt(period) >= parseInt(AKTUELL_PERIOD)}
          style={{
            background: "rgba(255,255,255,0.05)", border: "none", borderRadius: 8,
            width: 36, height: 36, cursor: parseInt(period) >= parseInt(AKTUELL_PERIOD) ? "default" : "pointer",
            color: parseInt(period) >= parseInt(AKTUELL_PERIOD) ? C.label : "#fff",
            fontSize: 18, fontFamily: "inherit",
            opacity: parseInt(period) >= parseInt(AKTUELL_PERIOD) ? 0.4 : 1,
          }}
        >›</button>
      </Card>

      {laddar ? (
        <Card><p style={{ margin: 0, color: C.label, fontSize: 14 }}>Laddar…</p></Card>
      ) : fel ? (
        <Card style={{ border: `1px solid ${C.red}` }}>
          <p style={{ margin: 0, color: C.red, fontSize: 14 }}>{fel}</p>
        </Card>
      ) : (
        <>
          {/* Sammanfattning */}
          <p style={{ ...secHead, marginTop: 18 }}>Sammanfattning</p>
          <Card>
            <SummeringRad label="Totalt medarbetare" värde={`${medarbetare.length} st`} />
            <SummeringRad label="Har valt" värde={`${medVal.length} st`} />
            <SummeringRad
              label="Saknar val"
              värde={`${utanVal.length} st`}
              färg={utanVal.length > 0 ? C.orange : C.green}
              sista
            />
          </Card>

          {/* Saknar val */}
          {utanVal.length > 0 && (
            <>
              <p style={{ ...secHead, marginTop: 22 }}>Saknar val ({utanVal.length})</p>
              <Card style={{
                padding: 0,
                background: "rgba(255,159,10,0.05)",
                border: `1px solid rgba(255,159,10,0.2)`,
              }}>
                {utanVal.map((m, i) => (
                  <div key={m.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 18px",
                    borderBottom: i === utanVal.length - 1 ? "none" : `1px solid ${C.line}`,
                  }}>
                    <span style={{ fontSize: 14, color: C.text }}>{m.namn || m.id.slice(0, 8)}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: C.orange,
                      background: "rgba(255,159,10,0.15)", padding: "3px 8px", borderRadius: 5,
                      textTransform: "uppercase", letterSpacing: "0.05em",
                    }}>Ej valt</span>
                  </div>
                ))}
              </Card>
            </>
          )}

          {/* Har valt */}
          {medVal.length > 0 && (
            <>
              <p style={{ ...secHead, marginTop: 22 }}>Val gjorda ({medVal.length})</p>
              <Card style={{ padding: 0 }}>
                {medVal.map((m, i) => {
                  const v = val[m.id];
                  const krävs_godkännande = v.val !== "ledig" && (v.status === "bekräftad" || !v.status);
                  const är_förvald = m.id === förvaldMedId;
                  return (
                    <div
                      key={m.id}
                      ref={är_förvald ? högdaRef : undefined}
                      style={{
                        padding: "14px 18px",
                        borderBottom: i === medVal.length - 1 ? "none" : `1px solid ${C.line}`,
                        background: är_förvald ? "rgba(173,198,255,0.08)" : "transparent",
                        transition: "background 0.3s",
                      }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{m.namn || m.id.slice(0, 8)}</span>
                            <span style={{
                              fontSize: 10, fontWeight: 700, color: VAL_FÄRG[v.val],
                              background: `${VAL_FÄRG[v.val]}22`, padding: "2px 7px", borderRadius: 5,
                              textTransform: "uppercase", letterSpacing: "0.05em",
                            }}>{VAL_LABEL[v.val] || v.val}</span>
                            <StatusBadge status={v.status} />
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12, color: C.label, display: "flex", gap: 10, flexWrap: "wrap" }}>
                            {v.timmar != null && <span>{v.timmar} h</span>}
                            {v.belopp != null && <span>{v.belopp.toLocaleString("sv-SE")} kr</span>}
                            {v.datum_valt && <span>valt {new Date(v.datum_valt).toLocaleDateString("sv-SE")}</span>}
                          </div>
                        </div>
                      </div>

                      {krävs_godkännande && v.id && (
                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                          <button
                            onClick={() => sättStatus(v.id!, "godkand")}
                            disabled={uppdaterar === v.id}
                            style={godkännBtn(uppdaterar === v.id)}
                          >Godkänn</button>
                          <button
                            onClick={() => sättStatus(v.id!, "avslagen")}
                            disabled={uppdaterar === v.id}
                            style={avslåBtn(uppdaterar === v.id)}
                          >Avslå</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </Card>
            </>
          )}
        </>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status || status === "bekräftad") {
    return <Badge bg="rgba(255,255,255,0.06)" fg={C.label} text="VÄNTAR" />;
  }
  if (status === "godkand") {
    return <Badge bg="rgba(52,199,89,0.15)" fg={C.green} text="GODKÄND" />;
  }
  if (status === "avslagen") {
    return <Badge bg="rgba(255,69,58,0.15)" fg={C.red} text="AVSLAGEN" />;
  }
  return <Badge bg="rgba(255,255,255,0.06)" fg={C.label} text={status.toUpperCase()} />;
}

function Badge({ bg, fg, text }: { bg: string; fg: string; text: string }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color: fg,
      background: bg, padding: "2px 6px", borderRadius: 4,
      textTransform: "uppercase", letterSpacing: "0.05em",
    }}>{text}</span>
  );
}

function godkännBtn(disabled: boolean): React.CSSProperties {
  return {
    flex: 1, height: 36,
    background: disabled ? "rgba(52,199,89,0.1)" : C.green,
    color: "#fff", border: "none", borderRadius: 8,
    fontSize: 13, fontWeight: 600, cursor: disabled ? "default" : "pointer",
    fontFamily: "inherit", opacity: disabled ? 0.5 : 1,
  };
}

function avslåBtn(disabled: boolean): React.CSSProperties {
  return {
    flex: 1, height: 36,
    background: "transparent",
    color: C.red, border: `1px solid rgba(255,69,58,0.3)`, borderRadius: 8,
    fontSize: 13, fontWeight: 600, cursor: disabled ? "default" : "pointer",
    fontFamily: "inherit", opacity: disabled ? 0.5 : 1,
  };
}

function SummeringRad({ label, värde, färg, sista }: { label: string; värde: string; färg?: string; sista?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 0",
      borderBottom: sista ? "none" : `1px solid ${C.line}`,
    }}>
      <span style={{ fontSize: 13, color: C.label }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: färg || C.text }}>{värde}</span>
    </div>
  );
}
