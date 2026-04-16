"use client";
import React, { useState, useEffect, CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { C, secHead, Card, inputStyle, btnPrimary, btnSecondary, btnDanger, ChevronRight } from "./design";

type Medarbetare = {
  id: string;
  namn: string | null;
  epost: string | null;
  hemadress: string | null;
  roll: string;
  maskin_id: string | null;
  timlon_kr: number | null;
  manadslon_kr: number | null;
  anstallningsdatum: string | null;
};

type OperatorRad = {
  operator_id: string;
  operator_namn: string | null;
  operator_key: string | null;
  maskin_id: string | null;
};

type MaskinRad = { maskin_id: string; namn: string | null };

type Vy = { typ: "lista" } | { typ: "detalj"; id: string } | { typ: "ny" };

export default function MedarbetareFlik() {
  const [vy, setVy] = useState<Vy>({ typ: "lista" });
  const [medarbetare, setMedarbetare] = useState<Medarbetare[]>([]);
  const [operatorerPerMed, setOperatorerPerMed] = useState<Record<string, OperatorRad[]>>({});
  const [maskiner, setMaskiner] = useState<Record<string, string>>({});
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);

  const ladda = async () => {
    setLaddar(true);
    setFel(null);
    try {
      const [medRes, opMedRes, dimOpRes, maskinRes] = await Promise.all([
        supabase.from("medarbetare")
          .select("id, namn, epost, hemadress, roll, maskin_id, timlon_kr, manadslon_kr, anstallningsdatum")
          .order("namn"),
        supabase.from("operator_medarbetare").select("operator_id, medarbetare_id"),
        supabase.from("dim_operator").select("operator_id, operator_namn, operator_key, maskin_id"),
        supabase.from("maskiner").select("maskin_id, namn"),
      ]);
      if (medRes.error) throw medRes.error;

      const opMap = new Map<string, OperatorRad>();
      for (const o of (dimOpRes.data || [])) opMap.set(o.operator_id, o);

      const maskinMap: Record<string, string> = {};
      for (const m of (maskinRes.data || []) as MaskinRad[]) {
        if (m.maskin_id) maskinMap[m.maskin_id] = m.namn || m.maskin_id;
      }

      const opPerMed: Record<string, OperatorRad[]> = {};
      for (const m of (opMedRes.data || [])) {
        const op = opMap.get(m.operator_id);
        if (!op) continue;
        if (!opPerMed[m.medarbetare_id]) opPerMed[m.medarbetare_id] = [];
        opPerMed[m.medarbetare_id].push(op);
      }

      setMedarbetare(medRes.data || []);
      setOperatorerPerMed(opPerMed);
      setMaskiner(maskinMap);
    } catch (e: any) {
      setFel(e.message || String(e));
    } finally {
      setLaddar(false);
    }
  };

  useEffect(() => { ladda(); }, []);

  if (laddar) return <Card><p style={{ margin: 0, color: C.label, fontSize: 14 }}>Laddar…</p></Card>;
  if (fel) return <Card style={{ border: `1px solid ${C.red}` }}>
    <p style={{ margin: 0, color: C.red, fontSize: 14 }}>Kunde inte ladda medarbetare: {fel}</p>
  </Card>;

  if (vy.typ === "ny") {
    return <NyMedarbetare onKlar={() => { setVy({ typ: "lista" }); ladda(); }} onAvbryt={() => setVy({ typ: "lista" })} />;
  }

  if (vy.typ === "detalj") {
    const m = medarbetare.find(x => x.id === vy.id);
    if (!m) {
      setVy({ typ: "lista" });
      return null;
    }
    return (
      <DetaljVy
        medarbetare={m}
        operatorer={operatorerPerMed[m.id] || []}
        maskiner={maskiner}
        onKlar={() => { setVy({ typ: "lista" }); ladda(); }}
        onTillbaka={() => setVy({ typ: "lista" })}
      />
    );
  }

  return (
    <ListaVy
      medarbetare={medarbetare}
      operatorerPerMed={operatorerPerMed}
      maskiner={maskiner}
      onValj={(id) => setVy({ typ: "detalj", id })}
      onNy={() => setVy({ typ: "ny" })}
    />
  );
}

