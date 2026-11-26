import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import type { LoneunderlagBerikad, LoneunderlagDag } from "./loneunderlag";
import { loneartInfo, loneartEnhetText, fmtMangd } from "./loneart";
import { attTittaPa, minText, timMin, kmUppdelning, datumLang } from "./forarText";
import { brandriskUtanRad } from "./brandriskRader";
import { besokNamn } from "@/lib/besok/namn";
import { isoVecka } from "@/lib/vilobrott";

/**
 * Förarens tidsspecifikation som A4-PDF (Martin 2026-11-25: "så lätt att ett barn förstår den direkt").
 *
 * Svaret först: månaden, timmarna stort och EN mening om läget ("En dag väntar på att du bekräftar den").
 * Sedan lönen rad för rad med en förklaring i ord under varje rad, och dagarna per vecka i fyra kolumner
 * (Dag · Tid · Arbetat · Var) med rast och km i en grå rad under dagen. Lönekoder och decimaler — det
 * lönekontoret stämmer av mot Fortnox — står bara i en grå rad längst ner. Inga kronor.
 *
 * SAMMA beräkning som skärmen och exporten (beraknaLoneunderlag): den här filen räknar ingenting om, den
 * ritar bara. "Arbetat" = maskintid + extra tid per dag, samma tal som tabellens summa.
 *
 * pdf-lib:s standardfonter kodar WinAnsi: åäö, "–" och "·" går, men inte pilar, prickar eller emoji.
 * Den orange pricken ritas därför som en cirkel.
 */

const MANADER = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
const DAGAR = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];

/** En förklaring i vardagsord per löneart. Saknas den står bara namnet. */
export const LONEART_ORD: Record<string, { namn?: string; text: string }> = {
  timlon: { text: "Dina vanliga arbetstimmar." },
  premielon_skordare: { namn: "Premie", text: "Rörlig ersättning, räknad på samma timmar." },
  premielon_skotare: { namn: "Premie", text: "Rörlig ersättning, räknad på samma timmar." },
  overtid_skordare: { namn: "Övertid", text: "Timmar utöver månadens vanliga tid." },
  overtid_skotare: { namn: "Övertid", text: "Timmar utöver månadens vanliga tid." },
  valtlappar: { text: "Veckor du har arbetat." },
  korersattning: { namn: "Bilersättning", text: "Mil du kört över gränsen per dag." },
  helglon_skordare: { namn: "Helglön", text: "Röda dagar som betalas." },
  helglon_skotare: { namn: "Helglön", text: "Röda dagar som betalas." },
  brandrisk_ob: { text: "Beordrade timmar tidigt på morgonen vid brandrisk." },
  sjuktimmar: { namn: "Sjuk", text: "Timmar du var sjuk." },
};

/** Svensk tid för "Skapad …"-raden (servern går i UTC). */
function svenskTid(d: Date): string {
  return d.toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(".", "");
}

const t5 = (t: string | null) => (t || "").slice(0, 5);
const dagDatum = (iso: string) => new Date(`${iso}T12:00:00`);

/** "Mån 2" */
export function dagKort(iso: string): string {
  const d = dagDatum(iso);
  return `${DAGAR[d.getDay()]} ${d.getDate()}`;
}

/** Objekten utan Vidas koder och år ("Gallring Santhe 2026." → "Santhe"), samma namn står bara en gång. */
export function platsText(objekt: string[]): string {
  const namn = [...new Set(objekt.map(o => besokNamn(o, null, null)).filter(Boolean))];
  return namn.join(", ");
}

