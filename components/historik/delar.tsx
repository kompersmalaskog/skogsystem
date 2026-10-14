"use client";
// Historikvyn (admin): delade byggstenar. Allt går via lib/design/tokens — inga egna storlekar, färger eller avstånd.
// Färg bär aldrig information ensam: urval, tillförlitlighet och saknad data står alltid med ord.

import type { CSSProperties, ReactNode } from "react";
import { AVSTAND, FARG, KNAPP, RAD, RADIE, TNUM, TRAFFYTA, TYP } from "@/lib/design/tokens";
import { rollFarg } from "@/lib/sparStil";
import { diagramVarde, fmt } from "@/lib/historik/berakna";
import type { MaskinArRad, MaskinTyp } from "@/lib/historik/typer";

export const maskinFarg = (typ: MaskinTyp) => rollFarg(typ === "skördare" ? "skordare" : "skotare");

/** Liten prick + ord. Pricken är bara en markör; texten bär betydelsen. */
export function Notis({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", gap: AVSTAND.s, alignItems: "flex-start", marginTop: AVSTAND.xs }}>
      <span aria-hidden style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.cirkel, background: FARG.orange, flexShrink: 0, marginTop: AVSTAND.xs }} />
      <span style={{ ...TYP.meta, color: FARG.text2 }}>{text}</span>
    </div>
  );
}

