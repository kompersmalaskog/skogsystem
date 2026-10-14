"use client";
// Historikvyn (admin), jämförelsen: samma förare på olika maskiner. Skillnaden mellan maskinerna när föraren är densamma är den rättvisaste jämförelsen
// vi har. Välj förare (bara de som har minst två maskiner med minst 200 G15-timmar i en åtgärd) och åtgärd; en kolumn per maskin, äldst till vänster.
// Läser vy_hist_forare_maskin_jamfor. Reglerna (urval, "bäst", "För lite data", olika år) bor i lib/historik/sammaForare och är testade där.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AVSTAND, FARG, RAD, RADIE, TNUM, TRAFFYTA, TYP } from "@/lib/design/tokens";
import { ATGARD_ETIKETT } from "@/lib/historik/berakna";
import { hamtaForareMaskin } from "@/lib/historik/data";
import { felSlag, felText, type HistorikFelSlag } from "@/lib/historik/fel";
import type { IndexAtgard } from "@/lib/historik/indexForklaring";
import {
  GRANS_G15_H, kolumnRubrik, maskinerForForare, olikaAr, sammaForareRader, TEXT_OLIKA_AR, TEXT_SAMMA_FORARE, urvalForare, type ForareMaskinRad,
} from "@/lib/historik/sammaForare";
import type { MaskinArRad } from "@/lib/historik/typer";
import { Notis, Sektion, Vaxel } from "./delar";
import IndexInfo from "./IndexInfo";

type Props = {
  /** vy_hist_maskin_ar: åren i index-förklaringen hämtas ur dem */
  rader: MaskinArRad[];
  forare: string | null;
  atgard: IndexAtgard;
  gaTill: (patch: { forare?: string | null; atgard?: IndexAtgard }) => void;
};

const ATGARD_NAMN = (a: IndexAtgard) => ATGARD_ETIKETT[a];
const gra = { margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.text2 } as const;
const MASKIN_BREDD = AVSTAND.xxl * 3 + AVSTAND.l; // rymmer "2018–2021" i listtitelns storlek utan radbrytning
const RUBRIK_BREDD = AVSTAND.xxl * 3 - AVSTAND.l;