/* ─── LISTA ─── */

function ListaVy({
  medarbetare, operatorerPerMed, maskiner, onValj, onNy,
}: {
  medarbetare: Medarbetare[];
  operatorerPerMed: Record<string, OperatorRad[]>;
  maskiner: Record<string, string>;
  onValj: (id: string) => void;
  onNy: () => void;
}) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <p style={{ ...secHead, margin: 0 }}>Medarbetare ({medarbetare.length})</p>
        <button onClick={onNy} style={{
          background: "rgba(10,132,255,0.15)",
          border: "none",
          borderRadius: 8,
          padding: "6px 14px",
          color: C.blue,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
        }}>+ Ny</button>
      </div>

      <Card style={{ padding: 0 }}>
        {medarbetare.length === 0 ? (
          <p style={{ margin: 0, padding: 18, color: C.label, fontSize: 14 }}>Inga medarbetare.</p>
        ) : medarbetare.map((m, i) => {
          const ops = operatorerPerMed[m.id] || [];
          const maskinNamn = new Set<string>();
          for (const o of ops) if (o.maskin_id) maskinNamn.add(maskiner[o.maskin_id] || o.maskin_id);
          if (m.maskin_id) maskinNamn.add(maskiner[m.maskin_id] || m.maskin_id);
          return (
            <div key={m.id} onClick={() => onValj(m.id)} style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 20px",
              borderBottom: i === medarbetare.length - 1 ? "none" : `1px solid ${C.line}`,
              cursor: "pointer",
              gap: 12,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>
                    {m.namn || "Namnlös"}
                  </span>
                  <RolBadge roll={m.roll} />
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: C.label, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span>{ops.length} operatör{ops.length === 1 ? "" : "er"}</span>
                  {maskinNamn.size > 0 && <span>· {[...maskinNamn].join(", ")}</span>}
                </div>
              </div>
              <ChevronRight />
            </div>
          );
        })}
      </Card>
    </>
  );
}

function RolBadge({ roll }: { roll: string }) {
  const färg =
    roll === "admin" ? { bg: "rgba(255,69,58,0.15)", fg: "#ff6961" } :
    roll === "chef" ? { bg: "rgba(10,132,255,0.15)", fg: "#5ac8fa" } :
                       { bg: "rgba(142,142,147,0.18)", fg: "#aeaeb2" };
  return (
    <span style={{
      background: färg.bg,
      color: färg.fg,
      fontSize: 10,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      padding: "2px 8px",
      borderRadius: 6,
    }}>{roll}</span>
  );
}

/* ─── DETALJ ─── */

