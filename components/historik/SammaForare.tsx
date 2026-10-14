"use client";
// Historikvyn (admin), jämförelsen: samma förare på olika maskiner. Skillnaden mellan maskinerna när föraren är densamma är den rättvisaste jämförelsen
// vi har. Välj förare (bara de som har minst två maskiner med minst 200 G15-timmar i en åtgärd) och åtgärd; en kolumn per maskin med minst 200 timmar,
// äldst till vänster. Maskiner under gränsen har ingen kolumn: de står i en hopfälld lista under tabellen. Tabellen får ingen sidscroll på telefon.
// Läser vy_hist_forare_maskin_jamfor. Reglerna (urval, "bäst", olika år) bor i lib/historik/sammaForare och är testade där.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AVSTAND, FARG, KNAPP, RAD, RADIE, TNUM, TRAFFYTA, TYP } from "@/lib/design/tokens";
import { arSpann, ATGARD_ETIKETT, fmt } from "@/lib/historik/berakna";
import { hamtaForareMaskin } from "@/lib/historik/data";
import { felSlag, felText, type HistorikFelSlag } from "@/lib/historik/fel";
import type { IndexAtgard } from "@/lib/historik/indexForklaring";
import {
  delaMaskiner, GRANS_G15_H, kolumnRubrik, maskinerForForare, olikaAr, sammaForareRader, TEXT_OLIKA_AR, TEXT_SAMMA_FORARE, urvalForare, type ForareMaskinRad,
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
// Maskinerna delar bredden lika (ingen radrubrikkolumn). Fyra maskiner ryms på 390 px utan sidscroll; cellerna har luft åt höger.
const CELL_LUFT = (vertikalt: number) => `${vertikalt}px ${AVSTAND.xs}px ${vertikalt}px 0`;

export default function SammaForare({ rader, forare, atgard, gaTill }: Props) {
  const [data, setData] = useState<ForareMaskinRad[] | null>(null);
  const [fel, setFel] = useState<HistorikFelSlag | null>(null);
  /** Listan med de dolda maskinerna (hopfälld från början). */
  const [doldaOppna, setOppnad] = useState(false);

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
  const alla = data && valdForare && valdAtgard ? maskinerForForare(data, valdForare.forare, valdAtgard) : [];
  const { visas: kolumner, dolda } = delaMaskiner(alla);
  const tabell = sammaForareRader(kolumner);
  const nyckel = valdForare && valdAtgard ? `${valdForare.forare}|${valdAtgard}` : null;
  // Byter man förare eller åtgärd (också via adressen) stängs listan: tillbaka till samma val öppnar den inte igen. Hook före de tidiga returerna.
  useEffect(() => { setOppnad(false); }, [nyckel]);

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
        <div>
          <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
            <thead>
              <tr>
                {kolumner.map((k) => (
                  <th key={k.maskin} scope="col" style={{ textAlign: "left", padding: CELL_LUFT(AVSTAND.s), overflowWrap: "anywhere", verticalAlign: "bottom", borderBottom: `1px solid ${FARG.linje}` }}>
                    {/* åren överst och tydligt: de är det som gör att två maskiner inte är fullt jämförbara */}
                    <div style={{ ...(kolumner.length > 3 ? TYP.meta : TYP.listtitel), ...TNUM, fontWeight: 700, whiteSpace: "nowrap" }}>{kolumnRubrik(k)}</div>
                    <div style={{ ...TYP.meta, color: FARG.text2, fontWeight: 600 }}>{k.maskin}</div>
                  </th>
                ))}
              </tr>
            </thead>
            {/* Radens namn står på en egen rad ovanför siffrorna: ingen radrubrikkolumn, så fyra maskiner ryms på 390 px utan sidscroll. */}
            {tabell.map((r) => (
              <tbody key={r.etikett}>
                <tr>
                  <th scope="colgroup" colSpan={kolumner.length} style={{ textAlign: "left", ...TYP.meta, color: FARG.text2, fontWeight: 400, padding: `${AVSTAND.m}px 0 0` }}>
                    {r.etikett}
                    {r.etikett === "Index" && <IndexInfo atgard={valdAtgard} rader={rader} />}
                  </th>
                </tr>
                <tr>
                  {r.celler.map((c, i) => (
                    <td key={i} style={{ textAlign: "left", verticalAlign: "top", padding: CELL_LUFT(AVSTAND.s), borderBottom: `1px solid ${FARG.linje}`, overflowWrap: "anywhere" }}>
                      <div style={c.ord ? { ...TYP.meta, color: FARG.text2 } : { ...TYP.text, ...TNUM, fontWeight: c.bast ? 700 : 400 }}>{c.text}</div>
                      {c.kalla && <div style={{ ...TYP.micro, textTransform: "none", color: FARG.text2, fontWeight: 400 }}>{c.kalla}</div>}
                      {c.bast && <div style={{ ...TYP.micro, textTransform: "none", color: FARG.text }}>bäst</div>}
                      {c.notis && <div style={{ display: "flex" }}><Notis text={c.notis} /></div>}
                    </td>
                  ))}
                </tr>
              </tbody>
            ))}
          </table>
        </div>
        {dolda.length > 0 && (
          <div style={{ marginTop: AVSTAND.s }}>
            <button
              type="button"
              aria-expanded={doldaOppna}
              onClick={() => setOppnad(!doldaOppna)}
              style={{ ...KNAPP.tertiar, width: "auto", justifyContent: "flex-start", textAlign: "left" }}
            >
              {dolda.length} {dolda.length === 1 ? "maskin" : "maskiner"} med under {GRANS_G15_H} h visas inte
            </button>
            {doldaOppna && (
              <div role="list">
                {dolda.map((d) => (
                  <div key={d.maskin} role="listitem" style={{ ...RAD, justifyContent: "space-between", alignItems: "flex-start", gap: AVSTAND.m, borderBottom: `1px solid ${FARG.linje}`, padding: `${AVSTAND.s}px 0` }}>
                    <span style={{ ...TYP.meta, color: FARG.text, minWidth: 0, overflowWrap: "anywhere" }}>{d.maskin}</span>
                    <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2, textAlign: "right", flexShrink: 0 }}>{arSpann(d.ar_fran, d.ar_till)} · {fmt(d.g15_h, 0)} h</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {olika && <p style={gra}>{TEXT_OLIKA_AR}</p>}
        <p style={gra}>{TEXT_SAMMA_FORARE}</p>
        <p style={gra}>
          Siffrorna gäller objekt där föraren stod för minst 80 % av G15. Bara maskiner med minst {GRANS_G15_H} G15-timmar för föraren visas. Fetstil och ordet "bäst" markerar högst index och högst TU.
          TU jämförs bara mellan maskiner med samma källa ("enligt Ponsse" eller "ur avbrott") och bara om minst två har den.
        </p>
        {saknasFormat && <p style={gra}>Saknas i formatet: rapportformatet för den maskinen redovisar inte uppgiften.</p>}
      </Sektion>
    </>
  );
}
