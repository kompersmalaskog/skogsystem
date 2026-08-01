"use client";
import React, { useState, useEffect, CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { C, secHead, Card, inputStyle, btnPrimary, btnSecondary, btnDanger, ChevronRight } from "./design";

/* dim_maskin — admin äger visningsnamn/tillverkare/maskin_typ/sander_filer/
   aktiv_fran/aktiv_till på bekräftade maskiner (importens guard rör dem ej).
   maskin_id är nyckeln mot filerna — visas men redigeras ALDRIG efter skapande.
   maskin_typ lagrar StanForD-värdet ('Harvester'/'Forwarder') som resten av
   appen filtrerar på — dropdownen visar svenska men skriver det engelska värdet.
   modell hålls läs-only (fil-ägt). kravprofil/klarar_typ/extramaskin rörs INTE
   här — de bor i sina egna domäner (kalibrering/helikopter). */
type Maskin = {
  maskin_id: string;
  visningsnamn: string | null;
  tillverkare: string | null;
  modell: string | null;
  maskin_typ: string | null;
  sander_filer: boolean;
  aktiv_fran: string | null;
  aktiv_till: string | null;
  bekraftad: boolean;
};

type FilInfo = { forstaFil: string | null; antalFiler: number };

const TYP_VAL: { value: string; label: string }[] = [
  { value: "Harvester", label: "Skördare" },
  { value: "Forwarder", label: "Skotare" },
];

function typLabel(t: string | null): string {
  if (!t) return "—";
  return TYP_VAL.find(o => o.value === t)?.label ?? t;
}

function maskinNamn(m: Maskin): string {
  return m.visningsnamn?.trim() || m.modell || m.maskin_id;
}

type Vy = { typ: "lista" } | { typ: "detalj"; id: string };

export default function MaskinerFlik() {
  const [vy, setVy] = useState<Vy>({ typ: "lista" });
  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [filinfo, setFilinfo] = useState<Record<string, FilInfo>>({});
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);

  const ladda = async () => {
    setLaddar(true);
    setFel(null);
    try {
      const { data, error } = await supabase
        .from("dim_maskin")
        .select("maskin_id, visningsnamn, tillverkare, modell, maskin_typ, sander_filer, aktiv_fran, aktiv_till, bekraftad")
        .order("visningsnamn", { nullsFirst: false });
      if (error) throw error;
      const rader = (data || []) as Maskin[];
      setMaskiner(rader);

      // Fil-info bara för obekräftade — "första fil / antal filer" i upptäckt-kortet.
      const obekr = rader.filter(m => !m.bekraftad && !m.aktiv_till).map(m => m.maskin_id);
      if (obekr.length > 0) {
        const { data: filer } = await supabase
          .from("meta_importerade_filer")
          .select("maskin_id, importerad_tid")
          .in("maskin_id", obekr);
        const info: Record<string, FilInfo> = {};
        for (const f of (filer || []) as { maskin_id: string; importerad_tid: string | null }[]) {
          if (!f.maskin_id) continue;
          const cur = info[f.maskin_id] || { forstaFil: null, antalFiler: 0 };
          cur.antalFiler += 1;
          if (f.importerad_tid && (!cur.forstaFil || f.importerad_tid < cur.forstaFil)) {
            cur.forstaFil = f.importerad_tid;
          }
          info[f.maskin_id] = cur;
        }
        setFilinfo(info);
      } else {
        setFilinfo({});
      }
    } catch (e: any) {
      setFel(e.message || String(e));
    } finally {
      setLaddar(false);
    }
  };

  useEffect(() => { ladda(); }, []);

  if (laddar) return <Card><p style={{ margin: 0, color: C.label, fontSize: 14 }}>Laddar…</p></Card>;
  if (fel) return <Card style={{ border: `1px solid ${C.red}` }}>
    <p style={{ margin: 0, color: C.red, fontSize: 14 }}>Kunde inte ladda maskiner: {fel}</p>
  </Card>;

  if (vy.typ === "detalj") {
    const m = maskiner.find(x => x.maskin_id === vy.id);
    if (!m) { setVy({ typ: "lista" }); return null; }
    return (
      <DetaljVy
        maskin={m}
        onKlar={() => { setVy({ typ: "lista" }); ladda(); }}
        onTillbaka={() => setVy({ typ: "lista" })}
      />
    );
  }

  return <ListaVy maskiner={maskiner} filinfo={filinfo} onValj={(id) => setVy({ typ: "detalj", id })} />;
}

/* ─── LISTA ─── */

