"use client";
import React, { useState, useEffect, useMemo } from "react";
import { AVSTAND, FARG, TYP, TNUM } from "@/lib/design/tokens";
import { laddaVilobrottLista, type VilobrottRad } from "@/lib/admin/vilobrottLista";
import { Sektion, Stod, Kort, Lista, Rad, Sekundar, Fel, Laddar, Etikett } from "./ui";
import { byggPdfHtml } from "@/lib/admin/vilobrottPdf";

// Vilobrott: brotten räknas om ur arbetsdag + extra_tid (de senaste tre månaderna) och förarens svar läggs på
// (lib/admin/vilobrottLista, samma lista som Översikten bygger sin rad på). Rött/orange bara för obesvarat.
export default function VilobrottUnderflik() {
  const [allaBrott, setAllaBrott] = useState<VilobrottRad[]>([]);
  const [pdfFel, setPdfFel] = useState<string | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);
  const [omgang, setOmgang] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLaddar(true); setFel(null);
    laddaVilobrottLista()
      .then(l => { if (!cancelled) setAllaBrott(l); })
      .catch(e => { if (!cancelled) setFel(e?.message || String(e)); })
      .finally(() => { if (!cancelled) setLaddar(false); });
    return () => { cancelled = true; };
  }, [omgang]);

  const grupperatPerMed = useMemo(() => {
    const map = new Map<string, VilobrottRad[]>();
    for (const b of allaBrott) {
      if (!map.has(b.medarbetare_id)) map.set(b.medarbetare_id, []);
      map.get(b.medarbetare_id)!.push(b);
    }
    return Array.from(map.entries())
      .map(([id, brott]: [string, VilobrottRad[]]) => ({ id, namn: brott[0].namn, brott, obesvarade: brott.filter(b => !b.svar).length }))
      .sort((a, b) => b.obesvarade - a.obesvarade || b.brott.length - a.brott.length);
  }, [allaBrott]);

  // Räknarna visar OBESVARADE brott — det som kräver något. Besvarade står kvar i listan, grått.
  const obesvarade = allaBrott.filter(b => !b.svar);
  const dygnAntal = obesvarade.filter(b => b.typ === "dygnsvila").length;
  const veckoAntal = obesvarade.filter(b => b.typ === "veckovila").length;
  const dygnBesvarade = allaBrott.filter(b => b.typ === "dygnsvila" && b.svar).length;
  const veckoBesvarade = allaBrott.filter(b => b.typ === "veckovila" && b.svar).length;

  const exporteraPDF = () => {
    setPdfFel(null);
    const html = byggPdfHtml(allaBrott);
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { setPdfFel("Kunde inte öppna PDF-fönstret — tillåt popup-fönster för sidan och försök igen."); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <>
      <Stod style={{ marginTop: 0 }}>
        Analyserar arbetsdagar de senaste 3 månaderna mot arbetstidslagens krav: dygnsvila minst 11 h sammanhängande, veckovila minst 36 h sammanhängande.
      </Stod>

      {laddar ? (
        <div style={{ marginTop: AVSTAND.l }}><Laddar /></div>
      ) : fel ? (
        <div style={{ marginTop: AVSTAND.l }}><Fel onForsok={() => setOmgang(n => n + 1)}>{fel}</Fel></div>
      ) : (
        <>
          {/* Sammanfattning */}
          <Sektion>Obesvarade</Sektion>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: AVSTAND.m }}>
            <Antal label="Dygnsvila" varde={dygnAntal} besvarade={dygnBesvarade} />
            <Antal label="Veckovila" varde={veckoAntal} besvarade={veckoBesvarade} />
          </div>

          {/* Per medarbetare */}
          <Sektion>Per medarbetare ({grupperatPerMed.length} med brott)</Sektion>
          {grupperatPerMed.length === 0 ? (
            <Kort><p style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>Inga vilobrott upptäckta de senaste 3 månaderna.</p></Kort>
          ) : grupperatPerMed.map(g => (
            <div key={g.id} style={{ marginBottom: AVSTAND.m }}>
              <Lista>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: AVSTAND.m, padding: `${AVSTAND.m}px 0`, borderBottom: `1px solid ${FARG.linje}` }}>
                  <span style={{ ...TYP.listtitel, color: FARG.text }}>{g.namn}</span>
                  {g.obesvarade > 0
                    ? <Etikett farg={FARG.orange}>{g.obesvarade} {g.obesvarade === 1 ? "obesvarat" : "obesvarade"}</Etikett>
                    : <Etikett>alla besvarade</Etikett>}
                </div>
                {g.brott.map((b, i) => (
                  <Rad key={i} sista={i === g.brott.length - 1} dampad={!!b.svar}
                    rubrik={<>{b.typ === "dygnsvila" ? "Dygnsvila" : "Veckovila"} <span style={{ ...TYP.meta, color: FARG.text2, fontWeight: 400 }}>v.{b.vecka} {b.år}</span></>}
                    rubrikFarg={FARG.orange}
                    detalj={<>{b.beskrivning}{b.svar && <><br />Besvarat: {b.svar}</>}</>} />
                ))}
              </Lista>
            </div>
          ))}

          {/* Export */}
          <Sekundar onClick={exporteraPDF} disabled={allaBrott.length === 0} style={{ marginTop: AVSTAND.xl }}>
            Exportera PDF för Arbetsmiljöverket
          </Sekundar>
          {pdfFel && <Stod farg={FARG.rod}>{pdfFel}</Stod>}
        </>
      )}
    </>
  );
}

function Antal({ label, varde, besvarade }: { label: string; varde: number; besvarade: number }) {
  return (
    <Kort>
      <div style={{ ...TYP.micro, color: FARG.text2 }}>{label}</div>
      <div style={{ ...TYP.tal, ...TNUM, color: varde > 0 ? FARG.orange : FARG.text, marginTop: AVSTAND.s }}>{varde}</div>
      {besvarade > 0 && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{besvarade} besvarade</div>}
    </Kort>
  );
}
