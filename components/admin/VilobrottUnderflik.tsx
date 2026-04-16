"use client";
import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { C, secHead, Card, btnSecondary } from "./design";
import { analyseraVilobrott, type Vilobrott } from "@/lib/vilobrott";

type Medarbetare = { id: string; namn: string | null };
type ArbetsdagDb = { medarbetare_id: string; datum: string; start_tid: string | null; slut_tid: string | null };

type BrottMedNamn = Vilobrott & { medarbetare_id: string; namn: string };

export default function VilobrottUnderflik() {
  const [medarbetare, setMedarbetare] = useState<Medarbetare[]>([]);
  const [arbetsdagar, setArbetsdagar] = useState<ArbetsdagDb[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLaddar(true); setFel(null);
    (async () => {
      try {
        const idag = new Date();
        const trMånSedan = new Date(idag.getFullYear(), idag.getMonth() - 3, 1);
        const från = trMånSedan.toISOString().slice(0, 10);

        const [medRes, arbRes] = await Promise.all([
          supabase.from("medarbetare").select("id, namn").order("namn"),
          supabase.from("arbetsdag")
            .select("medarbetare_id, datum, start_tid, slut_tid")
            .gte("datum", från)
            .order("datum"),
        ]);

        if (cancelled) return;
        if (medRes.error) throw medRes.error;
        if (arbRes.error) throw arbRes.error;

        setMedarbetare(medRes.data || []);
        setArbetsdagar(arbRes.data || []);
      } catch (e: any) {
        if (!cancelled) setFel(e.message || String(e));
      } finally {
        if (!cancelled) setLaddar(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const allaBrott: BrottMedNamn[] = useMemo(() => {
    const namnMap = new Map(medarbetare.map(m => [m.id, m.namn || m.id.slice(0, 8)]));
    const dagPerMed = new Map<string, ArbetsdagDb[]>();
    for (const d of arbetsdagar) {
      if (!d.medarbetare_id) continue;
      if (!dagPerMed.has(d.medarbetare_id)) dagPerMed.set(d.medarbetare_id, []);
      dagPerMed.get(d.medarbetare_id)!.push(d);
    }
    const ut: BrottMedNamn[] = [];
    for (const [medId, dagar] of dagPerMed.entries()) {
      const brott = analyseraVilobrott(dagar);
      for (const b of brott) ut.push({ ...b, medarbetare_id: medId, namn: namnMap.get(medId) || medId.slice(0, 8) });
    }
    // Sortera senaste först
    return ut.sort((a, b) => b.datum.localeCompare(a.datum));
  }, [arbetsdagar, medarbetare]);

  const grupperatPerMed = useMemo(() => {
    const map = new Map<string, BrottMedNamn[]>();
    for (const b of allaBrott) {
      if (!map.has(b.medarbetare_id)) map.set(b.medarbetare_id, []);
      map.get(b.medarbetare_id)!.push(b);
    }
    return [...map.entries()]
      .map(([id, brott]) => ({ id, namn: brott[0].namn, brott }))
      .sort((a, b) => b.brott.length - a.brott.length);
  }, [allaBrott]);

  const dygnAntal = allaBrott.filter(b => b.typ === "dygnsvila").length;
  const veckoAntal = allaBrott.filter(b => b.typ === "veckovila").length;

  const exporteraPDF = () => {
    const html = byggPdfHtml(allaBrott);
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { alert("Kunde inte öppna nytt fönster — kolla popup-blockerare."); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <>
      <Card>
        <p style={{ margin: 0, fontSize: 13, color: C.label }}>
          Analyserar arbetsdagar de senaste 3 månaderna mot arbetstidslagens krav:
          <br/>· Dygnsvila ≥ 11 h sammanhängande
          <br/>· Veckovila ≥ 36 h sammanhängande
        </p>
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
          <p style={{ ...secHead, marginTop: 18 }}>Sammanlagt</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <Kpi label="Dygnsvila" värde={dygnAntal} />
            <Kpi label="Veckovila" värde={veckoAntal} />
          </div>

          {/* Per medarbetare */}
          <p style={{ ...secHead, marginTop: 22 }}>
            Per medarbetare ({grupperatPerMed.length} med brott)
          </p>
          {grupperatPerMed.length === 0 ? (
            <Card style={{
              background: "rgba(52,199,89,0.08)",
              border: `1px solid rgba(52,199,89,0.2)`,
            }}>
              <p style={{ margin: 0, fontSize: 14, color: C.green, fontWeight: 600 }}>
                ✓ Inga vilobrott upptäckta de senaste 3 månaderna.
              </p>
            </Card>
          ) : grupperatPerMed.map(g => (
            <Card key={g.id} style={{ padding: 0 }}>
              <div style={{
                padding: "12px 18px",
                borderBottom: `1px solid ${C.line}`,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{g.namn}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: C.red,
                  background: "rgba(255,69,58,0.15)", padding: "3px 8px", borderRadius: 5,
                }}>{g.brott.length} brott</span>
              </div>
              {g.brott.map((b, i) => (
                <div key={i} style={{
                  padding: "12px 18px",
                  borderBottom: i === g.brott.length - 1 ? "none" : `1px solid ${C.line}`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: b.typ === "dygnsvila" ? C.red : C.orange,
                      textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {b.typ === "dygnsvila" ? "Dygnsvila" : "Veckovila"}
                    </span>
                    <span style={{ fontSize: 11, color: C.label }}>v.{b.vecka} {b.år}</span>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: C.text }}>
                    {b.beskrivning}
                  </p>
                </div>
              ))}
            </Card>
          ))}

          {/* Export */}
          <button
            onClick={exporteraPDF}
            disabled={allaBrott.length === 0}
            style={{ ...btnSecondary, marginTop: 22, opacity: allaBrott.length === 0 ? 0.4 : 1 }}
          >
            Exportera PDF för Arbetsmiljöverket
          </button>
        </>
      )}
    </>
  );
}

function Kpi({ label, värde }: { label: string; värde: number }) {
  const färg = värde === 0 ? C.green : C.red;
  return (
    <div style={{
      background: "#1c1c1e", borderRadius: 12, padding: 16,
      border: värde > 0 ? `1px solid rgba(255,69,58,0.3)` : "1px solid rgba(255,255,255,0.06)",
    }}>
      <p style={{ margin: 0, fontSize: 11, color: C.label, fontWeight: 600,
        textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</p>
      <p style={{ margin: "8px 0 0", fontSize: 26, fontWeight: 700, color: färg, letterSpacing: "-0.02em" }}>
        {värde}
      </p>
    </div>
  );
}

function byggPdfHtml(brott: BrottMedNamn[]): string {
  const idag = new Date().toLocaleDateString("sv-SE");
  const grupperat = new Map<string, BrottMedNamn[]>();
  for (const b of brott) {
    if (!grupperat.has(b.namn)) grupperat.set(b.namn, []);
    grupperat.get(b.namn)!.push(b);
  }
  const sektioner = [...grupperat.entries()].map(([namn, lista]) => `
    <h3>${escape(namn)} (${lista.length} brott)</h3>
    <table>
      <thead><tr><th>Datum</th><th>Vecka</th><th>Typ</th><th>Vila</th><th>Krav</th><th>Beskrivning</th></tr></thead>
      <tbody>
        ${lista.map(b => `
          <tr>
            <td>${b.datum}</td>
            <td>v.${b.vecka} ${b.år}</td>
            <td>${b.typ === "dygnsvila" ? "Dygnsvila" : "Veckovila"}</td>
            <td>${b.vila_h} h</td>
            <td>${b.krav_h} h</td>
            <td>${escape(b.beskrivning)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `).join("");

  return `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<title>Vilobrottsrapport ${idag}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; padding: 32px; color: #111; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { color: #666; font-size: 12px; margin-bottom: 24px; }
  h3 { font-size: 15px; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #ccc; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; padding: 6px 8px; background: #f4f4f4; border-bottom: 1px solid #ddd; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  .summary { background: #fff5f5; border: 1px solid #fcc; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 13px; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
  <h1>Vilobrottsrapport — Kompersmåla Skog</h1>
  <div class="meta">Genererad ${idag} · Period: senaste 3 månaderna</div>
  <div class="summary">
    <strong>Sammanfattning:</strong> Totalt ${brott.length} vilobrott upptäckta hos ${grupperat.size} medarbetare.
    Dygnsvila bruten ${brott.filter(b => b.typ === "dygnsvila").length} gånger.
    Veckovila bruten ${brott.filter(b => b.typ === "veckovila").length} gånger.
  </div>
  ${sektioner}
</body>
</html>`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  } as Record<string, string>)[c]);
}