function ListaVy({
  maskiner, filinfo, onValj,
}: {
  maskiner: Maskin[];
  filinfo: Record<string, FilInfo>;
  onValj: (id: string) => void;
}) {
  // Status ur DATUM/BEKRÄFTELSE, aldrig ur filtystnad (en tyst maskin kan vara
  // på semester, inte ur drift). Obekräftad = Väntar; aktiv_till satt = Ur drift.
  const obekraftade = maskiner.filter(m => !m.bekraftad && !m.aktiv_till);
  const iDrift = maskiner.filter(m => m.bekraftad && !m.aktiv_till);
  const urDrift = maskiner.filter(m => !!m.aktiv_till);

  return (
    <>
      {obekraftade.length > 0 && (
        <>
          <p style={{ ...secHead, color: C.orange }}>⚠ Nya maskiner upptäckta ({obekraftade.length})</p>
          <Card style={{ padding: 0, border: `1px solid rgba(255,159,10,0.3)` }}>
            {obekraftade.map((m, i) => {
              const fi = filinfo[m.maskin_id];
              const forsta = fi?.forstaFil ? new Date(fi.forstaFil).toLocaleDateString("sv-SE") : null;
              return (
                <div key={m.maskin_id} onClick={() => onValj(m.maskin_id)} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 20px",
                  borderBottom: i === obekraftade.length - 1 ? "none" : `1px solid ${C.line}`,
                  cursor: "pointer", gap: 12,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>
                      {m.maskin_id}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, color: C.label }}>
                      {[m.tillverkare, typLabel(m.maskin_typ)].filter(Boolean).join(" · ") || "okänd typ"}
                      {forsta ? ` · första fil ${forsta}` : ""}
                      {fi?.antalFiler ? ` · ${fi.antalFiler} fil${fi.antalFiler === 1 ? "" : "er"}` : ""}
                    </div>
                  </div>
                  <span style={{
                    background: "rgba(255,159,10,0.15)", color: C.orange,
                    fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8,
                    whiteSpace: "nowrap",
                  }}>Bekräfta ›</span>
                </div>
              );
            })}
          </Card>
        </>
      )}

      <p style={{ ...secHead, marginTop: obekraftade.length > 0 ? 22 : 0 }}>I drift ({iDrift.length})</p>
      <Card style={{ padding: 0 }}>
        {iDrift.length === 0 ? (
          <p style={{ margin: 0, padding: 18, color: C.label, fontSize: 14 }}>Inga maskiner i drift.</p>
        ) : iDrift.map((m, i) => (
          <MaskinRad key={m.maskin_id} m={m} sist={i === iDrift.length - 1} onValj={onValj} />
        ))}
      </Card>

      {urDrift.length > 0 && (
        <>
          <p style={{ ...secHead, marginTop: 22 }}>Ur drift ({urDrift.length})</p>
          <Card style={{ padding: 0 }}>
            {urDrift.map((m, i) => (
              <MaskinRad key={m.maskin_id} m={m} sist={i === urDrift.length - 1} onValj={onValj} graton />
            ))}
          </Card>
        </>
      )}
    </>
  );
}

