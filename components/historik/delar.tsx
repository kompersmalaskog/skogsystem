"use client";
// Historikvyn (admin): delade byggstenar. Allt går via lib/design/tokens — inga egna storlekar, färger eller avstånd.
// Färg bär aldrig information ensam: urval, tillförlitlighet och saknad data står alltid med ord.

import type { CSSProperties, ReactNode } from "react";
import { AVSTAND, FARG, KNAPP, RAD, RADIE, TNUM, TRAFFYTA, TYP } from "@/lib/design/tokens";
import { diagramVarde, fmt } from "@/lib/historik/berakna";
import type { MaskinArRad, MaskinTyp } from "@/lib/historik/typer";

export const maskinFarg = (typ: MaskinTyp) => (typ === "skördare" ? FARG.skordare : FARG.skotare);

/** Liten prick + ord. Pricken är bara en markör; texten bär betydelsen. */
export function Notis({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", gap: AVSTAND.s, alignItems: "flex-start", marginTop: AVSTAND.xs }}>
      <span aria-hidden style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: "50%", background: FARG.orange, flexShrink: 0, marginTop: AVSTAND.xs }} />
      <span style={{ ...TYP.meta, color: FARG.text2 }}>{text}</span>
    </div>
  );
}

export function Sektion({ typ, titel, children }: { typ?: MaskinTyp; titel: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: AVSTAND.sektion }}>
      <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: AVSTAND.s, ...TYP.micro, color: FARG.text2 }}>
        {typ && <span aria-hidden style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: "50%", background: maskinFarg(typ) }} />}
        {titel}
      </h2>
      <div style={{ marginTop: AVSTAND.s }}>{children}</div>
    </section>
  );
}

export function Tillbaka({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ ...KNAPP.lank, marginTop: AVSTAND.s }}>
      ‹ {text}
    </button>
  );
}

/** Växel: valt läge syns på bakgrund + vikt (aldrig bara färg), och aria-pressed. */
export function Vaxel<T extends string>({ varden, valt, onVal }: { varden: { id: T; etikett: string }[]; valt: T; onVal: (id: T) => void }) {
  return (
    <div role="group" style={{ display: "flex", gap: AVSTAND.xs, background: FARG.kort, borderRadius: RADIE.knapp, padding: AVSTAND.xs }}>
      {varden.map((v) => {
        const on = v.id === valt;
        const stil: CSSProperties = {
          flex: 1,
          minHeight: TRAFFYTA.min,
          border: "none",
          borderRadius: RADIE.rad,
          background: on ? FARG.upphojt : "transparent",
          color: on ? FARG.text : FARG.text2,
          cursor: "pointer",
          fontFamily: "inherit",
          padding: `0 ${AVSTAND.s}px`,
          ...(on ? TYP.listtitel : { ...TYP.text }),
          fontSize: TYP.meta.fontSize,
        };
        return (
          <button key={v.id} type="button" aria-pressed={on} onClick={() => onVal(v.id)} style={stil}>
            {v.etikett}
          </button>
        );
      })}
    </div>
  );
}

/** En tryckbar listrad: namn + meta till vänster, en siffra till höger. */
export function Listrad({
  namn, meta, siffra, enhet, notiser, onClick, vald,
}: { namn: string; meta?: string; siffra?: string | null; enhet?: string; notiser?: string[]; onClick?: () => void; vald?: boolean }) {
  const innehall = (
    <>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYP.listtitel }}>{namn}</div>
        {meta && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs, whiteSpace: "pre-line" }}>{meta}</div>}
        {(notiser ?? []).map((n) => (
          <Notis key={n} text={n} />
        ))}
      </div>
      {siffra !== undefined && (
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ ...TYP.rubrik, ...TNUM }}>{siffra ?? "–"}</div>
          {enhet && <div style={{ ...TYP.meta, color: FARG.text2 }}>{enhet}</div>}
        </div>
      )}
    </>
  );
  const stil: CSSProperties = {
    ...RAD,
    width: "100%",
    textAlign: "left",
    background: vald ? FARG.kort : "none",
    border: "none",
    borderBottom: `1px solid ${FARG.linje}`,
    color: FARG.text,
    fontFamily: "inherit",
    cursor: onClick ? "pointer" : "default",
    padding: `${AVSTAND.m}px ${AVSTAND.s}px`,
    alignItems: "flex-start",
    boxSizing: "border-box",
  };
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={vald === undefined ? undefined : vald} style={stil}>
      {innehall}
    </button>
  ) : (
    <div style={stil}>{innehall}</div>
  );
}

