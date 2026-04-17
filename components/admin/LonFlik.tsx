"use client";
import React, { useState, useEffect, useMemo, CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { C, secHead, Card, btnPrimary, btnSecondary, ChevronRight } from "./design";
import LonesystemUnderflik from "./LonesystemUnderflik";
import AtkUnderflik from "./AtkUnderflik";
import VilobrottUnderflik from "./VilobrottUnderflik";

type Underflik = "underlag" | "system" | "atk" | "vila";
type CurrentUser = { id: string; namn?: string | null; roll: string };

const UNDERFLIKAR: { key: Underflik; label: string }[] = [
  { key: "underlag", label: "Löneunderlag" },
  { key: "system",   label: "Lönesystem" },
  { key: "atk",      label: "ATK-val" },
  { key: "vila",     label: "Vilobrott" },
];

export default function LonFlik({ currentUser }: { currentUser: CurrentUser }) {
  const sp = useSearchParams();
  const förvaldUnderflik = (sp?.get("underflik") as Underflik | null);
  const giltig = förvaldUnderflik && UNDERFLIKAR.some(u => u.key === förvaldUnderflik);
  const [aktiv, setAktiv] = useState<Underflik>(giltig ? förvaldUnderflik! : "underlag");
  return (
    <>
      <UnderflikTabs aktiv={aktiv} onValj={setAktiv} />
      {aktiv === "underlag" && <Loneunderlag />}
      {aktiv === "system"   && <LonesystemUnderflik />}
      {aktiv === "atk"      && <AtkUnderflik currentUser={currentUser} />}
      {aktiv === "vila"     && <VilobrottUnderflik />}
    </>
  );
}

function UnderflikTabs({ aktiv, onValj }: { aktiv: Underflik; onValj: (k: Underflik) => void }) {
  return (
    <div style={{
      display: "flex", gap: 4, marginBottom: 18,
      background: "#1c1c1e", borderRadius: 10, padding: 4,
      border: "1px solid rgba(255,255,255,0.06)",
    }}>
      {UNDERFLIKAR.map(t => (
        <button key={t.key} onClick={() => onValj(t.key)} style={{
          flex: 1, padding: "8px 4px",
          background: aktiv === t.key ? "rgba(255,255,255,0.08)" : "transparent",
          border: "none", borderRadius: 7,
          color: aktiv === t.key ? "#fff" : C.label,
          fontSize: 12, fontWeight: aktiv === t.key ? 600 : 500,
          cursor: "pointer", fontFamily: "inherit",
          transition: "all 0.15s",
        }}>{t.label}</button>
      ))}
    </div>
  );
}

/* ─── LÖNEUNDERLAG ─── */

type Medarbetare = { id: string; namn: string | null };
type Arbetsdag = {
  medarbetare_id: string;
  datum: string;
  arbetad_min: number | null;
  km_morgon: number | null;
  km_kvall: number | null;
  km_totalt?: number | null;
  traktamente: any;
  bekraftad: boolean | null;
  dagtyp?: string | null;
};
type ExtraTid = { medarbetare_id: string; datum: string; minuter: number | null };
type Avtal = {
  timlon_kr?: number | null;
  overtid_vardag_kr?: number | null;
  km_ersattning_kr?: number | null;
  km_grans_per_dag?: number | null;
  traktamente_hel_kr?: number | null;
};

type Rad = {
  medarbetare_id: string;
  namn: string;
  arbetsdagar: number;
  jobbadH: number;
  målH: number;
  övertidH: number;
  övertidKr: number;
  totalKm: number;
  ersättningsKm: number;
  körKr: number;
  trakDagar: number;
  trakKr: number;
  totaltKr: number;
  obekräftade: number;
};

function månadsLabel(period: string): string {
  const [å, m] = period.split("-").map(Number);
  return new Date(å, m - 1, 1).toLocaleDateString("sv-SE", { month: "long", year: "numeric" });
}

function periodNu(): string {
  const nu = new Date();
  return `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, "0")}`;
}

function periodOffset(period: string, delta: number): string {
  const [å, m] = period.split("-").map(Number);
  const d = new Date(å, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Loneunderlag() {
  const [period, setPeriod] = useState(periodNu());
  const [medarbetare, setMedarbetare] = useState<Medarbetare[]>([]);
  const [arbetsdagar, setArbetsdagar] = useState<Arbetsdag[]>([]);
  const [extraTid, setExtraTid] = useState<ExtraTid[]>([]);
  const [avtal, setAvtal] = useState<Avtal | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);
  const [valdMedId, setValdMedId] = useState<string | null>(null);
  const [fortnoxData, setFortnoxData] = useState<any>(null);
  const [fortnoxLaddar, setFortnoxLaddar] = useState(false);
  const [visaBekräftelse, setVisaBekräftelse] = useState(false);
  const [skickar, setSkickar] = useState(false);
  const [exportResultat, setExportResultat] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    setLaddar(true);
    setFel(null);
    (async () => {
      try {
        const periodStart = period + "-01";
        const [å, m] = period.split("-").map(Number);
        const periodSlut = new Date(å, m, 0).toISOString().slice(0, 10); // sista dagen i månaden

        const [medRes, arbRes, exRes, avtRes] = await Promise.all([
          supabase.from("medarbetare").select("id, namn").order("namn"),
          supabase.from("arbetsdag")
            .select("medarbetare_id, datum, arbetad_min, km_morgon, km_kvall, km_totalt, traktamente, bekraftad, dagtyp")
            .gte("datum", periodStart).lte("datum", periodSlut),
          supabase.from("extra_tid")
            .select("medarbetare_id, datum, minuter")
            .gte("datum", periodStart).lte("datum", periodSlut),
          supabase.from("gs_avtal").select("*").order("giltigt_fran", { ascending: false }).limit(1).single(),
        ]);

        if (cancelled) return;
        if (medRes.error) throw medRes.error;
        if (arbRes.error) throw arbRes.error;

        setMedarbetare(medRes.data || []);
        setArbetsdagar(arbRes.data || []);
        setExtraTid(exRes.data || []);
        setAvtal(avtRes.data || null);
      } catch (e: any) {
        if (!cancelled) setFel(e.message || String(e));
      } finally {
        if (!cancelled) setLaddar(false);
      }
    })();
    return () => { cancelled = true; };
  }, [period]);

  const rader: Rad[] = useMemo(() => {
    const timlon = avtal?.timlon_kr ?? 185;
    const övtidKr = avtal?.overtid_vardag_kr ?? 54.94;
    const kmErs = avtal?.km_ersattning_kr ?? 27.50; // kr/mil
    const frikm = avtal?.km_grans_per_dag ?? 60;
    const trakHel = avtal?.traktamente_hel_kr ?? 300;

    const namnMap = new Map(medarbetare.map(m => [m.id, m.namn || "—"]));
    const radMap = new Map<string, Rad>();

    for (const d of arbetsdagar) {
      if (!d.medarbetare_id) continue;
      let r = radMap.get(d.medarbetare_id);
      if (!r) {
        r = {
          medarbetare_id: d.medarbetare_id,
          namn: namnMap.get(d.medarbetare_id) || d.medarbetare_id.slice(0, 8),
          arbetsdagar: 0, jobbadH: 0, målH: 0, övertidH: 0, övertidKr: 0,
          totalKm: 0, ersättningsKm: 0, körKr: 0,
          trakDagar: 0, trakKr: 0, totaltKr: 0, obekräftade: 0,
        };
        radMap.set(d.medarbetare_id, r);
      }
      r.arbetsdagar += 1;
      r.jobbadH += (d.arbetad_min || 0) / 60;
      const km = (d.km_totalt ?? d.km_morgon ?? 0) + (d.km_kvall ?? 0);
      r.totalKm += km;
      if (d.traktamente) r.trakDagar += 1;
      if (!d.bekraftad) r.obekräftade += 1;
    }

    // Lägg på extra tid
    for (const e of extraTid) {
      const r = radMap.get(e.medarbetare_id);
      if (!r) continue;
      r.jobbadH += (e.minuter || 0) / 60;
    }

    // Slutberäkningar
    for (const r of radMap.values()) {
      r.jobbadH = Math.round(r.jobbadH * 10) / 10;
      r.målH = r.arbetsdagar * 8;
      r.övertidH = Math.max(0, Math.round((r.jobbadH - r.målH) * 10) / 10);
      r.övertidKr = Math.round(r.övertidH * övtidKr);
      r.ersättningsKm = Math.max(0, r.totalKm - frikm * r.arbetsdagar);
      r.körKr = Math.round(r.ersättningsKm * kmErs / 10);
      r.trakKr = r.trakDagar * trakHel;
      const grundKr = Math.round(r.jobbadH * timlon);
      r.totaltKr = grundKr + r.övertidKr + r.körKr + r.trakKr;
    }

    return Array.from(radMap.values()).sort((a, b) => a.namn.localeCompare(b.namn, "sv"));
  }, [arbetsdagar, extraTid, medarbetare, avtal]);

  const totalSummering = useMemo(() => {
    return rader.reduce((acc, r) => ({
      jobbadH: acc.jobbadH + r.jobbadH,
      övertidH: acc.övertidH + r.övertidH,
      körKr: acc.körKr + r.körKr,
      trakKr: acc.trakKr + r.trakKr,
      totaltKr: acc.totaltKr + r.totaltKr,
      obekräftade: acc.obekräftade + r.obekräftade,
    }), { jobbadH: 0, övertidH: 0, körKr: 0, trakKr: 0, totaltKr: 0, obekräftade: 0 });
  }, [rader]);

  const exporteraCSV = () => {
    const header = ["Namn", "Arbetsdagar", "Jobbade tim", "Mål tim", "Övertid tim", "Övertid kr", "Total km", "Ersättnings-km", "Kör kr", "Traktamente dagar", "Traktamente kr", "Totalt kr"].join(";");
    const rows = rader.map(r => [
      r.namn, r.arbetsdagar, r.jobbadH, r.målH, r.övertidH, r.övertidKr,
      r.totalKm, r.ersättningsKm, r.körKr, r.trakDagar, r.trakKr, r.totaltKr,
    ].join(";"));
    const csv = [header, ...rows].join("\r\n");
    // BOM för Excel-kompatibilitet (ÅÄÖ)
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `loneunderlag_${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (valdMedId) {
    const rad = rader.find(r => r.medarbetare_id === valdMedId);
    const dagar = arbetsdagar.filter(d => d.medarbetare_id === valdMedId)
      .sort((a, b) => a.datum.localeCompare(b.datum));
    const exDagar = extraTid.filter(e => e.medarbetare_id === valdMedId);
    if (!rad) { setValdMedId(null); return null; }
    return <DetaljVy rad={rad} period={period} dagar={dagar} extraTid={exDagar} avtal={avtal} onTillbaka={() => setValdMedId(null)} />;
  }

  return (
    <>
      {/* Månadsväljare */}
      <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px" }}>
        <button onClick={() => setPeriod(periodOffset(period, -1))} style={{
          background: "rgba(255,255,255,0.05)", border: "none", borderRadius: 8,
          width: 36, height: 36, cursor: "pointer", color: "#fff", fontSize: 18, fontFamily: "inherit",
        }}>‹</button>
        <span style={{ fontSize: 16, fontWeight: 600, color: C.text, textTransform: "capitalize" }}>
          {månadsLabel(period)}
        </span>
        <button
          onClick={() => setPeriod(periodOffset(period, 1))}
          disabled={period >= periodNu()}
          style={{
            background: "rgba(255,255,255,0.05)", border: "none", borderRadius: 8,
            width: 36, height: 36, cursor: period >= periodNu() ? "default" : "pointer",
            color: period >= periodNu() ? C.label : "#fff", fontSize: 18, fontFamily: "inherit",
            opacity: period >= periodNu() ? 0.4 : 1,
          }}
        >›</button>
      </Card>

      {laddar ? (
        <Card><p style={{ margin: 0, color: C.label, fontSize: 14 }}>Laddar…</p></Card>
      ) : fel ? (
        <Card style={{ border: `1px solid ${C.red}` }}>
          <p style={{ margin: 0, color: C.red, fontSize: 14 }}>Kunde inte ladda löneunderlag: {fel}</p>
        </Card>
      ) : rader.length === 0 ? (
        <Card><p style={{ margin: 0, color: C.label, fontSize: 14 }}>Inga arbetsdagar registrerade för {månadsLabel(period)}.</p></Card>
      ) : (
        <>
          {/* Summering */}
          <p style={{ ...secHead, marginTop: 18 }}>Sammanlagt</p>
          <Card>
            <SummeringRad label="Jobbade timmar" värde={`${totalSummering.jobbadH.toFixed(1)} h`} />
            <SummeringRad label="Övertid" värde={`${totalSummering.övertidH.toFixed(1)} h`} />
            <SummeringRad label="Körersättning" värde={`${totalSummering.körKr.toLocaleString("sv-SE")} kr`} />
            <SummeringRad label="Traktamente" värde={`${totalSummering.trakKr.toLocaleString("sv-SE")} kr`} />
            <SummeringRad label="Totalt" värde={`${totalSummering.totaltKr.toLocaleString("sv-SE")} kr`} bold sista />
            {totalSummering.obekräftade > 0 && (
              <div style={{
                marginTop: 8, padding: "8px 12px",
                background: "rgba(255,159,10,0.1)", borderRadius: 8,
                fontSize: 12, color: C.orange, fontWeight: 600,
              }}>⚠ {totalSummering.obekräftade} obekräftad{totalSummering.obekräftade === 1 ? "" : "e"} arbetsdag{totalSummering.obekräftade === 1 ? "" : "ar"}</div>
            )}
          </Card>

          {/* Per medarbetare */}
          <p style={{ ...secHead, marginTop: 22 }}>Per medarbetare ({rader.length})</p>
          <Card style={{ padding: 0 }}>
            {rader.map((r, i) => (
              <div key={r.medarbetare_id} onClick={() => setValdMedId(r.medarbetare_id)} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 20px", cursor: "pointer", gap: 12,
                borderBottom: i === rader.length - 1 ? "none" : `1px solid ${C.line}`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{r.namn}</span>
                    {r.obekräftade > 0 && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: C.orange,
                        background: "rgba(255,159,10,0.15)", padding: "2px 6px", borderRadius: 5,
                      }}>{r.obekräftade} obek.</span>
                    )}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: C.label, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span>{r.jobbadH.toFixed(1)} h</span>
                    {r.övertidH > 0 && <span style={{ color: C.orange }}>+{r.övertidH.toFixed(1)} ö</span>}
                    {r.totalKm > 0 && <span>{r.totalKm} km</span>}
                    {r.trakDagar > 0 && <span>{r.trakDagar} trak</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                    {r.totaltKr.toLocaleString("sv-SE")}
                  </div>
                  <div style={{ fontSize: 11, color: C.label }}>kr</div>
                </div>
                <ChevronRight />
              </div>
            ))}
          </Card>

          {/* Fortnox export */}
          <p style={{ ...secHead, marginTop: 28 }}>Fortnox-export</p>
          <FortnoxExportSektion
            period={period}
            fortnoxData={fortnoxData}
            fortnoxLaddar={fortnoxLaddar}
            onFörhandsgranska={async () => {
              setFortnoxLaddar(true); setExportResultat(null);
              try {
                const res = await fetch("/api/fortnox/salary-export", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ period, dry_run: true }),
                });
                setFortnoxData(await res.json());
              } catch (e: any) {
                setFortnoxData({ ok: false, meddelande: e.message });
              } finally { setFortnoxLaddar(false); }
            }}
            onSkicka={() => setVisaBekräftelse(true)}
            exportResultat={exportResultat}
          />

          <div style={{ marginTop: 16 }}>
            <button onClick={exporteraCSV} style={btnSecondary}>
              Exportera CSV
            </button>
          </div>

          {/* Bekräftelsedialog */}
          {visaBekräftelse && fortnoxData?.medarbetare && (
            <div onClick={() => setVisaBekräftelse(false)} style={{
              position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
              background: "rgba(0,0,0,0.7)", zIndex: 100,
              display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
            }}>
              <div onClick={e => e.stopPropagation()} style={{
                background: "#1c1c1e", borderRadius: 16, padding: 24,
                width: "100%", maxWidth: 440, maxHeight: "80vh", overflow: "auto",
              }}>
                <p style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 700, color: C.text, textAlign: "center" }}>
                  Skicka till Fortnox?
                </p>
                <p style={{ margin: "0 0 12px", fontSize: 13, color: C.label }}>
                  Löneperiod {månadsLabel(period)} (arbetstid {fortnoxData.arbetsperiod ? månadsLabel(fortnoxData.arbetsperiod) : "—"}).
                  {" "}{fortnoxData.medarbetare.length} medarbetare, {fortnoxData.totalt_rader} lönerader.
                </p>
                {fortnoxData.medarbetare.filter((m: any) => m.varningar?.length > 0).length > 0 && (
                  <div style={{ marginBottom: 12, padding: 10, background: "rgba(255,159,10,0.1)", borderRadius: 8, fontSize: 12, color: C.orange }}>
                    ⚠ Det finns varningar — granska innan du skickar.
                  </div>
                )}
                {fortnoxData.medarbetare.map((m: any, i: number) => (
                  <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: C.text, fontWeight: 500 }}>{m.namn}</span>
                      <span style={{ color: m.status === "skickat" ? C.green : C.text }}>{m.rader.length} rader</span>
                    </div>
                    {m.status === "skickat" && <span style={{ fontSize: 11, color: C.green }}>Redan skickat</span>}
                    {!m.anstallningsnummer && <span style={{ fontSize: 11, color: C.red }}>Saknar anst.nr</span>}
                  </div>
                ))}
                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <button onClick={() => setVisaBekräftelse(false)} style={{ ...btnSecondary, flex: 1 }}>Avbryt</button>
                  <button
                    onClick={async () => {
                      setSkickar(true);
                      try {
                        const res = await fetch("/api/fortnox/salary-export", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ period }),
                        });
                        setExportResultat(await res.json());
                      } catch (e: any) {
                        setExportResultat({ ok: false, meddelande: e.message });
                      } finally {
                        setSkickar(false);
                        setVisaBekräftelse(false);
                        // Refresh förhandsgranskning
                        const res2 = await fetch("/api/fortnox/salary-export", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ period, dry_run: true }),
                        });
                        setFortnoxData(await res2.json());
                      }
                    }}
                    disabled={skickar}
                    style={{ ...btnPrimary, flex: 1, background: C.green, opacity: skickar ? 0.5 : 1 }}
                  >{skickar ? "Skickar…" : "Skicka till Fortnox"}</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function SummeringRad({ label, värde, bold, sista }: { label: string; värde: string; bold?: boolean; sista?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 0",
      borderBottom: sista ? "none" : `1px solid ${C.line}`,
    }}>
      <span style={{ fontSize: 13, color: C.label, fontWeight: bold ? 600 : 500 }}>{label}</span>
      <span style={{ fontSize: bold ? 17 : 14, fontWeight: bold ? 700 : 500, color: C.text }}>{värde}</span>
    </div>
  );
}

/* ─── DETALJ-VY PER FÖRARE ─── */

function DetaljVy({
  rad, period, dagar, extraTid, avtal, onTillbaka,
}: {
  rad: Rad;
  period: string;
  dagar: Arbetsdag[];
  extraTid: ExtraTid[];
  avtal: Avtal | null;
  onTillbaka: () => void;
}) {
  const timlon = avtal?.timlon_kr ?? 185;
  const grundKr = Math.round(rad.jobbadH * timlon);

  return (
    <>
      <button onClick={onTillbaka} style={{
        background: "none", border: "none", color: C.blue, fontSize: 15,
        cursor: "pointer", fontFamily: "inherit", padding: "4px 0", marginBottom: 8,
      }}>‹ Tillbaka</button>

      <p style={secHead}>{rad.namn} — {månadsLabel(period)}</p>

      {/* Sammanfattning */}
      <Card>
        <SummeringRad label="Arbetsdagar" värde={`${rad.arbetsdagar} dagar`} />
        <SummeringRad label="Jobbade timmar" värde={`${rad.jobbadH.toFixed(1)} h`} />
        <SummeringRad label="Mål" värde={`${rad.målH} h`} />
        <SummeringRad label={`Grundlön (${timlon} kr/h)`} värde={`${grundKr.toLocaleString("sv-SE")} kr`} />
        <SummeringRad label={`Övertid (${rad.övertidH.toFixed(1)} h)`} värde={`${rad.övertidKr.toLocaleString("sv-SE")} kr`} />
        <SummeringRad label={`Körersättning (${rad.ersättningsKm} km)`} värde={`${rad.körKr.toLocaleString("sv-SE")} kr`} />
        <SummeringRad label={`Traktamente (${rad.trakDagar} dagar)`} värde={`${rad.trakKr.toLocaleString("sv-SE")} kr`} />
        <SummeringRad label="Totalt" värde={`${rad.totaltKr.toLocaleString("sv-SE")} kr`} bold sista />
      </Card>

      {/* Dagar */}
      <p style={{ ...secHead, marginTop: 22 }}>Dagar ({dagar.length})</p>
      <Card style={{ padding: 0 }}>
        {dagar.map((d, i) => {
          const ex = extraTid.filter(e => e.datum === d.datum).reduce((s, e) => s + (e.minuter || 0), 0);
          const tim = ((d.arbetad_min || 0) + ex) / 60;
          const km = (d.km_totalt ?? d.km_morgon ?? 0) + (d.km_kvall ?? 0);
          return (
            <div key={i} style={{
              padding: "12px 20px",
              borderBottom: i === dagar.length - 1 ? "none" : `1px solid ${C.line}`,
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>
                    {new Date(d.datum).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                  {!d.bekraftad && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: C.orange,
                      background: "rgba(255,159,10,0.15)", padding: "2px 5px", borderRadius: 4,
                    }}>OBEK.</span>
                  )}
                  {d.dagtyp && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: C.label,
                      background: "rgba(255,255,255,0.05)", padding: "2px 5px", borderRadius: 4,
                    }}>{d.dagtyp}</span>
                  )}
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: C.label, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span>{tim.toFixed(1)} h</span>
                  {km > 0 && <span>{km} km</span>}
                  {d.traktamente && <span>traktamente</span>}
                  {ex > 0 && <span>+{(ex / 60).toFixed(1)}h extra</span>}
                </div>
              </div>
            </div>
          );
        })}
      </Card>
    </>
  );
}

/* ─── FORTNOX EXPORT SEKTION ─── */

const LONEART_LABELS: Record<string, string> = {
  "11": "Timlön", "136": "Vältlappar mm", "821": "Färdtidsersättning",
  "1354": "Premielön skotare", "1355": "Premielön skördare",
  "1435": "Övertid skördare", "1436": "Övertid skotare",
};

function FortnoxExportSektion({
  period, fortnoxData, fortnoxLaddar, onFörhandsgranska, onSkicka, exportResultat,
}: {
  period: string;
  fortnoxData: any;
  fortnoxLaddar: boolean;
  onFörhandsgranska: () => void;
  onSkicka: () => void;
  exportResultat: any;
}) {
  if (!fortnoxData) {
    return (
      <Card>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: C.label }}>
          Löneperiod {månadsLabel(period)} = arbetstid föregående månad.
          Beräkna lönerader och förhandsgranska innan du skickar till Fortnox.
        </p>
        <button onClick={onFörhandsgranska} disabled={fortnoxLaddar} style={{ ...btnSecondary, opacity: fortnoxLaddar ? 0.5 : 1 }}>
          {fortnoxLaddar ? "Beräknar…" : "Förhandsgranska Fortnox-export"}
        </button>
      </Card>
    );
  }

  if (!fortnoxData.ok) {
    return (
      <Card style={{ border: `1px solid ${C.red}` }}>
        <p style={{ margin: 0, color: C.red, fontSize: 14 }}>{fortnoxData.meddelande || "Kunde inte beräkna."}</p>
      </Card>
    );
  }

  const medarbetare = fortnoxData.medarbetare || [];
  const arbetsperiodLabel = fortnoxData.arbetsperiod ? månadsLabel(fortnoxData.arbetsperiod) : "—";

  return (
    <>
      {/* Export-resultat */}
      {exportResultat && (
        <Card style={{
          border: `1px solid ${exportResultat.ok ? "rgba(52,199,89,0.3)" : "rgba(255,69,58,0.3)"}`,
          background: exportResultat.ok ? "rgba(52,199,89,0.06)" : "rgba(255,69,58,0.06)",
          marginBottom: 12,
        }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: exportResultat.ok ? C.green : C.red }}>
            {exportResultat.ok
              ? `✓ ${exportResultat.skickade} lönerader skickade till Fortnox.`
              : `Fel: ${exportResultat.meddelande || `${exportResultat.fel} fel uppstod.`}`}
          </p>
          {exportResultat.felMeddelanden?.length > 0 && (
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, color: C.red }}>
              {exportResultat.felMeddelanden.map((f: string, i: number) => <li key={i}>{f}</li>)}
            </ul>
          )}
        </Card>
      )}

      {/* Periodinfo */}
      <Card style={{ padding: "12px 18px", background: "rgba(10,132,255,0.06)", border: "1px solid rgba(10,132,255,0.15)" }}>
        <p style={{ margin: 0, fontSize: 13, color: C.blue }}>
          Löneperiod <strong>{månadsLabel(period)}</strong> — arbetstid <strong>{arbetsperiodLabel}</strong>
        </p>
      </Card>

      {/* Per medarbetare — Fortnox-rader */}
      <Card style={{ padding: 0 }}>
        {medarbetare.map((m: any, mi: number) => (
          <div key={mi} style={{
            padding: "14px 18px",
            borderBottom: mi === medarbetare.length - 1 ? "none" : `1px solid ${C.line}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{m.namn}</span>
              <StatusBadge status={m.status} />
            </div>
            {!m.anstallningsnummer && (
              <p style={{ margin: "0 0 6px", fontSize: 11, color: C.red }}>⚠ Anställningsnummer saknas</p>
            )}
            {m.varningar?.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                {m.varningar.slice(0, 3).map((v: string, i: number) => (
                  <p key={i} style={{ margin: 0, fontSize: 11, color: C.orange }}>{v}</p>
                ))}
                {m.varningar.length > 3 && <p style={{ margin: 0, fontSize: 11, color: C.label }}>…och {m.varningar.length - 3} till</p>}
              </div>
            )}
            <div style={{ fontSize: 12, color: C.label, display: "flex", gap: 12, flexWrap: "wrap" }}>
              {m.arbetsdagar > 0 && <span>{m.arbetsdagar}d × 8h = {m.ordinarie_h}h ord.</span>}
              {m.timlon_h > 0 && <span>Timlön: {m.timlon_h}h</span>}
              {(m.premielon_skordare_h > 0 || m.premielon_skotare_h > 0) && (
                <span>Premie: {m.premielon_skordare_h > 0 ? `${m.premielon_skordare_h}h skö` : ""}{m.premielon_skordare_h > 0 && m.premielon_skotare_h > 0 ? " + " : ""}{m.premielon_skotare_h > 0 ? `${m.premielon_skotare_h}h sko` : ""}</span>
              )}
              {m.overtid_h > 0 && <span style={{ color: C.orange }}>ÖT: {m.overtid_h}h</span>}
              {m.valtlappar_veckor > 0 && <span>Vält: {m.valtlappar_veckor}v</span>}
              {m.kor_mil > 0 && <span>Kör: {m.kor_mil} mil</span>}
            </div>
            {/* Detaljerade rader */}
            <div style={{ marginTop: 6 }}>
              {(m.rader || []).map((r: any, ri: number) => (
                <div key={ri} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0", color: C.label }}>
                  <span>{LONEART_LABELS[r.SalaryCode] || r.SalaryCode} ({r.SalaryCode})</span>
                  <span style={{ color: C.text, fontWeight: 500 }}>{r.Number}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Card>

      {/* Knappar */}
      <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
        <button onClick={onFörhandsgranska} disabled={fortnoxLaddar} style={{ ...btnSecondary, flex: 1, opacity: fortnoxLaddar ? 0.5 : 1 }}>
          {fortnoxLaddar ? "Beräknar…" : "Uppdatera"}
        </button>
        <button
          onClick={onSkicka}
          disabled={medarbetare.every((m: any) => m.status === "skickat" || !m.anstallningsnummer)}
          style={{
            ...btnPrimary,
            flex: 1,
            background: C.green,
            opacity: medarbetare.every((m: any) => m.status === "skickat" || !m.anstallningsnummer) ? 0.4 : 1,
          }}
        >Skicka till Fortnox</button>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; fg: string; text: string }> = {
    utkast:  { bg: "rgba(255,255,255,0.06)", fg: C.label, text: "UTKAST" },
    skickat: { bg: "rgba(52,199,89,0.15)", fg: C.green, text: "SKICKAT" },
    fel:     { bg: "rgba(255,69,58,0.15)", fg: C.red, text: "FEL" },
  };
  const c = cfg[status] || cfg.utkast;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color: c.fg,
      background: c.bg, padding: "2px 7px", borderRadius: 5,
      textTransform: "uppercase", letterSpacing: "0.05em",
    }}>{c.text}</span>
  );
}
