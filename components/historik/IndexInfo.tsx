"use client";
// Historikvyn (admin): ⓘ-knappen efter ordet "Index" och bladet "Vad är index?". EN komponent för alla ställen index visas
// (lista, maskinsida, årslista, jämförelse). Bladet är appens vanliga bottenblad (components/Sheet): stängs med drag nedåt, tryck utanför eller Klar.
// Siffrorna i bladet räknas ur vy_hist_normkurva när bladet öppnas (lib/historik/indexForklaring); inga normalvärden är hårdkodade.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { Sheet } from "@/components/Sheet";
import { AVSTAND, FARG, IKON, TNUM, TRAFFYTA, TYP } from "@/lib/design/tokens";
import { hamtaNormkurva } from "@/lib/historik/data";
import { felSlag, felText, type HistorikFelSlag } from "@/lib/historik/fel";
import { atgarderAtt, indexExempel, normaltTabell, underlagText, type IndexAtgard, type Kurvor } from "@/lib/historik/indexForklaring";

/** Kurvan hämtas en gång per sidladdning; ett misslyckande cachas inte, så nästa öppning försöker igen. */
let kurvorLofte: Promise<Kurvor> | null = null;
function kurvor(): Promise<Kurvor> {
  if (!kurvorLofte) {
    kurvorLofte = hamtaNormkurva(supabase).catch((e) => { kurvorLofte = null; throw e; });
  }
  return kurvorLofte;
}

// Tal och enhet hålls ihop på en rad (ingen radbrytning mellan "9" och "m³/G15").
const NBSP = "\u00a0";
const ATGARD_NAMN: Record<IndexAtgard, string> = { gallring: "Gallring", slutavverkning: "Slutavverkning" };

// Knappen är 44 pt stor men tar bara ikonens plats i raden: det som sticker ut är marginal, inte layout.
const UTRYMME = (TRAFFYTA.min - IKON.text) / 2;

/**
 * @param atgard den åtgärd som gäller där man tryckte (gallring eller slutavverkning). Utelämnad = båda (jämförelsevyn, startlistan på Skada/Special).
 */
export default function IndexInfo({ atgard }: { atgard?: IndexAtgard | null }) {
  const [oppen, setOppen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Vad är index?"
        onClick={() => setOppen(true)}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center", verticalAlign: "middle",
          width: TRAFFYTA.min, height: TRAFFYTA.min, margin: `-${UTRYMME}px -${UTRYMME}px -${UTRYMME}px ${AVSTAND.xs - UTRYMME}px`, padding: 0,
          background: "none", border: "none", color: FARG.text2, cursor: "pointer", fontFamily: "inherit", flexShrink: 0, textTransform: "none",
        }}
      >
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text, lineHeight: 1 }}>info</span>
      </button>
      {/* Portal: sidans innehåll tonar in med en transform, och en transform gör `position: fixed` relativ till innehållet i stället för fönstret. */}
      {oppen && typeof document !== "undefined" && createPortal(<IndexBlad atgard={atgard ?? null} onStang={() => setOppen(false)} />, document.body)}
    </>
  );
}

function IndexBlad({ atgard, onStang }: { atgard: IndexAtgard | null; onStang: () => void }) {
  const [k, setK] = useState<Kurvor | null>(null);
  const [fel, setFel] = useState<HistorikFelSlag | null>(null);
  useEffect(() => {
    let avbruten = false;
    kurvor()
      .then((r) => { if (!avbruten) setK(r); })
      .catch((e: unknown) => { console.error("historik: kunde inte läsa vy_hist_normkurva", e); if (!avbruten) setFel(felSlag(e)); });
    return () => { avbruten = true; };
  }, []);

  const atgarder = atgarderAtt(atgard);
  const medKurva = k ? atgarder.filter((a) => k[a]) : [];
  const rubrik = { ...TYP.listtitel, margin: `${AVSTAND.sektion}px 0 0` };
  const stycke = { ...TYP.text, margin: `${AVSTAND.s}px 0 0` };
  const liten = { ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 0` };

  return (
    <Sheet open onClose={onStang} title="Vad är index?" dragNedStanger>
      <div style={{ color: FARG.text }}>
        <p style={{ ...stycke, marginTop: 0 }}>Index visar hur mycket maskinen producerade jämfört med vad som är normalt för den trädstorleken.</p>
        <p style={stycke}>100 = normalt. 110 betyder 10 % mer än normalt. 90 betyder 10 % mindre.</p>

        <h3 style={rubrik}>Varför inte bara m³/G15?</h3>
        <p style={stycke}>Grova träd ger alltid fler m³ per timme än klena. Index räknar bort trädstorleken. Då kan en gallring i klen skog jämföras rättvist med en slutavverkning i grov.</p>

        <h3 style={rubrik}>Vad är normalt?</h3>
        <p style={stycke}>{k ? underlagText(k, atgarder) : "Räknat från våra egna objekt där åtgärden är känd."} Så här mycket gör en maskin normalt per G15-timme:</p>
        {!k && !fel && <p style={liten}>Hämtar normalvärdena …</p>}
        {fel && <p style={liten}>{felText(fel, "normalvärdena")}</p>}
        {k && medKurva.length === 0 && <p style={liten}>Normalvärdena finns inte för den här åtgärden.</p>}
        {k && medKurva.map((a) => (
          <div key={a} style={{ marginTop: AVSTAND.m }}>
            <div style={{ ...TYP.micro, color: FARG.text2 }}>{ATGARD_NAMN[a]}</div>
            <Tabell rader={normaltTabell(k[a]!, a)} />
          </div>
        ))}

        {k && medKurva.length > 0 && (
          <>
            <h3 style={rubrik}>Exempel</h3>
            {medKurva.map((a) => {
              const e = indexExempel(k[a]!, a);
              return (
                <p key={a} style={stycke}>
                  {atgarder.length > 1 && <span style={TYP.listtitel}>{ATGARD_NAMN[a]}. </span>}
                  Medelstam {e.medelstam}{NBSP}m³. Normalt {e.normalt}{NBSP}m³/G15. Maskinen gjorde {e.gjorde} → index {e.index}.
                </p>
              );
            })}
          </>
        )}

        <h3 style={rubrik}>Tänk på</h3>
        <p style={stycke}>Index tar bara hänsyn till trädstorleken. Föraren, terrängen och hur ofta maskinen står still (se TU) påverkar också. Jämför därför alltid index och TU tillsammans.</p>

        <p style={{ ...liten, marginTop: AVSTAND.sektion }}>Index finns bara för gallring och slutavverkning. Vindfällor, skada och special har för olika förutsättningar för att jämföras.</p>
        <p style={liten}>Skotare får inget index, eftersom medelstammen kommer från skördaren.</p>
      </div>
    </Sheet>
  );
}

function Tabell({ rader }: { rader: { medelstam: string; normalt: string }[] }) {
  const rad = { display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: TRAFFYTA.min, borderBottom: `1px solid ${FARG.linje}` };
  return (
    <div role="table">
      <div role="row" style={{ ...rad, minHeight: 0, padding: `${AVSTAND.xs}px 0`, ...TYP.micro, color: FARG.text2 }}>
        <span role="columnheader">Medelstam</span>
        <span role="columnheader">Normalt m³/G15</span>
      </div>
      {rader.map((r) => (
        <div key={r.medelstam} role="row" style={{ ...rad, ...TYP.text, ...TNUM }}>
          <span role="cell">{r.medelstam}{NBSP}m³</span>
          <span role="cell" style={TYP.listtitel}>{r.normalt}</span>
        </div>
      ))}
    </div>
  );
}