/** Nyckeltalsrad: etikett till vänster, värde till höger. Saknad data är ord och får normal textvikt (inte siffrans). */
export function Nyckelrad({ etikett, varde, ord, notis }: { etikett: string; varde: string; ord: boolean; notis: string | null }) {
  return (
    <div style={{ ...RAD, alignItems: "flex-start", justifyContent: "space-between" }}>
      <div style={{ ...TYP.text, color: FARG.text2 }}>{etikett}</div>
      <div style={{ textAlign: "right", maxWidth: "62%" }}>
        <div style={ord ? { ...TYP.meta, color: FARG.text2 } : { ...TYP.listtitel, ...TNUM }}>{varde}</div>
        {notis && <Notis text={notis} />}
      </div>
    </div>
  );
}

const DIAGRAM_HOJD = AVSTAND.xxl * 4;

/**
 * Stapeldiagram år för år. Varje stapel är en knapp (44 pt) som väljer året. Värdet står som siffra ovanför staplen.
 * Stapel på färre än 5 objekt: dämpad OCH texten "n=3" under året. Saknat värde: ordet "saknas".
 */
export function Diagram({
  rader, valdAr, onVal, farg, referens, etikett,
}: { rader: MaskinArRad[]; valdAr: number | null; onVal: (ar: number | null) => void; farg: string; referens?: number; etikett: string }) {
  const serie = rader.filter((r) => r.ar !== null).map((r) => ({ ar: r.ar as number, ...diagramVarde(r) }));
  if (serie.length === 0) return null;
  const maxV = Math.max(referens ?? 0, ...serie.map((s) => s.varde ?? 0)) * 1.1 || 1;
  const smal = serie.length > 9;
  const beskr = `${etikett} per år: ` + serie.map((s) => `${s.ar} ${s.varde === null ? "saknas" : fmt(s.varde, referens ? 0 : 1)}`).join(", ");
  return (
    <div role="group" aria-label={beskr} style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: AVSTAND.xs, alignItems: "flex-end" }}>
        {serie.map((s) => {
          const vald = valdAr === s.ar;
          const h = s.varde === null ? 0 : Math.max(AVSTAND.xs, (s.varde / maxV) * DIAGRAM_HOJD);
          return (
            <button
              key={s.ar}
              type="button"
              aria-pressed={vald}
              onClick={() => onVal(vald ? null : s.ar)}
              style={{
                flex: 1, minWidth: 0, minHeight: TRAFFYTA.min, border: "none", background: vald ? FARG.kort : "none", borderRadius: RADIE.rad,
                color: FARG.text, fontFamily: "inherit", cursor: "pointer", padding: `${AVSTAND.xs}px 0`, display: "flex", flexDirection: "column", alignItems: "center", gap: AVSTAND.xs,
              }}
            >
              <span style={{ ...TYP.meta, ...TNUM, color: s.varde === null ? FARG.text2 : FARG.text }}>
                {s.varde === null ? "saknas" : fmt(s.varde, referens ? 0 : 1)}
              </span>
              <span style={{ height: DIAGRAM_HOJD, width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", position: "relative" }}>
                <span style={{ width: "70%", height: h, background: farg, borderRadius: RADIE.rad / 2, opacity: s.n < 5 ? 0.45 : 1 }} />
              </span>
              <span style={{ ...TYP.micro, ...TNUM, textTransform: "none", fontWeight: vald ? 700 : 600, color: vald ? FARG.text : FARG.text2 }}>
                {smal ? `’${String(s.ar).slice(2)}` : s.ar}
              </span>
              <span style={{ ...TYP.micro, textTransform: "none", color: FARG.text2, minHeight: TYP.micro.fontSize }}>{s.n < 5 ? `n=${s.n}` : ""}</span>
            </button>
          );
        })}
      </div>
      {referens !== undefined && (
        <div aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: `calc(${AVSTAND.xs}px + ${TYP.micro.fontSize * 2 + AVSTAND.xs * 3}px + ${(referens / maxV) * DIAGRAM_HOJD}px)`, borderTop: `1px dashed ${FARG.text3}`, pointerEvents: "none" }}>
          <span style={{ ...TYP.micro, textTransform: "none", color: FARG.text3, position: "absolute", right: 0, top: -TYP.micro.fontSize - AVSTAND.xs }}>{referens}</span>
        </div>
      )}
    </div>
  );
}