/** Raden under dagen: rast, km, ersatta mil och det som är speciellt med dagen. Tom = ingen rad. */
export function dagUnderrad(d: LoneunderlagDag): string {
  const delar: string[] = [];
  if (!d.bekraftad) delar.push("inte bekräftad");
  if (d.extra_min > 0) delar.push(`varav ${minText(d.extra_min)} utanför maskinen`);
  if (d.rast_min) delar.push(`rast ${minText(d.rast_min)}`);
  if (d.km_totalt) delar.push(`${Math.round(d.km_totalt)} km`);
  if (d.ersattningsmil) delar.push(`${d.ersattningsmil} mil ersätts`);
  if (d.brandrisk_beordrad === true) delar.push("brandrisk-OB");
  if (d.dagtyp && d.dagtyp !== "normal") delar.push(d.dagtyp);
  return delar.join(" · ");
}

/** Meningen överst: vad som väntar på föraren, eller att allt är klart. */
export function lageMening(m: LoneunderlagBerikad): { text: string; vantar: boolean } {
  const obekr = m.dagar.filter(d => !d.bekraftad).map(d => d.datum).sort();
  if (obekr.length === 1) return { text: `En dag väntar på att du bekräftar den: ${dagKort(obekr[0]).toLowerCase()} ${MANADER[dagDatum(obekr[0]).getMonth()].slice(0, 3)}.`, vantar: true };
  if (obekr.length > 1) return { text: `${obekr.length} dagar väntar på att du bekräftar dem. De står i orange nedan.`, vantar: true };
  if (m.obekraftade > 0) return { text: `${m.obekraftade === 1 ? "En dag väntar" : `${m.obekraftade} dagar väntar`} på att du bekräftar ${m.obekraftade === 1 ? "den" : "dem"} i Kalender.`, vantar: true };
  return { text: "Alla dagar är bekräftade.", vantar: false };
}

export type Vecka = { vecka: number; dagar: LoneunderlagDag[]; min: number };

/** Dagarna per ISO-vecka i datumordning, med veckans arbetade minuter (maskin + extra). */
export function perVecka(dagar: LoneunderlagDag[]): Vecka[] {
  const ut: Vecka[] = [];
  for (const d of [...dagar].sort((a, b) => a.datum.localeCompare(b.datum))) {
    const v = isoVecka(dagDatum(d.datum)).vecka;
    let sista = ut[ut.length - 1];
    if (!sista || sista.vecka !== v) { sista = { vecka: v, dagar: [], min: 0 }; ut.push(sista); }
    sista.dagar.push(d);
    sista.min += (d.arbetad_min || 0) + (d.extra_min || 0);
  }
  return ut;
}

function radbryt(s: string, maxW: number, size: number, f: PDFFont): string[] {
  const rader: string[] = [];
  let rad = "";
  for (const o of s.split(/\s+/)) {
    const test = rad ? `${rad} ${o}` : o;
    if (f.widthOfTextAtSize(test, size) <= maxW || !rad) rad = test;
    else { rader.push(rad); rad = o; }
  }
  if (rad) rader.push(rad);
  return rader;
}