function DetaljVy({
  medarbetare, operatorer, maskiner, onKlar, onTillbaka,
}: {
  medarbetare: Medarbetare;
  operatorer: OperatorRad[];
  maskiner: Record<string, string>;
  onKlar: () => void;
  onTillbaka: () => void;
}) {
  const [namn, setNamn] = useState(medarbetare.namn || "");
  const [epost, setEpost] = useState(medarbetare.epost || "");
  const [hemadress, setHemadress] = useState(medarbetare.hemadress || "");
  const [roll, setRoll] = useState(medarbetare.roll);
  const [timlon, setTimlon] = useState<string>(medarbetare.timlon_kr != null ? String(medarbetare.timlon_kr) : "");
  const [manadslon, setManadslon] = useState<string>(medarbetare.manadslon_kr != null ? String(medarbetare.manadslon_kr) : "");
  const [anstallningsdatum, setAnstallningsdatum] = useState(medarbetare.anstallningsdatum || "");
  const [sparar, setSparar] = useState(false);
  const [sparFel, setSparFel] = useState<string | null>(null);
  const [taBortLäge, setTaBortLäge] = useState(false);
  const [visaKopplaModal, setVisaKopplaModal] = useState(false);

  const ändrat =
    namn !== (medarbetare.namn || "") ||
    epost !== (medarbetare.epost || "") ||
    hemadress !== (medarbetare.hemadress || "") ||
    roll !== medarbetare.roll ||
    timlon !== (medarbetare.timlon_kr != null ? String(medarbetare.timlon_kr) : "") ||
    manadslon !== (medarbetare.manadslon_kr != null ? String(medarbetare.manadslon_kr) : "") ||
    anstallningsdatum !== (medarbetare.anstallningsdatum || "");

  const spara = async () => {
    setSparar(true);
    setSparFel(null);
    const update: any = {
      namn: namn.trim() || null,
      epost: epost.trim() || null,
      hemadress: hemadress.trim() || null,
      roll,
      timlon_kr: timlon === "" ? null : parseFloat(timlon),
      manadslon_kr: manadslon === "" ? null : parseFloat(manadslon),
      anstallningsdatum: anstallningsdatum || null,
    };
    const { error } = await supabase.from("medarbetare").update(update).eq("id", medarbetare.id);
    setSparar(false);
    if (error) { setSparFel(error.message); return; }
    onKlar();
  };

  const taBort = async () => {
    setSparar(true);
    setSparFel(null);
    // Ta bort kopplingar först (FK)
    await supabase.from("operator_medarbetare").delete().eq("medarbetare_id", medarbetare.id);
    const { error } = await supabase.from("medarbetare").delete().eq("id", medarbetare.id);
    setSparar(false);
    if (error) { setSparFel(error.message); return; }
    onKlar();
  };

  const kopplaLossOperator = async (operator_id: string) => {
    const { error } = await supabase.from("operator_medarbetare")
      .delete().eq("operator_id", operator_id).eq("medarbetare_id", medarbetare.id);
    if (error) { setSparFel(error.message); return; }
    onKlar();
  };

  return (
    <>
      <button onClick={onTillbaka} style={{
        background: "none", border: "none", color: C.blue, fontSize: 15,
        cursor: "pointer", fontFamily: "inherit", padding: "4px 0", marginBottom: 8,
      }}>‹ Tillbaka</button>

      {/* Grunduppgifter */}
      <p style={secHead}>Personuppgifter</p>
      <Card>
        <Field label="Namn" value={namn} onChange={setNamn} placeholder="För- och efternamn"/>
        <Field label="E-post" value={epost} onChange={setEpost} placeholder="namn@exempel.se" type="email"/>
        <Field label="Hemadress" value={hemadress} onChange={setHemadress} placeholder="Gata, ort"/>
        <SelectField label="Roll" value={roll} onChange={setRoll} options={[
          { value: "forare", label: "Förare" },
          { value: "chef", label: "Chef" },
          { value: "admin", label: "Admin" },
        ]}/>
      </Card>

      {/* Löneuppgifter */}
      <p style={{ ...secHead, marginTop: 22 }}>Löneuppgifter</p>
      <Card>
        <Field label="Timlön (kr)" value={timlon} onChange={setTimlon} placeholder="—" type="number"/>
        <Field label="Månadslön (kr)" value={manadslon} onChange={setManadslon} placeholder="—" type="number"/>
        <Field label="Anställningsdatum" value={anstallningsdatum} onChange={setAnstallningsdatum} type="date"/>
        <div style={{
          marginTop: 12, padding: "10px 12px",
          background: "rgba(10,132,255,0.08)", borderRadius: 8,
          fontSize: 12, color: C.label,
        }}>
          Anställningsnummer per lönesystem hanteras under fliken Lön → Lönesystem (kommer i steg 6).
        </div>
      </Card>

      {/* Kopplade operatörer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 22, marginBottom: 10 }}>
        <p style={{ ...secHead, margin: 0 }}>Kopplade operatörer ({operatorer.length})</p>
        <button onClick={() => setVisaKopplaModal(true)} style={{
          background: "rgba(10,132,255,0.15)",
          border: "none", borderRadius: 8,
          padding: "6px 12px", color: C.blue,
          fontSize: 13, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
        }}>+ Koppla</button>
      </div>
      <Card style={{ padding: 0 }}>
        {operatorer.length === 0 ? (
          <p style={{ margin: 0, padding: 18, color: C.label, fontSize: 14 }}>Inga operatörer kopplade.</p>
        ) : operatorer.map((o, i) => (
          <div key={o.operator_id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "14px 20px",
            borderBottom: i === operatorer.length - 1 ? "none" : `1px solid ${C.line}`,
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>
                {o.operator_namn || o.operator_key || o.operator_id}
              </div>
              <div style={{ fontSize: 11, color: C.label, marginTop: 2 }}>
                {o.operator_id}{o.maskin_id ? ` · ${maskiner[o.maskin_id] || o.maskin_id}` : ""}
              </div>
            </div>
            <button onClick={() => kopplaLossOperator(o.operator_id)} style={{
              background: "none", border: "none", color: C.red,
              fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: 4,
            }}>Ta bort</button>
          </div>
        ))}
      </Card>

      {sparFel && (
        <div style={{
          marginTop: 16, padding: 12,
          background: "rgba(255,69,58,0.1)", borderRadius: 10,
          color: C.red, fontSize: 13,
        }}>{sparFel}</div>
      )}

      {/* Knappar */}
      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
        <button
          onClick={spara}
          disabled={!ändrat || sparar}
          style={{ ...btnPrimary, opacity: !ändrat || sparar ? 0.4 : 1, cursor: !ändrat || sparar ? "default" : "pointer" }}
        >
          {sparar ? "Sparar…" : "Spara ändringar"}
        </button>

        {!taBortLäge ? (
          <button onClick={() => setTaBortLäge(true)} style={btnDanger}>
            Ta bort medarbetare
          </button>
        ) : (
          <div style={{
            background: "rgba(255,69,58,0.08)",
            border: `1px solid rgba(255,69,58,0.25)`,
            borderRadius: 12, padding: 14,
          }}>
            <p style={{ margin: "0 0 10px", fontSize: 14, color: C.text }}>
              Säker på att du vill ta bort {medarbetare.namn || "medarbetaren"}? Operatörskopplingar tas också bort.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setTaBortLäge(false)} style={{ ...btnSecondary, flex: 1 }}>Avbryt</button>
              <button onClick={taBort} disabled={sparar} style={{
                ...btnDanger, flex: 1, background: C.red, color: "#fff", border: "none",
                opacity: sparar ? 0.5 : 1,
              }}>
                {sparar ? "Tar bort…" : "Ja, ta bort"}
              </button>
            </div>
          </div>
        )}
      </div>

      {visaKopplaModal && (
        <KopplaOperatörModal
          medarbetareId={medarbetare.id}
          onKlar={() => { setVisaKopplaModal(false); onKlar(); }}
          onAvbryt={() => setVisaKopplaModal(false)}
        />
      )}
    </>
  );
}

