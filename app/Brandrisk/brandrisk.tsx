"use client";

import React, { useState } from "react";

const MCF_COLORS: Record<number, string> = {
  0: "#8E8E93", 1: "#007AFF", 2: "#34C759",
  3: "#FFD60A", 4: "#FF9F0A", 5: "#FF453A", 6: "#AF52DE",
};

const MCF_RGB: Record<number, [number, number, number]> = {
  1: [0,122,255], 2: [52,199,89], 3: [255,214,10],
  4: [255,159,10], 5: [255,69,58], 6: [175,82,222],
};

interface McfText {
  name: string;
  short: string;
  desc: string;
  fwi: string;
}

const MCF_TEXTS: Record<number, McfText> = {
  1: { name: "Mycket liten skogsbrandsrisk", short: "Mycket liten", desc: "I de flesta skogstyper kan inte brand starta eller sprida sig med öppna lågor", fwi: "FWI < 5" },
  2: { name: "Liten skogsbrandsrisk", short: "Liten", desc: "I vissa skogstyper kan det vara svårt för en brand att sprida sig", fwi: "FWI 5–11" },
  3: { name: "Måttlig skogsbrandsrisk", short: "Måttlig", desc: "Vegetationen brinner med olika spridningshastighet beroende på typ och torka", fwi: "FWI 12–16" },
  4: { name: "Stor skogsbrandsrisk", short: "Stor", desc: "Påtaglig risk för brandspridning, brand sprider sig normalt i de flesta vegetationstyper", fwi: "FWI 17–21 · Samråd krävs" },
  5: { name: "Mycket stor skogsbrandsrisk", short: "Mycket stor", desc: "En brand kommer att utveckla sig mycket snabbt och häftigt. Toppbränder kan förekomma", fwi: "FWI 22–27" },
  6: { name: "Extremt stor skogsbrandsrisk", short: "Extrem", desc: "Markens ytskikt extremt torrt. Antändningsrisken mycket stor, brand utvecklas explosivt. Stor risk för toppbrand", fwi: "FWI 28+ · Ofta eldningsförbud" },
};

const OPACITY: Record<number, number> = { 1: 0.25, 2: 0.4, 3: 0.55, 4: 0.7, 5: 0.85, 6: 0.95 };
const R_BOOST: Record<number, number> = { 1: 0, 2: 0, 3: 4, 4: 9, 5: 14, 6: 18 };
const GLOW_BLUR: Record<number, number> = { 1: 0, 2: 0, 3: 2, 4: 5, 5: 9, 6: 14 };
const GLOW_OPACITY: Record<number, number> = { 1: 0, 2: 0, 3: 0.25, 4: 0.45, 5: 0.65, 6: 0.85 };
const BAR_GLOW: Record<number, string> = {
  3: "0 0 6px rgba(255,214,10,0.25)",
  4: "0 0 10px rgba(255,159,10,0.35), 0 0 3px rgba(255,159,10,0.2)",
  5: "0 0 14px rgba(255,69,58,0.4), 0 0 4px rgba(255,69,58,0.25)",
  6: "0 0 18px rgba(175,82,222,0.5), 0 0 5px rgba(175,82,222,0.3)",
};

const HOURLY_IDX: number[] = [1,1,1, 1,1,1, 1,2,2, 2,3,3, 3,4,4, 4,4,3, 3,2,2, 1,1,1];

interface WeekDay {
  day: string;
  idx: number;
  fwi: number;
  peak: number;
  wind: string;
  windLevel: string;
  temp: string;
  hum: string;
  humLevel: string;
  today?: boolean;
  rain?: boolean;
}

const WEEK_DATA: WeekDay[] = [
  { day: "Mån", idx: 4, fwi: 18, peak: 14, wind: "↗ 8 m/s", windLevel: "vdry", temp: "28°", hum: "Torr luft", humLevel: "dry", today: true },
  { day: "Tis", idx: 4, fwi: 20, peak: 14, wind: "↗ 9 m/s", windLevel: "vdry", temp: "27°", hum: "Torr luft", humLevel: "dry" },
  { day: "Ons", idx: 3, fwi: 14, peak: 13, wind: "→ 5 m/s", windLevel: "", temp: "25°", hum: "Torr luft", humLevel: "dry" },
  { day: "Tor", idx: 5, fwi: 23, peak: 15, wind: "↑ 11 m/s", windLevel: "vdry", temp: "30°", hum: "Mycket torr luft", humLevel: "vdry" },
  { day: "Fre", idx: 5, fwi: 25, peak: 14, wind: "↑ 12 m/s", windLevel: "vdry", temp: "31°", hum: "Mycket torr luft", humLevel: "vdry" },
  { day: "Lör", idx: 2, fwi: 8, peak: 12, wind: "↘ 3 m/s", windLevel: "", temp: "18°", hum: "Fuktigt", humLevel: "", rain: true },
  { day: "Sön", idx: 1, fwi: 3, peak: 12, wind: "↓ 2 m/s", windLevel: "", temp: "16°", hum: "Fuktigt", humLevel: "", rain: true },
];