export async function ritaTidsspec(arbetsmanad: string, m: LoneunderlagBerikad | null, nu = new Date()): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [å, mm] = arbetsmanad.split("-").map(Number);
  const manad = MANADER[mm - 1];
  const lonManad = MANADER[mm % 12];
  doc.setTitle(`Tidsspecifikation ${manad} ${å}`);

  const W = 595.28, H = 841.89, ML = 52, MR = 52, MT = 60, MB = 56;
  const HOGER = W - MR;
  const svart = rgb(0.08, 0.08, 0.08), gra = rgb(0.47, 0.47, 0.47), ljus = rgb(0.62, 0.62, 0.62);
  const linje = rgb(0.86, 0.86, 0.86), orange = rgb(0.72, 0.42, 0.05), prick = rgb(0.88, 0.53, 0.1);

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - MT;
  const nySida = () => { page = doc.addPage([W, H]); y = H - MT; };
  const plats = (px: number) => { if (y - px < MB) { nySida(); return true; } return false; };
  const bredd = (s: string, size: number, f: PDFFont = font) => f.widthOfTextAtSize(s, size);
  const text = (s: string, x: number, size: number, f: PDFFont = font, c: RGB = svart) => page.drawText(s, { x, y, size, font: f, color: c });
  const hoger = (s: string, xR: number, size: number, f: PDFFont = font, c: RGB = svart) => text(s, xR - bredd(s, size, f), size, f, c);
  const streck = (tjock = 0.5, c: RGB = linje) => page.drawLine({ start: { x: ML, y }, end: { x: HOGER, y }, thickness: tjock, color: c });
  const klipp = (s: string, maxW: number, size: number, f: PDFFont = font) => {
    if (bredd(s, size, f) <= maxW) return s;
    let t = s;
    while (t.length > 1 && bredd(t + "…", size, f) > maxW) t = t.slice(0, -1);
    return t.replace(/[\s,]+$/, "") + "…";
  };
  const etikett = (s: string) => { plats(40); y -= 26; text(s.toUpperCase(), ML, 8.5, bold, gra); y -= 8; streck(); };

  // ── Sidhuvud ──
  y -= 6;
  text(`${manad[0].toUpperCase()}${manad.slice(1)} ${å}`, ML, 24, bold);
  hoger(m?.namn ?? "", HOGER, 10.5, font, gra);
  y -= 18;
  text(m?.foretagsledare ? "Din tid" : `Din tid · lönen kommer i ${lonManad}`, ML, 10.5, font, gra);

  if (!m) {
    y -= 40; text("Inga arbetsdagar registrerade den här månaden.", ML, 12, font, gra);
    return doc.save();
  }

  // ── Svaret: timmarna och läget ──
  const totalMin = m.dagar.reduce((s, d) => s + (d.arbetad_min || 0) + (d.extra_min || 0), 0);
  y -= 46;
  text(minText(totalMin), ML, 30, bold);
  y -= 20;
  text(`Så mycket har du arbetat i ${manad}.`, ML, 11.5);
  const lage = lageMening(m);
  y -= 22;
  if (lage.vantar) {
    page.drawCircle({ x: ML + 3.5, y: y + 3.6, size: 3.5, color: prick });
    for (const [i, r] of radbryt(lage.text, HOGER - ML - 14, 11, font).entries()) { if (i) y -= 15; text(r, ML + 14, 11, font, orange); }
  } else {
    text(lage.text, ML, 11, font, gra);
  }
  // Övriga saker att titta på (kortpass, deldagar, hemskickad, brandrisk-frågor …) — samma förarord som skärmen.
  const poster = [...(m.ob.obesvarade > 0 ? [{ rubrik: `${m.ob.obesvarade === 1 ? "En tidig morgon" : `${m.ob.obesvarade} tidiga morgnar`}`, text: "Var det beordrat för brandrisk? Svara i appen." }] : []), ...attTittaPa(m)];
  for (const p of poster) {
    const rader = radbryt(`${p.rubrik}: ${p.text}`, HOGER - ML - 14, 10, font);
    plats(16 * rader.length + 6);
    y -= 18;
    page.drawCircle({ x: ML + 3.5, y: y + 3.3, size: 3, color: prick });
    for (const [i, r] of rader.entries()) { if (i) y -= 13.5; text(r, ML + 14, 10, font, orange); }
  }

  // ── Det här går till lönen ──
  if (!m.foretagsledare) {
    etikett("Det här går till lönen");
    const lonRad = (namn: string, varde: string, forklaring: string | null, gratt = false) => {
      const rader = forklaring ? radbryt(forklaring, HOGER - ML, 9.5, font) : [];
      plats(22 + rader.length * 13);
      y -= 17;
      text(namn, ML, 11);
      hoger(varde, HOGER, 11, gratt ? font : bold, gratt ? gra : svart);
      for (const r of rader) { y -= 13; text(r, ML, 9.5, font, gra); }
      y -= 9;
      streck(0.4, rgb(0.92, 0.92, 0.92));
    };
    for (const r of m.rader) {
      const info = loneartInfo(r.loneart);
      const ord = LONEART_ORD[r.loneart];
      const varde = info?.enhet === "tim" ? timMin(Number(r.Number)) : `${fmtMangd(r.Number)} ${loneartEnhetText(r.loneart, r.Number)}`;
      lonRad(ord?.namn ?? info?.label ?? `Löneart ${r.SalaryCode}`, varde, ord?.text ?? null);
    }
    for (const b of brandriskUtanRad(m).filter(b => b.timmar > 0)) lonRad(b.label, timMin(b.timmar), "Lönearten är inte inställd än. Säg till Martin.");
    const km = kmUppdelning(m.dagar, m.km_grans);
    if (!m.rader.some(r => r.loneart === "korersattning") && km.totalKm > 0) {
      lonRad("Bilersättning", "ingen", `Du körde aldrig mer än ${m.km_grans} km på en dag. Sammanlagt ${km.totalKm.toLocaleString("sv-SE")} km.`, true);
    }
    if (m.rader.length === 0) lonRad("Inga lönerader", "", null, true);
  }

  // ── Dag för dag ──
  etikett("Dag för dag");
  const kol = { dag: ML, tid: ML + 56, arb: ML + 230, var: ML + 252 };
  const huvud = () => { y -= 15; for (const [s, x] of [["Dag", kol.dag], ["Tid", kol.tid], ["Var", kol.var]] as const) text(s, x, 8.5, bold, gra); hoger("Arbetat", kol.arb, 8.5, bold, gra); };
  huvud();
  for (const v of perVecka(m.dagar)) {
    if (plats(44)) huvud();
    y -= 22;
    text(`Vecka ${v.vecka}`, ML, 10.5, bold);
    hoger(minText(v.min), HOGER, 10.5, bold);
    y -= 6; streck();
    for (const d of v.dagar) {
      const under = dagUnderrad(d);
      if (plats(under ? 30 : 18)) huvud();
      y -= 15;
      const c = d.bekraftad ? svart : orange;
      text(dagKort(d.datum), kol.dag, 10, font, c);
      const tid = d.start_tid && d.slut_tid ? `${t5(d.start_tid)}–${t5(d.slut_tid)}` : "";
      if (tid) text(tid, kol.tid, 10, font, c);
      hoger(minText((d.arbetad_min || 0) + (d.extra_min || 0)), kol.arb, 10, font, c);
      text(klipp(platsText(d.objekt) || "–", HOGER - kol.var, 10), kol.var, 10, font, c);
      if (under) { y -= 12; text(klipp(under, HOGER - kol.tid, 8.5), kol.tid, 8.5, font, d.bekraftad ? ljus : orange); }
    }
  }
  plats(30);
  y -= 12; streck(0.8, gra);
  y -= 17;
  text(`Hela ${manad}`, ML, 11, bold);
  hoger(minText(totalMin), HOGER, 11, bold);

  // ── För lönekontoret ──
  const koder = m.foretagsledare ? [] : m.rader.map(r => `${LONEART_ORD[r.loneart]?.namn ?? loneartInfo(r.loneart)?.label ?? "Löneart"} ${r.SalaryCode}: ${fmtMangd(r.Number)} ${loneartEnhetText(r.loneart, r.Number)}`);
  const fot = [
    ...(koder.length ? radbryt(`För lönen (Fortnox): ${koder.join("  ·  ")}`, HOGER - ML, 8, font) : []),
    `Skapad ${svenskTid(nu)} ur samma uträkning som lönen.`,
  ];
  plats(16 + fot.length * 11);
  y -= 30;
  for (const r of fot) { text(r, ML, 8, font, ljus); y -= 11; }

  // Sidnummer när det blir fler sidor.
  const sidor = doc.getPages();
  if (sidor.length > 1) sidor.forEach((p, i) => { const s = `${i + 1} av ${sidor.length}`; p.drawText(s, { x: HOGER - bredd(s, 8), y: MB - 24, size: 8, font, color: ljus }); });

  return doc.save();
}

export { datumLang };