/* ─── NY MEDARBETARE ─── */

function NyMedarbetare({ onKlar, onAvbryt }: { onKlar: () => void; onAvbryt: () => void }) {
  const [namn, setNamn] = useState("");
  const [epost, setEpost] = useState("");
  const [roll, setRoll] = useState("forare");
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const spara = async () => {
    if (!namn.trim()) { setFel("Namn krävs"); return; }
    setSparar(true);
    setFel(null);
    const { error } = await supabase.from("medarbetare").insert({
      namn: namn.trim(),
      epost: epost.trim() || null,
      roll,
    });
    setSparar(false);
    if (error) { setFel(error.message); return; }
    onKlar();
  };

  return (
    <>
      <button onClick={onAvbryt} style={{
        background: "none", border: "none", color: C.blue, fontSize: 15,
        cursor: "pointer", fontFamily: "inherit", padding: "4px 0", marginBottom: 8,
      }}>‹ Avbryt</button>
      <p style={secHead}>Ny medarbetare</p>
      <Card>
        <Field label="Namn *" value={namn} onChange={setNamn} placeholder="För- och efternamn"/>
        <Field label="E-post" value={epost} onChange={setEpost} placeholder="namn@exempel.se" type="email"/>
        <SelectField label="Roll" value={roll} onChange={setRoll} options={[
          { value: "forare", label: "Förare" },
          { value: "chef", label: "Chef" },
          { value: "admin", label: "Admin" },
        ]}/>
      </Card>
      {fel && (
        <div style={{ marginTop: 12, padding: 12, background: "rgba(255,69,58,0.1)", borderRadius: 10, color: C.red, fontSize: 13 }}>
          {fel}
        </div>
      )}
      <button
        onClick={spara}
        disabled={sparar || !namn.trim()}
        style={{ ...btnPrimary, marginTop: 20, opacity: sparar || !namn.trim() ? 0.4 : 1 }}
      >
        {sparar ? "Skapar…" : "Skapa medarbetare"}
      </button>
    </>
  );
}