function MaskinRad({
  m, sist, onValj, graton,
}: {
  m: Maskin; sist: boolean; onValj: (id: string) => void; graton?: boolean;
}) {
  const saldDatum = m.aktiv_till ? new Date(m.aktiv_till).toLocaleDateString("sv-SE") : null;
  return (
    <div onClick={() => onValj(m.maskin_id)} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 20px",
      borderBottom: sist ? "none" : `1px solid ${C.line}`,
      cursor: "pointer", gap: 12, opacity: graton ? 0.5 : 1,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{maskinNamn(m)}</div>
        <div style={{ marginTop: 4, fontSize: 12, color: C.label, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span>{typLabel(m.maskin_typ)}</span>
          {m.modell && <span>· {m.modell}</span>}
          {saldDatum && <span>· ur drift {saldDatum}</span>}
          {!m.sander_filer && <span>· sänder ej filer</span>}
        </div>
      </div>
      <ChevronRight />
    </div>
  );
}

/* ─── DETALJ / REDIGERA / BEKRÄFTA ─── */

function DetaljVy({
  maskin, onKlar, onTillbaka,
}: {
  maskin: Maskin;
  onKlar: () => void;
  onTillbaka: () => void;
}) {
  const [visningsnamn, setVisningsnamn] = useState(maskin.visningsnamn || "");
  const [tillverkare, setTillverkare] = useState(maskin.tillverkare || "");
  const [maskinTyp, setMaskinTyp] = useState(maskin.maskin_typ || "");
  const [sanderFiler, setSanderFiler] = useState(maskin.sander_filer);
  const [aktivFran, setAktivFran] = useState(maskin.aktiv_fran || "");
  const [aktivTill, setAktivTill] = useState(maskin.aktiv_till || "");
  const [sparar, setSparar] = useState(false);
  const [sparFel, setSparFel] = useState<string | null>(null);
  const [urDriftLage, setUrDriftLage] = useState(false);

  const obekraftad = !maskin.bekraftad;

  const ändrat =
    visningsnamn !== (maskin.visningsnamn || "") ||
    tillverkare !== (maskin.tillverkare || "") ||
    maskinTyp !== (maskin.maskin_typ || "") ||
    sanderFiler !== maskin.sander_filer ||
    aktivFran !== (maskin.aktiv_fran || "") ||
    aktivTill !== (maskin.aktiv_till || "");

  const faltPayload = () => ({
    visningsnamn: visningsnamn.trim() || null,
    tillverkare: tillverkare.trim() || null,
    maskin_typ: maskinTyp || null,
    sander_filer: sanderFiler,
    aktiv_fran: aktivFran || null,
    aktiv_till: aktivTill || null,
  });

  // Verifierat sparande: .select() ger tillbaka de faktiskt uppdaterade raderna.
  // 0 rader UTAN error = RLS blockerade tyst (dim_maskin-skrivning kräver
  // roll='admin' via ar_admin()) — surfa upp det som fel, aldrig falskt "sparat".
  const verifieraSkriv = async (patch: Record<string, any>): Promise<boolean> => {
    const { data, error } = await supabase.from("dim_maskin")
      .update(patch).eq("maskin_id", maskin.maskin_id).select("maskin_id");
    if (error) { setSparFel(error.message); return false; }
    if (!data || data.length === 0) {
      setSparFel("Sparningen nådde inga rader — troligen behörighet (ändringar kräver admin-roll).");
      return false;
    }
    return true;
  };

  const skriv = async (extra: Record<string, any> = {}) => {
    setSparar(true);
    setSparFel(null);
    const ok = await verifieraSkriv({ ...faltPayload(), ...extra });
    setSparar(false);
    if (ok) onKlar();
  };

  const bekrafta = () => {
    if (!visningsnamn.trim()) { setSparFel("Visningsnamn krävs för att bekräfta"); return; }
    skriv({ bekraftad: true });
  };

  const taUrDrift = async () => {
    // Sätt aktiv_till till valt datum (default idag). All historik bevaras —
    // maskinen faller bara ur bevakning.
    const idag = new Date().toISOString().slice(0, 10);
    setSparar(true);
    setSparFel(null);
    const ok = await verifieraSkriv({ aktiv_till: idag });
    setSparar(false);
    if (ok) onKlar();
  };

  const aterIDrift = async () => {
    setSparar(true);
    setSparFel(null);
    const ok = await verifieraSkriv({ aktiv_till: null });
    setSparar(false);
    if (ok) onKlar();
  };

  return (
    <>
      <button onClick={onTillbaka} style={{
        background: "none", border: "none", color: C.blue, fontSize: 15,
        cursor: "pointer", fontFamily: "inherit", padding: "4px 0", marginBottom: 8,
      }}>‹ Tillbaka</button>

      {obekraftad && (
        <div style={{
          marginBottom: 16, padding: "12px 14px",
          background: "rgba(255,159,10,0.1)", border: `1px solid rgba(255,159,10,0.3)`,
          borderRadius: 10, fontSize: 13, color: C.text,
        }}>
          <b style={{ color: C.orange }}>Ny maskin upptäckt i importen.</b> Serienumret kommer ur
          maskinfilen och är rätt. Fyll i visningsnamn och aktiv-från, bekräfta sedan — därefter
          skyddas dina uppgifter från att skrivas över vid nästa fil.
        </div>
      )}

      {/* Serienummer — låst */}
      <p style={secHead}>Identitet</p>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: C.label, marginBottom: 4 }}>Serienummer (nyckel mot filerna)</div>
            <div style={{ fontSize: 15, color: C.text, fontFamily: "monospace", wordBreak: "break-all" }}>
              {maskin.maskin_id}
            </div>
          </div>
          <span title="Kan inte ändras — nyckeln mot maskinfilerna" style={{
            flexShrink: 0, marginLeft: 12, fontSize: 12, color: C.label,
            display: "flex", alignItems: "center", gap: 4,
          }}>🔒 låst</span>
        </div>
        {maskin.modell && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}`, fontSize: 12, color: C.label }}>
            Modell (ur fil): <span style={{ color: C.text }}>{maskin.modell}</span>
          </div>
        )}
      </Card>

      {/* Grunduppgifter */}
      <p style={{ ...secHead, marginTop: 22 }}>Grunduppgifter</p>
      <Card>
        <Field label="Visningsnamn" value={visningsnamn} onChange={setVisningsnamn} placeholder="t.ex. Scorpion Giant" />
        <Field label="Tillverkare" value={tillverkare} onChange={setTillverkare} placeholder="t.ex. Ponsse" />
        <SelectField label="Maskintyp" value={maskinTyp} onChange={setMaskinTyp} options={[
          { value: "", label: "— välj —" },
          ...TYP_VAL,
          ...(maskinTyp && !TYP_VAL.some(o => o.value === maskinTyp)
            ? [{ value: maskinTyp, label: `${maskinTyp} (ur fil)` }] : []),
        ]} />
        <ToggleField label="Sänder filer" value={sanderFiler} onChange={setSanderFiler}
          hint="Av för maskiner som aldrig skickar maskinfiler (t.ex. JD810E) — då förväntas ingen data." />
      </Card>

      {/* Driftperiod */}
      <p style={{ ...secHead, marginTop: 22 }}>Driftperiod</p>
      <Card>
        <Field label="Aktiv från" value={aktivFran} onChange={setAktivFran} type="date" />
        <Field label="Aktiv till" value={aktivTill} onChange={setAktivTill} type="date"
          hint="Sätts när maskinen säljs/tas ur drift. Historiken bevaras — maskinen faller bara ur bevakning." />
      </Card>

      {sparFel && (
        <div style={{ marginTop: 16, padding: 12, background: "rgba(255,69,58,0.1)", borderRadius: 10, color: C.red, fontSize: 13 }}>
          {sparFel}
        </div>
      )}

      {/* Knappar */}
      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
        {obekraftad ? (
          <button onClick={bekrafta} disabled={sparar || !visningsnamn.trim()} style={{
            ...btnPrimary, opacity: sparar || !visningsnamn.trim() ? 0.4 : 1,
          }}>
            {sparar ? "Bekräftar…" : "Bekräfta maskin"}
          </button>
        ) : (
          <button onClick={() => skriv()} disabled={!ändrat || sparar} style={{
            ...btnPrimary, opacity: !ändrat || sparar ? 0.4 : 1, cursor: !ändrat || sparar ? "default" : "pointer",
          }}>
            {sparar ? "Sparar…" : "Spara ändringar"}
          </button>
        )}

        {/* Ur drift / åter i drift */}
        {maskin.aktiv_till ? (
          <button onClick={aterIDrift} disabled={sparar} style={btnSecondary}>
            Återställ till drift
          </button>
        ) : !obekraftad && !urDriftLage ? (
          <button onClick={() => setUrDriftLage(true)} style={btnDanger}>
            Ta ur drift / markera såld
          </button>
        ) : !obekraftad && urDriftLage ? (
          <div style={{
            background: "rgba(255,69,58,0.08)", border: `1px solid rgba(255,69,58,0.25)`,
            borderRadius: 12, padding: 14,
          }}>
            <p style={{ margin: "0 0 10px", fontSize: 14, color: C.text }}>
              Ta {maskinNamn(maskin)} ur drift per idag? Maskinen slutar bevakas men all historik
              finns kvar. Du kan återställa den när som helst.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setUrDriftLage(false)} style={{ ...btnSecondary, flex: 1 }}>Avbryt</button>
              <button onClick={taUrDrift} disabled={sparar} style={{
                ...btnDanger, flex: 1, background: C.red, color: "#fff", border: "none",
                opacity: sparar ? 0.5 : 1,
              }}>
                {sparar ? "…" : "Ja, ta ur drift"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

/* ─── FÄLT-KOMPONENTER ─── */

function Field({
  label, value, onChange, placeholder, type = "text", hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; hint?: string;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, color: C.label, marginBottom: 6, fontWeight: 500 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={inputStyle as CSSProperties} />
      {hint && <p style={{ margin: "6px 0 0", fontSize: 11, color: C.label }}>{hint}</p>}
    </div>
  );
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, color: C.label, marginBottom: 6, fontWeight: 500 }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        ...inputStyle as CSSProperties,
        appearance: "none", WebkitAppearance: "none",
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'><path d='M1 1l5 5 5-5' stroke='%238e8e93' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg>")`,
        backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center", paddingRight: 36,
      }}>
        {options.map(o => <option key={o.value} value={o.value} style={{ background: "#2a2a2c", color: "#fff" }}>{o.label}</option>)}
      </select>
    </div>
  );
}

function ToggleField({
  label, value, onChange, hint,
}: {
  label: string; value: boolean; onChange: (v: boolean) => void; hint?: string;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{label}</label>
        <button onClick={() => onChange(!value)} style={{
          width: 50, height: 30, borderRadius: 15, border: "none", cursor: "pointer",
          background: value ? C.green : "#3a3a3c", position: "relative", transition: "background 0.2s",
        }}>
          <span style={{
            position: "absolute", top: 3, left: value ? 23 : 3,
            width: 24, height: 24, borderRadius: "50%", background: "#fff", transition: "left 0.2s",
          }} />
        </button>
      </div>
      {hint && <p style={{ margin: "6px 0 0", fontSize: 11, color: C.label }}>{hint}</p>}
    </div>
  );
}