export function Sektion({ typ, titel, children }: { typ?: MaskinTyp; titel: ReactNode; children: ReactNode }) {
  return (
    <section style={{ marginTop: AVSTAND.sektion }}>
      <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: AVSTAND.s, ...TYP.micro, color: FARG.text2 }}>
        {typ && <span aria-hidden style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.cirkel, background: maskinFarg(typ) }} />}
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
export function Nyckelrad({ etikett, varde, ord, notis, kalla }: { etikett: string; varde: string; ord: boolean; notis: string | null; kalla?: string | null }) {
  return (
    <div style={{ ...RAD, alignItems: "flex-start", justifyContent: "space-between" }}>
      <div style={{ ...TYP.text, color: FARG.text2 }}>{etikett}</div>
      <div style={{ textAlign: "right", maxWidth: "62%" }}>
        <div style={ord ? { ...TYP.meta, color: FARG.text2 } : { ...TYP.listtitel, ...TNUM }}>{varde}</div>
        {kalla && <div style={{ ...TYP.meta, color: FARG.text2 }}>{kalla}</div>}
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
  const beskr = `${etikett} per år: ` + serie.map((s) => `${s.ar} ${s.varde === null ? (s.forLite ? "för lite data" : "saknas") : fmt(s.varde, referens ? 0 : 1)}`).join(", ");
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
                {s.varde === null ? (s.forLite ? "För lite data" : "saknas") : fmt(s.varde, referens ? 0 : 1)}
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

// ---------------------------------------------------------------------------------------------- linjediagram (jämförelsen)

export type LinjeSerie = { namn: string; punkter: { ar: number; varde: number | null; n: number }[] };

/** Fyra skilda stilar: färg + streck + märke. Färg bär aldrig ensam; linjerna är också märkta med form och står i en teckenförklaring med namn. */
const LINJESTIL = [
  { streck: "", form: "cirkel", glyf: "●", ton: "text" },
  { streck: "", form: "kvadrat", glyf: "■", ton: "typ" },
  { streck: "6 4", form: "triangel", glyf: "▲", ton: "text" },
  { streck: "6 4", form: "romb", glyf: "◆", ton: "typ" },
] as const;

export const linjeGlyf = (i: number) => LINJESTIL[i % LINJESTIL.length].glyf;

function Markor({ form, x, y, fylld, farg }: { form: string; x: number; y: number; fylld: boolean; farg: string }) {
  const r = 4.5;
  const gem = { fill: fylld ? farg : FARG.bg, stroke: farg, strokeWidth: 2 } as const;
  if (form === "kvadrat") return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} {...gem} />;
  if (form === "triangel") return <polygon points={`${x},${y - r - 1} ${x + r + 1},${y + r} ${x - r - 1},${y + r}`} {...gem} />;
  if (form === "romb") return <polygon points={`${x},${y - r - 1} ${x + r + 1},${y} ${x},${y + r + 1} ${x - r - 1},${y}`} {...gem} />;
  return <circle cx={x} cy={y} r={r} {...gem} />;
}

export function Linjediagram({ serier, referens, typ, etikett, decimaler }: { serier: LinjeSerie[]; referens?: number; typ: MaskinTyp; etikett: string; decimaler: number }) {
  const W = 360, H = 240, L = 40, R = 12, T = 16, B = 32;
  const alla = serier.flatMap((s) => s.punkter.filter((p) => p.varde !== null).map((p) => ({ ar: p.ar, v: p.varde as number })));
  if (alla.length === 0) return <p style={{ ...TYP.text, color: FARG.text2 }}>Inga år med värde för de valda maskinerna.</p>;
  const minAr = Math.min(...alla.map((a) => a.ar)), maxAr = Math.max(...alla.map((a) => a.ar));
  const lo = Math.min(...alla.map((a) => a.v), referens ?? Infinity);
  const hi = Math.max(...alla.map((a) => a.v), referens ?? -Infinity);
  const steg = [1, 2, 5, 10, 20, 50].find((st) => (hi - lo) / st <= 5) ?? 100;
  const lagsta = Math.floor(lo / steg) * steg;
  const hogsta = Math.ceil(hi / steg) * steg || steg;
  const x = (ar: number) => L + ((ar - minAr) / (maxAr - minAr || 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lagsta) / (hogsta - lagsta || 1)) * (H - T - B);
  const ticks = Array.from({ length: Math.round((hogsta - lagsta) / steg) + 1 }, (_, i) => lagsta + i * steg);
  const aren = Array.from({ length: maxAr - minAr + 1 }, (_, i) => minAr + i);
  const var2 = aren.length > 8 ? 2 : 1;
  const farg = (i: number) => (LINJESTIL[i % 4].ton === "typ" ? maskinFarg(typ) : FARG.text);
  const beskr = `${etikett} år för år: ` + serier.map((s) => `${s.namn}: ` + s.punkter.map((p) => `${p.ar} ${p.varde === null ? "saknas" : fmt(p.varde, decimaler)}`).join(", ")).join(". ");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={beskr} style={{ display: "block", maxWidth: AVSTAND.xxl * 20 }}>
        <title>{beskr}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={FARG.linje} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize={TYP.micro.fontSize} fill={FARG.text2} style={TNUM}>{fmt(t, 0)}</text>
          </g>
        ))}
        {referens !== undefined && (
          <g>
            <line x1={L} x2={W - R} y1={y(referens)} y2={y(referens)} stroke={FARG.text3} strokeDasharray="3 3" />
            <text x={W - R} y={y(referens) - 4} textAnchor="end" fontSize={TYP.micro.fontSize} fill={FARG.text2}>100 = kurvan</text>
          </g>
        )}
        {aren.filter((_, i) => i % var2 === 0).map((a) => (
          <text key={a} x={x(a)} y={H - B + 18} textAnchor="middle" fontSize={TYP.micro.fontSize} fill={FARG.text2} style={TNUM}>{aren.length > 8 ? `’${String(a).slice(2)}` : a}</text>
        ))}
        {serier.map((s, i) => {
          const st = LINJESTIL[i % 4];
          const pts = s.punkter.filter((p) => p.varde !== null).sort((p, q) => p.ar - q.ar);
          const segment: { ar: number; varde: number | null; n: number }[][] = [];
          for (const p of pts) {
            const sista = segment[segment.length - 1];
            if (sista && sista[sista.length - 1].ar === p.ar - 1) sista.push(p);
            else segment.push([p]);
          }
          return (
            <g key={s.namn}>
              {segment.filter((sg) => sg.length > 1).map((sg, k) => (
                <polyline key={k} points={sg.map((p) => `${x(p.ar)},${y(p.varde as number)}`).join(" ")} fill="none" stroke={farg(i)} strokeWidth={2} strokeDasharray={st.streck || undefined} />
              ))}
              {pts.map((p) => (
                <Markor key={p.ar} form={st.form} x={x(p.ar)} y={y(p.varde as number)} fylld={p.n >= 5} farg={farg(i)} />
              ))}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: `${AVSTAND.s}px ${AVSTAND.l}px`, marginTop: AVSTAND.s }}>
        {serier.map((s, i) => {
          const st = LINJESTIL[i % 4];
          return (
            <span key={s.namn} style={{ display: "inline-flex", alignItems: "center", gap: AVSTAND.s, ...TYP.meta, color: FARG.text }}>
              <svg width="36" height="14" viewBox="0 0 36 14" aria-hidden>
                <line x1="0" x2="36" y1="7" y2="7" stroke={farg(i)} strokeWidth={2} strokeDasharray={st.streck || undefined} />
                <Markor form={st.form} x={18} y={7} fylld farg={farg(i)} />
              </svg>
              {s.namn}
            </span>
          );
        })}
      </div>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 0` }}>Ihåligt märke = färre än 5 objekt det året.</p>
    </div>
  );
}