/* ─── KOPPLA OPERATÖR-MODAL ─── */

function KopplaOperatörModal({
  medarbetareId, onKlar, onAvbryt,
}: {
  medarbetareId: string;
  onKlar: () => void;
  onAvbryt: () => void;
}) {
  const [lediga, setLediga] = useState<OperatorRad[] | null>(null);
  const [valt, setValt] = useState<string | null>(null);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [opMedRes, dimOpRes] = await Promise.all([
        supabase.from("operator_medarbetare").select("operator_id"),
        supabase.from("dim_operator").select("operator_id, operator_namn, operator_key, maskin_id").order("operator_namn"),
      ]);
      const taget = new Set((opMedRes.data || []).map((r: any) => r.operator_id));
      const lediga = (dimOpRes.data || []).filter((o: any) => !taget.has(o.operator_id));
      setLediga(lediga);
    })();
  }, []);

  const koppla = async () => {
    if (!valt) return;
    setSparar(true);
    setFel(null);
    const { error } = await supabase.from("operator_medarbetare").insert({
      operator_id: valt,
      medarbetare_id: medarbetareId,
    });
    setSparar(false);
    if (error) { setFel(error.message); return; }
    onKlar();
  };

  return (
    <div onClick={onAvbryt} style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.7)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#1c1c1e", borderRadius: 16, padding: 20, width: "100%", maxWidth: 420,
        maxHeight: "80vh", display: "flex", flexDirection: "column",
      }}>
        <p style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: C.text, textAlign: "center" }}>
          Koppla operatör
        </p>
        <div style={{ flex: 1, overflowY: "auto", marginBottom: 12 }}>
          {lediga === null ? (
            <p style={{ color: C.label, fontSize: 14, textAlign: "center" }}>Laddar…</p>
          ) : lediga.length === 0 ? (
            <p style={{ color: C.label, fontSize: 14, textAlign: "center" }}>Alla operatörer är redan kopplade.</p>
          ) : lediga.map((o, i) => (
            <button key={o.operator_id} onClick={() => setValt(o.operator_id)} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              width: "100%", padding: "12px 14px",
              background: valt === o.operator_id ? "rgba(10,132,255,0.12)" : "transparent",
              border: "none",
              borderBottom: i === lediga.length - 1 ? "none" : `1px solid ${C.line}`,
              cursor: "pointer", fontFamily: "inherit", textAlign: "left",
            }}>
              <div>
                <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>
                  {o.operator_namn || o.operator_key || o.operator_id}
                </div>
                <div style={{ fontSize: 11, color: C.label, marginTop: 2 }}>
                  {o.operator_id}{o.maskin_id ? ` · ${o.maskin_id}` : ""}
                </div>
              </div>
              {valt === o.operator_id && (
                <div style={{
                  width: 18, height: 18, borderRadius: "50%", background: C.blue,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4l3 3L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
        {fel && (
          <div style={{ marginBottom: 10, padding: 10, background: "rgba(255,69,58,0.1)", borderRadius: 8, color: C.red, fontSize: 12 }}>
            {fel}
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onAvbryt} style={{ ...btnSecondary, flex: 1 }}>Avbryt</button>
          <button onClick={koppla} disabled={!valt || sparar} style={{
            ...btnPrimary, flex: 1, opacity: !valt || sparar ? 0.4 : 1,
          }}>
            {sparar ? "Kopplar…" : "Koppla"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── FÄLT-KOMPONENTER ─── */

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, color: C.label, marginBottom: 6, fontWeight: 500 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle as CSSProperties}
      />
    </div>
  );
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, color: C.label, marginBottom: 6, fontWeight: 500 }}>
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          ...inputStyle as CSSProperties,
          appearance: "none",
          WebkitAppearance: "none",
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'><path d='M1 1l5 5 5-5' stroke='%238e8e93' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg>")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 14px center",
          paddingRight: 36,
        }}
      >
        {options.map(o => <option key={o.value} value={o.value} style={{ background: "#2a2a2c", color: "#fff" }}>{o.label}</option>)}
      </select>
    </div>
  );
}