export default function SammaForare({ rader, forare, atgard, gaTill }: Props) {
  const [data, setData] = useState<ForareMaskinRad[] | null>(null);
  const [fel, setFel] = useState<HistorikFelSlag | null>(null);

  useEffect(() => {
    let avbruten = false;
    hamtaForareMaskin(supabase)
      .then((r) => { if (!avbruten) setData(r); })
      .catch((e: unknown) => { console.error("historik: kunde inte läsa vy_hist_forare_maskin_jamfor", e); if (!avbruten) setFel(felSlag(e)); });
    return () => { avbruten = true; };
  }, []);

  const val = useMemo(() => (data ? urvalForare(data) : []), [data]);
  // Inga tomma val: utan (eller med ett ogiltigt) val gäller första föraren, och en åtgärd som föraren inte kan jämföras i byts mot förarens första.
  const valdForare = val.find((v) => v.forare === forare) ?? val[0] ?? null;
  const valdAtgard = valdForare ? (valdForare.atgarder.includes(atgard) ? atgard : valdForare.atgarder[0]) : null;
  const kolumner = data && valdForare && valdAtgard ? maskinerForForare(data, valdForare.forare, valdAtgard) : [];
  const tabell = sammaForareRader(kolumner);

  if (fel) return <Sektion titel="Samma förare"><p style={{ ...TYP.text, color: FARG.text2, margin: 0 }}>{felText(fel, "jämförelsen")}</p></Sektion>;
  if (!data) return <Sektion titel="Samma förare"><p style={{ ...TYP.text, color: FARG.text2, margin: 0 }}>Hämtar förare och maskiner …</p></Sektion>;
  if (!valdForare || !valdAtgard) {
    return (
      <Sektion titel="Samma förare">
        <p style={{ ...TYP.text, color: FARG.text2, margin: 0 }}>
          Ingen förare har kört minst två skördare med minst {GRANS_G15_H} G15-timmar vardera i samma åtgärd. Jämförelsen fylls på när det finns.
        </p>
      </Sektion>
    );
  }

  const olika = olikaAr(kolumner);
  const saknasFormat = tabell.some((r) => r.celler.some((c) => c.text === "Saknas i formatet"));

  return (
    <>
      <Sektion titel="Välj förare">
        <div style={{ display: "flex", flexWrap: "wrap", gap: AVSTAND.s }}>
          {val.map((v) => {
            const vald = v.forare === valdForare.forare;
            return (
              <button
                key={v.forare}
                type="button"
                aria-pressed={vald}
                onClick={() => gaTill({ forare: v.forare, atgard: v.atgarder.includes(valdAtgard) ? valdAtgard : v.atgarder[0] })}
                style={{
                  minHeight: TRAFFYTA.min, border: "none", borderRadius: RADIE.knapp, padding: `${AVSTAND.s}px ${AVSTAND.m}px`, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  background: vald ? FARG.upphojt : FARG.kort, color: FARG.text, ...(vald ? TYP.listtitel : TYP.text), fontSize: TYP.meta.fontSize,
                }}
              >
                {v.forare}
                <span style={{ display: "block", ...TYP.micro, textTransform: "none", color: FARG.text2, fontWeight: 400 }}>{v.atgarder.map(ATGARD_NAMN).join(" · ")}</span>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: AVSTAND.m }}>
          {valdForare.atgarder.length > 1 ? (
            <Vaxel varden={valdForare.atgarder.map((a) => ({ id: a, etikett: ATGARD_NAMN(a) }))} valt={valdAtgard} onVal={(a) => gaTill({ atgard: a })} />
          ) : (
            <p style={{ ...TYP.meta, color: FARG.text2, margin: 0 }}>Åtgärd: {ATGARD_NAMN(valdAtgard)}</p>
          )}
        </div>
      </Sektion>

      <Sektion titel={`${valdForare.forare} · ${ATGARD_NAMN(valdAtgard)}`}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed", minWidth: RUBRIK_BREDD + kolumner.length * MASKIN_BREDD }}>
            <thead>
              <tr>
                <th scope="col" style={{ position: "sticky", left: 0, background: FARG.bg, width: RUBRIK_BREDD }} aria-label="Nyckeltal" />
                {kolumner.map((k) => (
                  <th key={k.maskin} scope="col" style={{ textAlign: "right", padding: `${AVSTAND.s}px ${AVSTAND.xs}px`, overflowWrap: "anywhere", verticalAlign: "bottom", borderBottom: `1px solid ${FARG.linje}` }}>
                    {/* åren överst och tydligt: de är det som gör att två maskiner inte är fullt jämförbara */}
                    <div style={{ ...TYP.listtitel, ...TNUM, whiteSpace: "nowrap" }}>{kolumnRubrik(k)}</div>
                    <div style={{ ...TYP.meta, color: FARG.text2, fontWeight: 600 }}>{k.maskin}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabell.map((r) => (
                <tr key={r.etikett}>
                  <th scope="row" style={{ ...RAD, display: "table-cell", position: "sticky", left: 0, background: FARG.bg, textAlign: "left", ...TYP.meta, color: FARG.text2, fontWeight: 400, padding: `${AVSTAND.m}px ${AVSTAND.s}px ${AVSTAND.m}px 0`, verticalAlign: "top" }}>
                    {r.etikett}
                    {r.etikett === "Index" && <IndexInfo atgard={valdAtgard} rader={rader} />}
                  </th>
                  {r.celler.map((c, i) => (
                    <td key={i} style={{ textAlign: "right", verticalAlign: "top", padding: `${AVSTAND.m}px ${AVSTAND.xs}px`, borderBottom: `1px solid ${FARG.linje}`, overflowWrap: "anywhere" }}>
                      <div style={c.ord ? { ...TYP.meta, color: FARG.text2 } : { ...TYP.meta, ...TNUM, fontWeight: c.bast ? 700 : 400 }}>{c.text}</div>
                      {c.kalla && <div style={{ ...TYP.micro, textTransform: "none", color: FARG.text2, fontWeight: 400 }}>{c.kalla}</div>}
                      {c.bast && <div style={{ ...TYP.micro, textTransform: "none", color: FARG.text }}>bäst</div>}
                      {c.notis && <div style={{ display: "flex", justifyContent: "flex-end" }}><Notis text={c.notis} /></div>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {olika && <p style={gra}>{TEXT_OLIKA_AR}</p>}
        <p style={gra}>{TEXT_SAMMA_FORARE}</p>
        <p style={gra}>
          Siffrorna gäller objekt där föraren stod för minst 80 % av G15. Maskiner med under {GRANS_G15_H} G15-timmar för föraren visas med "För lite data". Fetstil och ordet "bäst" markerar högst index och högst TU.
          TU jämförs bara mellan maskiner med samma källa ("enligt Ponsse" eller "ur avbrott") och bara om minst två har den.
        </p>
        {saknasFormat && <p style={gra}>Saknas i formatet: rapportformatet för den maskinen redovisar inte uppgiften.</p>}
      </Sektion>
    </>
  );
}