const SAMRAD_STEPS: { title: string; desc: string }[] = [
  { title: "Kontakta arbetsledare/uppdragsgivare", desc: "Innan arbete påbörjas eller fortsätter. Gäller markberedning, avverkning och annan verksamhet som kan orsaka gnistbildning" },
  { title: "Gemensam riskbedömning", desc: "Bedöm lokal terräng, vindförhållanden, markfuktighet och bränsletyp. Prognosen visar generellt läge – lokala förhållanden kan avvika" },
  { title: "Beslut", desc: "Genomföra arbetet, anpassa (t.ex. byta trakt, ändra tider, begränsa verksamhet) eller stoppa helt" },
  { title: "Dokumentera", desc: "Anteckna bedömning och beslut. Arbetsgivaren ansvarar enligt AML 1977:1160" },
  { title: "Säkerställ beredskap", desc: "Släckutrustning ska finnas tillgänglig. Förare ska ha kommunikation och veta utrymningsväg" },
];

interface DocItem {
  title: string;
  sub: string;
  url: string;
}

interface DocGroup {
  group: string;
  items: DocItem[];
}

const DOCS: DocGroup[] = [
  { group: "Riktlinjer", items: [
    { title: "Branschgemensamma riktlinjer – Brand", sub: "Skogforsk (2022) · PDF", url: "https://www.skogforsk.se/cd_20221011125609/contentassets/0fca4a66d7694891b5a1369f75330339/riskhantering-avseende-brand-22-09-05.pdf" },
    { title: "Fördjupande information v2", sub: "Skogforsk · PDF", url: "https://www.skogforsk.se/cd_20220513142539/contentassets/0fca4a66d7694891b5a1369f75330339/riskhantering-avseende-brand--fordjupande-information--version-2-utskriftsformat.pdf" },
  ]},
  { group: "Prognoser och data", items: [
    { title: "MCF Brandriskprognoser", sub: "mcf.se", url: "https://www.mcf.se/brandriskprognoser/" },
    { title: "SMHI Brandrisk skog och mark", sub: "smhi.se", url: "https://www.smhi.se/vader/varningar-och-brandrisk/brandrisk-skog-och-mark" },
  ]},
  { group: "Lagstiftning", items: [
    { title: "Arbetsmiljölagen (AML 1977:1160)", sub: "riksdagen.se", url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/arbetsmiljolag-19771160_sfs-1977-1160/" },
    { title: "Lag om skydd mot olyckor (LSO 2003:778)", sub: "riksdagen.se", url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2003778-om-skydd-mot-olyckor_sfs-2003-778/" },
    { title: "Förordning om skydd mot olyckor (FSO 2003:789)", sub: "riksdagen.se · §7 eldningsförbud", url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/forordning-2003789-om-skydd-mot-olyckor_sfs-2003-789/" },
  ]},
  { group: "Övrig brandsäkerhet", items: [
    { title: "SBF 127:17 – Regler för brandskydd", sub: "Brandskyddsföreningen", url: "#" },
  ]},
];

function p2c(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function FireClock({ hourlyIdx, nowHour }: { hourlyIdx: number[]; nowHour: number }) {
  const CX = 155, CY = 155, R_OUT = 135, R_IN = 92, GAP = 1.2;
  const segments = [];
  const labels = { 0: "00", 3: "03", 6: "06", 9: "09", 12: "12", 15: "15", 18: "18", 21: "21" };

  for (let h = 0; h < 24; h++) {
    const s = h * 15 + GAP / 2, e = (h + 1) * 15 - GAP / 2;
    const idx = hourlyIdx[h];
    const [r, g, b] = MCF_RGB[idx];
    const rOut = R_OUT + R_BOOST[idx];
    const [ox1, oy1] = p2c(CX, CY, rOut, s);
    const [ox2, oy2] = p2c(CX, CY, rOut, e);
    const [ix2, iy2] = p2c(CX, CY, R_IN, e);
    const [ix1, iy1] = p2c(CX, CY, R_IN, s);
    segments.push(
      <path key={h} d={`M${ox1},${oy1} A${rOut},${rOut} 0 0,1 ${ox2},${oy2} L${ix2},${iy2} A${R_IN},${R_IN} 0 0,0 ${ix1},${iy1} Z`}
        fill={`rgba(${r},${g},${b},${OPACITY[idx]})`}
        filter={idx >= 3 ? `url(#glow${idx})` : undefined} />
    );
  }

  const nowIdx = hourlyIdx[nowHour];
  const nowRout = R_OUT + R_BOOST[nowIdx];
  const nowDeg = nowHour * 15;
  const [mx, my] = p2c(CX, CY, nowRout, nowDeg);
  const [tx1, ty1] = p2c(CX, CY, nowRout + 2, nowDeg);
  const [tx2, ty2] = p2c(CX, CY, nowRout + 9, nowDeg);
  const [nx, ny] = p2c(CX, CY, nowRout + 22, nowDeg);

  return (
    <svg viewBox="-15 -15 340 340" style={{ width: "100%", height: "100%" }}>
      <defs>
        {[3,4,5,6].map(lvl => {
          const [r,g,b] = MCF_RGB[lvl];
          return (
            <filter key={lvl} id={`glow${lvl}`} x="-50%" y="-50%" width="200%" height="200%">
              <feFlood floodColor={`rgb(${r},${g},${b})`} floodOpacity={GLOW_OPACITY[lvl]} result="color" />
              <feComposite in="color" in2="SourceGraphic" operator="in" result="colored" />
              <feGaussianBlur in="colored" stdDeviation={GLOW_BLUR[lvl]} result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          );
        })}
      </defs>
      {segments}
      <circle cx={CX} cy={CY} r={R_IN - 5} fill="rgba(0,0,0,0.8)" />
      {Object.entries(labels).map(([h, label]) => {
        const hi = parseInt(h), deg = hi * 15;
        const [x, y] = p2c(CX, CY, R_OUT + 24, deg);
        const isKey = [0,6,12,18].includes(hi);
        return <text key={h} x={x} y={y + 4} textAnchor="middle" fill={isKey ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.25)"}
          fontSize={isKey ? 12 : 10} fontWeight={isKey ? 600 : 400} fontFamily="-apple-system, sans-serif">{label}</text>;
      })}
      {Array.from({ length: 24 }, (_, h) => {
        const deg = h * 15, major = h % 6 === 0;
        const [x1, y1] = p2c(CX, CY, R_IN - 5, deg);
        const [x2, y2] = p2c(CX, CY, R_IN - (major ? 14 : 9), deg);
        return <line key={`t${h}`} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={major ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)"}
          strokeWidth={major ? 1.5 : 0.75} />;
      })}
      <circle cx={mx} cy={my} r={10} fill="rgba(255,255,255,0.08)" />
      <circle cx={mx} cy={my} r={5} fill="#fff" />
      <circle cx={mx} cy={my} r={2} fill="#000" />
      <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke="#fff" strokeWidth={2} strokeLinecap="round" />
      <rect x={nx - 12} y={ny - 7} width={24} height={14} rx={4} fill="rgba(255,255,255,0.12)" />
      <text x={nx} y={ny + 4} textAnchor="middle" fill="#fff" fontSize={9} fontWeight={700} fontFamily="-apple-system, sans-serif">NU</text>
      <circle cx={mx} cy={my} r={5} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={1.5}>
        <animate attributeName="r" from="5" to="14" dur="2s" repeatCount="indefinite" />
        <animate attributeName="stroke-opacity" from="0.5" to="0" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function Collapsible({ title, children, borderTop = true }: { title: string; children: React.ReactNode; borderTop?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: borderTop ? "1px solid rgba(255,255,255,0.04)" : "none", marginTop: borderTop ? 12 : 0 }}>
      <div onClick={() => setOpen(!open)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0 0", cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.35)", fontWeight: 500 }}>
        <span>{title}</span>
        <span style={{ fontSize: 16, color: "rgba(255,255,255,0.2)", transition: "transform 0.2s", transform: open ? "rotate(90deg)" : "none" }}>›</span>
      </div>
      {open && <div style={{ paddingTop: 12 }}>{children}</div>}
    </div>
  );
}

export default function BrandriskView(): React.JSX.Element {
  const [activeDay, setActiveDay] = useState(0);
  const days = ["Idag", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
  const nowHour = 10;
  const barWidths: Record<number, string> = { 1: "17%", 2: "33%", 3: "50%", 4: "67%", 5: "83%", 6: "100%" };
  const wxColor: Record<string, string> = { vdry: "rgba(255,69,58,0.4)", dry: "rgba(255,159,10,0.45)" };

  return (
    <div style={{ background: "#000", color: "#fff", fontFamily: "-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif", maxWidth: 430, margin: "0 auto", minHeight: "100vh", WebkitFontSmoothing: "antialiased" }}>

      {/* LAGER 1: GLANCE */}
      <div style={{ padding: "56px 24px 8px", textAlign: "center" }}>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Brandrisk</div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 24px" }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.6)" }}>📍 Gävle, Gävleborgs län</div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>Uppdaterad 10:15</div>
      </div>

      <div style={{ margin: "8px 16px 0", padding: "12px 16px", borderRadius: 12, display: "flex", alignItems: "center", gap: 10, background: "rgba(255,69,58,0.08)", border: "1px solid rgba(255,69,58,0.2)" }}>
        <div style={{ fontSize: 18, flexShrink: 0 }}>🔥</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: MCF_COLORS[5] }}>Eldningsförbud råder</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>Gävleborgs län · Beslut av räddningstjänsten</div>
        </div>
        <div style={{ color: "rgba(255,255,255,0.12)", fontSize: 16 }}>›</div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 32, padding: "20px 24px 8px" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontWeight: 500, letterSpacing: 0.5, marginBottom: 4 }}>JUST NU KL 10</div>
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -2, lineHeight: 1, color: MCF_COLORS[2] }}>2</div>
          <div style={{ fontSize: 11, marginTop: 6, fontWeight: 600, color: MCF_COLORS[2] }}>Liten brandrisk</div>
          <div style={{ fontSize: 10, marginTop: 2, color: "rgba(255,255,255,0.3)" }}>FWI 8</div>
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.12)", paddingBottom: 14 }}>→</div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontWeight: 500, letterSpacing: 0.5, marginBottom: 4 }}>DAGENS TOPP KL 14</div>
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -2, lineHeight: 1, color: MCF_COLORS[4] }}>4</div>
          <div style={{ fontSize: 11, marginTop: 6, fontWeight: 600, color: MCF_COLORS[4] }}>Stor brandrisk</div>
          <div style={{ fontSize: 10, marginTop: 2, color: "rgba(255,255,255,0.3)" }}>FWI 18</div>
        </div>
      </div>

      {/* LAGER 2: PLANERING */}
      <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 20, margin: "12px 16px 10px", padding: "24px 16px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 16, textAlign: "left", paddingLeft: 4 }}>
          Brandriskklocka – måndag 17 feb
        </div>
        <div style={{ position: "relative", width: 320, height: 320, margin: "0 auto" }}>
          <FireClock hourlyIdx={HOURLY_IDX} nowHour={nowHour} />
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", pointerEvents: "none" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", fontWeight: 500, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 2 }}>Lägre beräknad risk</div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: MCF_COLORS[1] }}>03–09</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 8 }}>Nivå 1 · Mycket liten</div>
            <div style={{ width: 30, height: 1, background: "rgba(255,255,255,0.06)", margin: "6px auto 8px" }} />
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", fontWeight: 500, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 2 }}>Högst beräknad risk</div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: MCF_COLORS[4] }}>13–17</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>Nivå 4 · Stor</div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          {[1,2,3,4,5,6].map(i => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "rgba(255,255,255,0.35)" }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: MCF_COLORS[i], flexShrink: 0 }} />{i}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 16 }}>
          {days.map((d, i) => (
            <button key={d} onClick={() => setActiveDay(i)} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, color: activeDay === i ? "#fff" : "rgba(255,255,255,0.3)", background: activeDay === i ? "rgba(255,255,255,0.08)" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>{d}</button>
          ))}
        </div>

        <div style={{ marginTop: 14, fontSize: 12, color: "rgba(255,255,255,0.2)" }}>Vind 8 m/s + torr luft driver risken kl 13–17</div>
      </div>

      {/* VECKA */}
      <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, margin: "0 16px 10px", padding: "18px 20px" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>Vecka – högsta nivå per dag</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {WEEK_DATA.map((d, i) => (
            <div key={i}>
              <div style={{ display: "flex", alignItems: "center", padding: "12px 0", gap: 12, ...(d.today ? { background: "rgba(255,255,255,0.03)", margin: "0 -20px", padding: "12px 20px", borderRadius: 10 } : {}) }}>
                <div style={{ width: 32, fontSize: 14, fontWeight: 500, color: d.today ? "#fff" : "rgba(255,255,255,0.5)", flexShrink: 0 }}>{d.day}</div>
                <div style={{ flex: 1, height: 28, background: "rgba(255,255,255,0.03)", borderRadius: 8, overflow: "hidden", position: "relative" }}>
                  <div style={{ height: "100%", width: barWidths[d.idx], background: MCF_COLORS[d.idx], borderRadius: 8, display: "flex", alignItems: "center", paddingLeft: 10, gap: 6, boxShadow: BAR_GLOW[d.idx] || "none" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(0,0,0,0.7)" }}>{d.idx}</span>
                    {d.idx > 1 && <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(0,0,0,0.5)" }}>{MCF_TEXTS[d.idx].short}</span>}
                  </div>
                </div>
                <div style={{ width: 70, flexShrink: 0, textAlign: "right", fontSize: 12, color: "rgba(255,255,255,0.3)", fontWeight: 500, lineHeight: 1.3 }}>
                  FWI <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.55)" }}>{d.fwi}</span><br />
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.15)", fontWeight: 400 }}>topp kl {d.peak}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, padding: "2px 0 0 44px", fontSize: 10, color: "rgba(255,255,255,0.18)" }}>
                <span style={{ color: wxColor[d.windLevel] || "inherit" }}>{d.wind}</span>
                <span>{d.temp}</span>
                <span style={{ color: wxColor[d.humLevel] || "inherit" }}>{d.hum}</span>
                {d.rain && <span style={{ color: "rgba(52,199,89,0.45)", background: "rgba(52,199,89,0.06)", padding: "0 4px", borderRadius: 3 }}>Regn</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* LAGER 3: FÖRDJUPNING */}
      <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, margin: "0 16px 10px", padding: "18px 20px" }}>
        <Collapsible title="Vad betyder nivåerna?" borderTop={false}>
          {[1,2,3,4,5,6].map(i => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", alignItems: "flex-start", borderBottom: i < 6 ? "1px solid rgba(255,255,255,0.03)" : "none" }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.7)", flexShrink: 0, marginTop: 1, background: MCF_COLORS[i] }}>{i}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, color: MCF_COLORS[i] }}>{MCF_TEXTS[i].name}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.4 }}>{MCF_TEXTS[i].desc}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", marginTop: 3, fontWeight: 500 }}>{MCF_TEXTS[i].fwi}</div>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.12)", paddingTop: 10, textAlign: "center" }}>Källa: MCF (Brandrisk Ute) · SMHI · Skogforsk</div>
        </Collapsible>

        <Collapsible title="Samrådsrutin vid nivå 4 eller högre">
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "10px 0" }}>
            {SAMRAD_STEPS.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(255,159,10,0.12)", color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                <div style={{ flex: 1, fontSize: 12, lineHeight: 1.5 }}>
                  <strong style={{ color: "rgba(255,255,255,0.5)", display: "block", fontWeight: 600, marginBottom: 1 }}>{s.title}</strong>
                  <span style={{ color: "rgba(255,255,255,0.25)" }}>{s.desc}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.12)", paddingTop: 10, textAlign: "center" }}>Källa: Skogforsk – Branschgemensamma riktlinjer för riskhantering avseende brand (2022)</div>
        </Collapsible>

        <Collapsible title="Källor och dokument">
          <div style={{ padding: "8px 0" }}>
            {DOCS.map((group, gi) => (
              <div key={gi}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "rgba(255,255,255,0.9)", padding: gi === 0 ? "0 0 6px" : "14px 0 6px" }}>{group.group}</div>
                {group.items.map((doc, di) => (
                  <a key={di} href={doc.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", textDecoration: "none", borderBottom: di < group.items.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none", color: "inherit" }}>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>{doc.title}</span>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{doc.sub}</span>
                    </div>
                    <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 16, flexShrink: 0 }}>›</span>
                  </a>
                ))}
              </div>
            ))}
          </div>
        </Collapsible>
      </div>

      <div style={{ margin: "8px 16px 32px", fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.6, textAlign: "center" }}>
        Beslutsstöd. Prognoser: SMHI. Brandbeteende: MCF. Riktlinjer: Skogforsk (2022). Bedöm alltid lokalt. Arbetsgivaren ansvarar (AML 1977:1160).
      </div>
    </div>
  );
}
