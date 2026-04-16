"use client";
import React, { useState, useEffect, CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { C, secHead, Card, inputStyle, btnPrimary } from "./design";

type Avtal = {
  id?: string;
  namn?: string | null;
  giltigt_fran?: string | null;
  giltigt_till?: string | null;
  timlon_kr?: number | null;
  overtid_vardag_kr?: number | null;
  max_overtid_ar?: number | null;
  ob_kvall_kr?: number | null;
  ob_natt_kr?: number | null;
  ob_lordag_kr?: number | null;
  ob_sondag_kr?: number | null;
  km_ersattning_kr?: number | null;
  km_grans_per_dag?: number | null;
  fardtid_kr?: number | null;
  atk_procent?: number | null;
  atk_period?: string | null;
  atk_procent_nasta?: number | null;
  atk_ledig_tim?: number | null;
  atk_faktor?: number | null;
  traktamente_hel_kr?: number | null;
  traktamente_halv_kr?: number | null;
  skifttillagg_kr?: number | null;
  bortovaro_kr?: number | null;
  [k: string]: any;
};

type Fält = {
  key: keyof Avtal;
  label: string;
  suffix?: string;
  type?: "number" | "text" | "date";
  step?: string;
};

type FältGrupp = { rubrik: string; fält: Fält[] };

const GRUPPER: FältGrupp[] = [
  {
    rubrik: "Avtal",
    fält: [
      { key: "namn", label: "Namn", type: "text" },
      { key: "giltigt_fran", label: "Giltigt från", type: "date" },
      { key: "giltigt_till", label: "Giltigt till", type: "date" },
    ],
  },
  {
    rubrik: "Grundlön",
    fält: [
      { key: "timlon_kr", label: "Timlön", suffix: "kr", step: "0.01" },
    ],
  },
  {
    rubrik: "Övertid",
    fält: [
      { key: "overtid_vardag_kr", label: "Övertidsersättning vardag", suffix: "kr/tim", step: "0.01" },
      { key: "max_overtid_ar", label: "Max övertid", suffix: "tim/år", step: "1" },
    ],
  },
  {
    rubrik: "OB-ersättning",
    fält: [
      { key: "ob_kvall_kr", label: "Mån–fre kväll/natt (17–06:30)", suffix: "kr/tim", step: "0.01" },
      { key: "ob_natt_kr",  label: "Nattarbete (00–05)",             suffix: "kr/tim", step: "0.01" },
      { key: "ob_lordag_kr", label: "Lördag",                        suffix: "kr/tim", step: "0.01" },
      { key: "ob_sondag_kr", label: "Söndag",                        suffix: "kr/tim", step: "0.01" },
    ],
  },
  {
    rubrik: "Färdmedel & färdtid",
    fält: [
      { key: "km_ersattning_kr", label: "Färdmedelsersättning", suffix: "kr/mil", step: "0.01" },
      { key: "km_grans_per_dag", label: "Km-gräns",             suffix: "km/dag", step: "1" },
      { key: "fardtid_kr",       label: "Färdtidsersättning",   suffix: "kr/mil", step: "0.01" },
    ],
  },
  {
    rubrik: "ATK",
    fält: [
      { key: "atk_procent",        label: "Avsättning",    suffix: "%",        step: "0.01" },
      { key: "atk_procent_nasta",  label: "Nästa period",  suffix: "%",        step: "0.01" },
      { key: "atk_period",         label: "Uttagsperiod",  type: "text" },
      { key: "atk_ledig_tim",      label: "Ledig tid",     suffix: "tim/år",   step: "0.1" },
      { key: "atk_faktor",         label: "ATK-faktor",                         step: "0.001" },
    ],
  },
  {
    rubrik: "Traktamente",
    fält: [
      { key: "traktamente_hel_kr",  label: "Heldag",  suffix: "kr", step: "1" },
      { key: "traktamente_halv_kr", label: "Halvdag", suffix: "kr", step: "1" },
    ],
  },
  {
    rubrik: "Övriga tillägg",
    fält: [
      { key: "skifttillagg_kr", label: "Skifttillägg",    suffix: "kr/tim", step: "0.01" },
      { key: "bortovaro_kr",    label: "Bortovaro >12h",  suffix: "kr/tim", step: "0.01" },
    ],
  },
];

function månaderKvar(giltigtTill: string | null | undefined): number | null {
  if (!giltigtTill) return null;
  const slut = new Date(giltigtTill);
  if (isNaN(slut.getTime())) return null;
  const nu = new Date();
  return (slut.getFullYear() - nu.getFullYear()) * 12 + (slut.getMonth() - nu.getMonth());
}

export default function AvtalFlik() {
  const [aktuellt, setAktuellt] = useState<Avtal | null>(null);
  const [form, setForm] = useState<Avtal>({});
  const [historik, setHistorik] = useState<Avtal[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);
  const [sparar, setSparar] = useState(false);
  const [sparFel, setSparFel] = useState<string | null>(null);
  const [sparOk, setSparOk] = useState(false);

  const ladda = async () => {
    setLaddar(true);
    setFel(null);
    try {
      const { data, error } = await supabase
        .from("gs_avtal")
        .select("*")
        .order("giltigt_fran", { ascending: false });
      if (error) throw error;
      const rader = data || [];
      if (rader.length === 0) { setAktuellt(null); setHistorik([]); return; }
      setAktuellt(rader[0]);
      setForm(rader[0]);
      setHistorik(rader.slice(1));
    } catch (e: any) {
      setFel(e.message || String(e));
    } finally {
      setLaddar(false);
    }
  };

  useEffect(() => { ladda(); }, []);

  const ändrat = (() => {
    if (!aktuellt) return false;
    for (const g of GRUPPER) for (const f of g.fält) {
      const a = aktuellt[f.key], b = form[f.key];
      const na = a == null || a === "" ? null : a;
      const nb = b == null || b === "" ? null : b;
      if (String(na) !== String(nb)) return true;
    }
    return false;
  })();

  const spara = async () => {
    if (!aktuellt?.id) { setSparFel("Ingen avtalsrad att uppdatera"); return; }
    setSparar(true); setSparFel(null); setSparOk(false);

    // Skicka bara fält som finns på befintlig rad (för att undvika fel på okända kolumner)
    const existerandeKolumner = new Set(Object.keys(aktuellt));
    const payload: Record<string, any> = {};
    for (const g of GRUPPER) for (const f of g.fält) {
      if (!existerandeKolumner.has(f.key as string)) continue;
      const v = form[f.key];
      if (f.type === "number" || f.step !== undefined) {
        payload[f.key as string] = v === "" || v == null ? null : parseFloat(String(v));
      } else {
        payload[f.key as string] = v === "" ? null : v;
      }
    }

    const { error } = await supabase.from("gs_avtal").update(payload).eq("id", aktuellt.id);
    setSparar(false);
    if (error) { setSparFel(error.message); return; }
    setSparOk(true);
    setTimeout(() => setSparOk(false), 2000);
    ladda();
  };

  if (laddar) return <Card><p style={{ margin: 0, color: C.label, fontSize: 14 }}>Laddar avtal…</p></Card>;
  if (fel) return <Card style={{ border: `1px solid ${C.red}` }}>
    <p style={{ margin: 0, color: C.red, fontSize: 14 }}>Kunde inte ladda avtal: {fel}</p>
  </Card>;
  if (!aktuellt) return <Card>
    <p style={{ margin: 0, color: C.label, fontSize: 14 }}>Inget avtal i databasen (gs_avtal är tom).</p>
  </Card>;

  const månKvar = månaderKvar(aktuellt.giltigt_till);
  const varningUtgång = månKvar !== null && månKvar <= 3 && månKvar >= 0;
  const utgåttRedan = månKvar !== null && månKvar < 0;

  return (
    <>
      {/* Aktuellt avtal-header */}
      <Card style={{
        background: "rgba(52,199,89,0.08)",
        border: `1px solid rgba(52,199,89,0.2)`,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: C.green, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Aktuellt avtal
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 700, color: "#fff" }}>
              {aktuellt.namn || "Namnlöst avtal"}
            </p>
          </div>
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 13, color: C.label }}>
          {aktuellt.giltigt_fran ? new Date(aktuellt.giltigt_fran).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" }) : "—"}
          {" – "}
          {aktuellt.giltigt_till ? new Date(aktuellt.giltigt_till).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" }) : "—"}
        </p>
      </Card>

      {/* Påminnelse om utgång */}
      {(varningUtgång || utgåttRedan) && (
        <Card style={{
          background: "rgba(255,69,58,0.08)",
          border: `1px solid rgba(255,69,58,0.25)`,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: C.red }}>warning</span>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.red }}>
                {utgåttRedan ? "Avtalet har gått ut" : `Avtalet går ut om ${månKvar === 0 ? "mindre än en månad" : `${månKvar} månad${månKvar === 1 ? "" : "er"}`}`}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: C.label }}>
                Ladda upp ett nytt avtal eller uppdatera giltighetstiden.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Redigerbart formulär */}
      {GRUPPER.map(g => (
        <div key={g.rubrik} style={{ marginTop: 22 }}>
          <p style={secHead}>{g.rubrik}</p>
          <Card>
            {g.fält.map((f, i) => (
              <AvtalFält
                key={String(f.key)}
                fält={f}
                value={form[f.key]}
                onChange={v => setForm(s => ({ ...s, [f.key]: v }))}
                saknas={!(f.key in aktuellt)}
                sista={i === g.fält.length - 1}
              />
            ))}
          </Card>
        </div>
      ))}

      {/* Spara */}
      {sparFel && (
        <div style={{
          marginTop: 16, padding: 12,
          background: "rgba(255,69,58,0.1)", borderRadius: 10,
          color: C.red, fontSize: 13,
        }}>{sparFel}</div>
      )}
      {sparOk && (
        <div style={{
          marginTop: 16, padding: 12,
          background: "rgba(52,199,89,0.1)", borderRadius: 10,
          color: C.green, fontSize: 13, fontWeight: 600, textAlign: "center",
        }}>Sparat ✓</div>
      )}
      <button
        onClick={spara}
        disabled={!ändrat || sparar}
        style={{ ...btnPrimary, marginTop: 22, opacity: !ändrat || sparar ? 0.4 : 1 }}
      >
        {sparar ? "Sparar…" : "Spara ändringar"}
      </button>

      {/* Ladda upp PDF (stub) */}
      <p style={{ ...secHead, marginTop: 30 }}>Avtals-PDF</p>
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <p style={{ margin: 0, fontSize: 14, color: C.text }}>Ladda upp nytt avtal</p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: C.label }}>
              PDF-uppladdning kommer i senare steg. Avtalsparsning (OCR) från PDF är inte implementerad.
            </p>
          </div>
          <button disabled style={{
            padding: "8px 14px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 8,
            color: C.label,
            fontSize: 13,
            fontFamily: "inherit",
            cursor: "not-allowed",
          }}>Välj fil</button>
        </div>
      </Card>

      {/* Historik */}
      <p style={{ ...secHead, marginTop: 30 }}>Historik ({historik.length})</p>
      <Card style={{ padding: 0 }}>
        {historik.length === 0 ? (
          <p style={{ margin: 0, padding: 18, color: C.label, fontSize: 14 }}>
            Inga tidigare avtalsversioner.
          </p>
        ) : historik.map((h, i) => (
          <div key={h.id || i} style={{
            padding: "14px 20px",
            borderBottom: i === historik.length - 1 ? "none" : `1px solid ${C.line}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                {h.namn || "Namnlöst"}
              </span>
              <span style={{ fontSize: 12, color: C.label }}>
                {h.giltigt_fran ? new Date(h.giltigt_fran).toLocaleDateString("sv-SE", { month: "short", year: "numeric" }) : "—"}
                {" – "}
                {h.giltigt_till ? new Date(h.giltigt_till).toLocaleDateString("sv-SE", { month: "short", year: "numeric" }) : "—"}
              </span>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: C.label, display: "flex", gap: 12, flexWrap: "wrap" }}>
              {h.timlon_kr != null && <span>Timlön {h.timlon_kr} kr</span>}
              {h.overtid_vardag_kr != null && <span>Övertid {h.overtid_vardag_kr} kr/tim</span>}
              {h.traktamente_hel_kr != null && <span>Traktamente {h.traktamente_hel_kr} kr</span>}
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}

function AvtalFält({
  fält, value, onChange, saknas, sista,
}: {
  fält: Fält;
  value: any;
  onChange: (v: any) => void;
  saknas: boolean;
  sista: boolean;
}) {
  const isDate = fält.type === "date";
  const isNumber = fält.step !== undefined;
  const isText = fält.type === "text";

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 0",
      borderBottom: sista ? "none" : `1px solid ${C.line}`,
      gap: 12,
      opacity: saknas ? 0.5 : 1,
    }}>
      <label style={{ fontSize: 14, color: C.label, flex: 1 }}>
        {fält.label}
        {saknas && <span style={{ fontSize: 10, color: C.orange, marginLeft: 6 }}>(kolumn saknas)</span>}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 1 auto" }}>
        <input
          type={isDate ? "date" : isNumber ? "number" : "text"}
          step={fält.step}
          value={value ?? ""}
          onChange={e => {
            const v = e.target.value;
            if (isNumber && v !== "") onChange(v);
            else onChange(v);
          }}
          disabled={saknas}
          style={{
            ...inputStyle as CSSProperties,
            height: 36,
            width: isDate ? 150 : isText ? 180 : 110,
            fontSize: 14,
            textAlign: isNumber ? "right" : "left",
            padding: isDate ? "0 10px" : "0 12px",
          }}
        />
        {fält.suffix && <span style={{ fontSize: 12, color: C.label, minWidth: 40 }}>{fält.suffix}</span>}
      </div>
    </div>
  );
}
