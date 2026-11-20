/**
 * Förarens ord för lönespecens avvikelser.
 *
 * Lönemotorn (loneberakning) skriver `varningar` för GRANSKAREN: paragrafer,
 * "×8 i övertidsbasen", ANTAGANDE. De står kvar där — admin och exporten
 * behöver dem. Föraren får samma fakta ur de STRUKTURERADE fälten (kortpass,
 * deldagar, franvaro, helglon, byten …) i tre delar: datum, vad det gäller,
 * vad man kan göra. (Martin 2026-09-29: "anteckningar till koden".)
 *
 * Varningar som inte har ett förarord här visas ordagrant (okandaVarningar) —
 * en ny varning i motorn får aldrig försvinna tyst ur förarens vy.
 */

import { FRANVARO_TYP_RUBRIK, arFranvaroTyp, hemskickadMinuter, fmtTimMin } from "@/lib/franvaro";
import { ARBETSDAG_MIN_MINUTER, RAST_FRAGA_MIN, passOrimlighet } from "@/lib/arbetsdagRegler";
import { arTidigVardag } from "@/lib/ob";
import { loneartInfo } from "./loneart";

const MANAD = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];

const dt = (iso: string) => new Date(`${iso}T12:00:00`);

/** "2026-09-17" → "17 september" */
export function datumLang(iso: string): string {
  const d = dt(iso);
  return `${d.getDate()} ${MANAD[d.getMonth()]}`;
}

/** Datumlista → "3–5 och 9 september". Sammanhängande dagar blir spann. */
export function datumSpann(datum: string[]): string {
  const s = Array.from(new Set(datum)).sort();
  if (s.length === 0) return "";
  const runs: string[][] = [];
  for (const iso of s) {
    const sista = runs[runs.length - 1];
    const prev = sista?.[sista.length - 1];
    if (prev && (dt(iso).getTime() - dt(prev).getTime()) === 86400_000 && dt(iso).getMonth() === dt(prev).getMonth()) sista.push(iso);
    else runs.push([iso]);
  }
  const delar = runs.map(r => r.length === 1 ? `${dt(r[0]).getDate()}` : `${dt(r[0]).getDate()}–${dt(r[r.length - 1]).getDate()}`);
  const text = delar.length === 1 ? delar[0] : `${delar.slice(0, -1).join(", ")} och ${delar[delar.length - 1]}`;
  // Alla datum i en arbetsmånad ligger i samma månad; annars står månaden per del.
  const manader = new Set(s.map(x => dt(x).getMonth()));
  if (manader.size > 1) return runs.map(r => r.length === 1 ? datumLang(r[0]) : `${dt(r[0]).getDate()}–${datumLang(r[r.length - 1])}`).join(", ");
  return `${text} ${MANAD[dt(s[0]).getMonth()]}`;
}

/** Frånvarotypens ord i löptext: "sjuk", "VAB", "föräldraledig". */
export function franvaroOrd(typ: string): string {
  const t = (typ || "").toLowerCase();
  if (t === "vab" || t === "atk") return t.toUpperCase();
  if (t === "sjuk") return "sjuk";
  if (arFranvaroTyp(t)) return FRANVARO_TYP_RUBRIK[t].toLowerCase();
  return t || "ledig";
}

const hm = (t: string | null | undefined) => (t ? String(t).slice(0, 5) : "");

/** Deldag: "jobbade till 12:03, sedan sjuk" — både vad som hände och när. */
export function deldagText(dd: { typ: string; fran_tid: string | null; till_tid: string | null }): string {
  const ord = franvaroOrd(dd.typ);
  if (dd.fran_tid) return `jobbade till ${hm(dd.fran_tid)}, sedan ${ord}`;
  if (dd.till_tid) return `${ord} till ${hm(dd.till_tid)}, sedan jobb`;
  return `${ord} en del av dagen`;
}

/** Hemskickad: "hemskickad 2:00 – betalas" — dagen fylls upp till 8 tim. Tomt när dagen redan hade 8 tim (inget att fylla upp). */
export function hemskickadText(arbetadMin: number): string | null {
  const min = hemskickadMinuter(arbetadMin);
  return min > 0 ? `hemskickad ${fmtTimMin(min)} – betalas` : null;
}

/** "1 min", "1 tim 38 min" */
export function minText(min: number): string {
  const m = Math.round(min || 0);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} tim ${r} min` : `${h} tim`;
}

/** Timmar i timmar och minuter: 8.87 → "8 tim 52 min", 128.17 → "128 tim 10 min".
 *  All tid i förarens spec skrivs så (Martin 2026-09-29) — decimaler bara där
 *  talet går till Fortnox, och då BREDVID, så man kan stämma av. */
export function timMin(h: number): string {
  return minText(Math.round((Number(h) || 0) * 60));
}

/** Km-uppdelningen för reseersättningen: körda km totalt och hur mycket som
 *  ligger över fri pendling per dag. "1 084 km" och "1 mil" ser annars ut som
 *  ett fel fast båda stämmer — ersättningen räknas per dag, inte på summan. */
export function kmUppdelning(dagar: { km_totalt?: number | null; ersattningsmil?: number | null }[], grans: number) {
  let totalKm = 0, overKm = 0, dagarOver = 0, mil = 0;
  for (const d of dagar || []) {
    const km = Number(d.km_totalt || 0);
    totalKm += km;
    const over = Math.max(0, km - grans);
    if (over > 0) { overKm += over; dagarOver++; }
    mil += Number(d.ersattningsmil || 0);
  }
  return { totalKm: Math.round(totalKm), overKm: Math.round(overKm), dagarOver, mil };
}

const EJ_BESTAMD ="Går inte till lönen än — lönearten är inte bestämd.";

export type TittaPost = {
  nyckel: string;
  /** Sorteringsnyckel: datum eller "" (odaterat först). */
  datum: string;
  /** Vänster: datumet i ord, eller vad det gäller om det saknar datum. */
  rubrik: string;
  /** Höger, kort: "1 min", "jobbade till 12:03, sedan sjuk". */
  hoger?: string;
  /** Vad det gäller och vad man kan göra. En eller två meningar. */
  text: string;
};

// Motorns varningar som ersätts av en post nedan (eller medvetet inte visas
// för föraren). Prefix, inte hela texter — datum och tal varierar.
const ERSATTA = [
  /^Kortpass /, /^Deldag /, /^Frånvaro /, /^Helglön /, /^Bytesdag/,
  /ej bekräftade/, /saknar typ/, /^Anställningsnummer saknas/, /^Ingen premielön/,
  // Helglön: "Ingen helglön skickas" får en egen post nedan; "Anställningsdatum saknas" är adminens sak (kvalifikationstiden), inte förarens.
  /^Ingen helglön skickas/, /^Anställningsdatum saknas/,
  // Löneart utan kod: adminens text (den pekar på Lön → Lönearter). Föraren får en egen post nedan, eller ingen (frivillig premie).
  /^Löneart saknas/, /skickas inte: ingen kod är kopplad/,
  // Extra tid på dagar utan maskinpass: en granskningsnotis (räknas som arbetad tid mot månadens ordinarie).
  // Perioddagar (Joacim) har alltid det — för föraren är det ingen avvikelse.
  /extra tid ligger på dagar utan maskinpass/,
];

export function okandaVarningar(varningar: string[] | null | undefined): string[] {
  return (varningar || []).filter(v => !ERSATTA.some(re => re.test(v)));
}

/**
 * "Att titta på" — allt utom de interaktiva raderna (obekräftade dagar och
 * brandriskfrågan, som har egna knappar i vyn). Sorterat på datum.
 */
export function attTittaPa(spec: any): TittaPost[] {
  const ut: TittaPost[] = [];
  const varn: string[] = spec?.varningar || [];

  if (varn.some(v => /^Anställningsnummer saknas/.test(v))) {
    ut.push({ nyckel: "anstnr", datum: "", rubrik: "Anställningsnummer", text: "Ditt anställningsnummer saknas i registret, så lönen kan inte skickas. Säg till Martin." });
  }
  if (varn.some(v => /^Ingen premielön/.test(v))) {
    ut.push({ nyckel: "premie", datum: "", rubrik: "Premielön", hoger: "saknas", text: "Du har ingen maskintid den här månaden och ingen maskin på din rad i registret, så premien kan inte räknas. Säg till Martin." });
  }
  for (const mid of (spec?.maskin_utan_typ || []) as string[]) {
    ut.push({ nyckel: `typ${mid}`, datum: "", rubrik: `Maskin ${mid}`, text: "Maskinen saknar typ i registret, så premielönen räknas inte. Säg till Martin." });
  }
  for (const k of (spec?.kortpass || []) as { datum: string; minuter: number }[]) {
    ut.push({
      nyckel: `kp${k.datum}`, datum: k.datum, rubrik: datumLang(k.datum), hoger: minText(k.minuter),
      // Föraren kan INTE ta bort en maskindag (MOM-synken äger den, RLS släpper
      // bara tomma skalrader) — därför "säg till Martin", inte "ta bort dagen".
      text: `För kort för att räknas som arbetsdag. Ser det ut som en felinloggning — säg till Martin, så tar han bort dagen.`,
    });
  }
  // Sjuktimmar (8 tim per sjuk vardag) går till lönen när lönearten har en kod; annan frånvaro har ingen löneart än.
  const sjukGar = ((spec?.lonerader || []) as { loneart: string; status: string }[]).some(l => l.loneart === "sjuktimmar" && l.status === "skickas");
  const sjukSlut = sjukGar ? "Går till lönen." : "Går inte till lönen än — lönearten är inte inställd. Säg till Martin.";
  const sjukDagar = new Map(((spec?.sjuk?.dagar || []) as { datum: string; timmar: number }[]).map(d => [d.datum, d.timmar]));
  for (const dd of (spec?.deldagar || []) as any[]) {
    const sjuk = String(dd.typ).toLowerCase() === "sjuk";
    ut.push({
      nyckel: `dd${dd.datum}`, datum: dd.datum, rubrik: datumLang(dd.datum), hoger: deldagText(dd),
      text: sjuk
        ? `${deldagRubrik(dd.typ)}, ${Number(sjukDagar.get(dd.datum) ?? dd.timmar).toLocaleString("sv-SE")} tim sjuktimmar (8 tim minus det du jobbade). ${sjukSlut}`
        : `${deldagRubrik(dd.typ)}, ${Number(dd.timmar).toLocaleString("sv-SE")} tim frånvaro. ${EJ_BESTAMD}`,
    });
  }
  // Hemskickad: betald tid, ingen frånvaro. En post per dag så föraren ser vad som betalas — och kan säga till om det är fel.
  for (const h of (spec?.hemskickad || []) as { datum: string; minuter: number }[]) {
    ut.push({
      nyckel: `hs${h.datum}`, datum: h.datum, rubrik: datumLang(h.datum), hoger: `hemskickad ${fmtTimMin(h.minuter)}`,
      text: `Du blev hemskickad. Dagen fylls upp till 8 tim och ${fmtTimMin(h.minuter)} betalas som timlön. Stämmer det inte — säg till Martin.`,
    });
  }
  for (const f of (spec?.franvaro || []) as { typ: string; dagar: number; datum: string[] }[]) {
    const ord = arFranvaroTyp(f.typ) ? FRANVARO_TYP_RUBRIK[f.typ] : f.typ;
    let text = EJ_BESTAMD;
    if (f.typ === "sjuk") {
      const vardagar = f.datum.filter(d => sjukDagar.has(d)).length;
      text = vardagar > 0
        ? `8 tim för varje vardag: ${vardagar * 8} tim sjuktimmar${vardagar < f.dagar ? " (helger och röda dagar räknas inte)" : ""}. ${sjukSlut}`
        : "Helger och röda dagar räknas inte som sjuktimmar.";
    }
    ut.push({
      nyckel: `fr${f.typ}`, datum: f.datum[0] || "", rubrik: datumSpann(f.datum), hoger: `${ord}, ${f.dagar} ${f.dagar === 1 ? "dag" : "dagar"}`,
      text,
    });
  }
  // Helglönen: EN post per röd vardag, med orsaken — varför dagen gav eller inte gav helglön (Min månad). Går till lönen när lönearten
  // (helglon_skordare / helglon_skotare) har en kod; annars som förut. Äldre svar utan `lonerader` räknas som utan kod.
  const lonerader = (spec?.lonerader || []) as { loneart: string; status: string }[];
  const helglonGar = lonerader.some(l => l.loneart.startsWith("helglon") && l.status === "skickas");
  for (const h of ((spec?.helglon?.dagar || []) as { datum: string; namn: string; arbetad: boolean; ger?: boolean; skal?: string }[])) {
    ut.push({ nyckel: `hl${h.datum}`, datum: h.datum, rubrik: datumLang(h.datum), hoger: h.namn, text: helglonText(h, helglonGar) });
  }
  if (varn.some(v => /^Ingen helglön skickas/.test(v))) {
    ut.push({ nyckel: "hlmaskin", datum: "", rubrik: "Helglön", hoger: "saknas", text: "Du har ingen maskintid den här månaden och ingen maskin på din rad i registret, så helglönen kan inte läggas till. Säg till Martin." });
  }
  // Övriga lönearter som har ett antal men saknar kod: raden går inte till lönen. Helglönen och sjuktimmarna har sina dagsposter ovan.
  // Frivilliga (premien) är ingen sak för föraren.
  for (const l of lonerader.filter(l => l.status === "saknar_kod" && !l.loneart.startsWith("helglon") && l.loneart !== "sjuktimmar")) {
    const info = loneartInfo(l.loneart);
    ut.push({ nyckel: `lk-${l.loneart}`, datum: "", rubrik: info?.label ?? "Lönerad", hoger: "inte inställd", text: "Går inte till lönen än — lönearten är inte inställd. Säg till Martin." });
  }
  for (const b of (spec?.byten || []) as { ledig: string; ersatter: string; ersatterNamn: string; ersatterArbetad: boolean; ledigArbetad: boolean }[]) {
    const rod = `${b.ersatterNamn} (${datumLang(b.ersatter)})`;
    const text = b.ledigArbetad
      ? `Skulle vara ledig i stället för ${rod}, men du har arbete registrerat. Då räknas bytet inte. Är det fel — säg till Martin.`
      : !b.ersatterArbetad
        ? `Ledig i stället för ${rod}, men det finns ingen arbetstid den dagen. Stämmer det inte — säg till Martin.`
        : `Ledig i stället för ${rod}, som du jobbade. Inget att göra.`;
    ut.push({ nyckel: `by${b.ledig}`, datum: b.ledig, rubrik: datumLang(b.ledig), hoger: "bytesdag", text });
  }
  for (const s of (spec?.synk || []) as { datum: string; diff_min: number; bekraftat: string; maskinen: string }[]) {
    ut.push({
      nyckel: `sy${s.datum}`, datum: s.datum, rubrik: datumLang(s.datum), hoger: `${minText(s.diff_min)} avvikelse`,
      text: `Du sa ${s.bekraftat}, maskinen ${s.maskinen}. Öppna dagen i Kalender och förklara.`,
    });
  }
  for (const k of (spec?.ledighetskollision || []) as { datum: string; typ: string; arbetad_min: number }[]) {
    ut.push({
      nyckel: `lk${k.datum}`, datum: k.datum, rubrik: datumLang(k.datum), hoger: `${franvaroOrd(k.typ)} och jobb`,
      text: `Godkänd ledighet och ${minText(k.arbetad_min)} arbete samma dag. Stämmer det inte — ta bort ledigheten i Kalender.`,
    });
  }
  okandaVarningar(varn).forEach((v, i) => ut.push({ nyckel: `ov${i}`, datum: "", rubrik: "Övrigt", text: v }));

  return ut.sort((a, b) => a.datum.localeCompare(b.datum));
}

/** Förarens ord för en röd vardag: gav den helglön, och om inte — varför (lib/lonesystem/helglon, §10 mom 3 och 4). */
export function helglonText(h: { arbetad: boolean; ger?: boolean; skal?: string }, gar: boolean): string {
  if (h.ger === false) {
    switch (h.skal) {
      case "sjuk": return "Du var sjuk den dagen, och en sjukdag ger ingen helglön (sjuklönen betalas enligt avtalet).";
      case "vab": return "Du var hemma med sjukt barn (VAB) den dagen. Det ger ingen helglön.";
      case "foraldraledig": return "Du var föräldraledig den dagen. Det ger ingen helglön.";
      case "tjanstledig": return "Du var tjänstledig den dagen. Det ger ingen helglön.";
      case "tjanstledig_omger": return "Du var tjänstledig dagen före eller dagen efter. Då betalas ingen helglön.";
      case "kvalifikationstid": return "Helglön betalas först efter tre månaders anställning.";
      default: return "Ingen helglön den här dagen.";
    }
  }
  const slut = gar ? "Går till lönen." : EJ_BESTAMD;
  return h.arbetad
    ? `Du arbetade den dagen. Helglön, 8 tim, kommer ovanpå lönen för timmarna du arbetade. ${slut}`
    : `Helglön, 8 tim. ${slut}`;
}

function deldagRubrik(typ: string): string {
  const t = (typ || "").toLowerCase();
  if (t === "sjuk") return "Delvis sjukdag";
  if (t === "vab") return "Delvis VAB";
  return `Delvis ${franvaroOrd(t)}`;
}

/**
 * Dag för dag: det som AVVIKER på en dag, i förarens ord. Tom lista = en
 * vanlig dag — då visas objektet, tyst grått.
 */
export function dagAvvikelser(
  d: { datum: string; start_tid?: string | null; slut_tid?: string | null; rast_min?: number | null; arbetad_min: number; extra_min?: number; bekraftad?: boolean; maskin_id?: string | null; objekt?: string[]; perioddag?: boolean },
  ctx: {
    rodaDagar: Record<string, string>;
    deldag?: { typ: string; fran_tid: string | null; till_tid: string | null } | null;
    ledig?: string | null;
    /** Tidsavvikelse mot maskinen (synk), minuter. */
    synkMin?: number | null;
    /** Vilobrott den dagen (tabellen vilobrott). */
    vilobrott?: { typ: string; vila_h: number; krav_h: number }[];
    /** KONTROLLVYN (chefen): larma också på maskindag utan maskin / utan objekt.
     *  Av för förarens spec tills vi vet hur många av hans dagar det träffar. */
    kontroll?: boolean;
  },
): string[] {
  const ut: string[] = [];
  const totalMin = (d.arbetad_min || 0) + (d.extra_min || 0);
  const dow = dt(d.datum).getDay();
  if (ctx.rodaDagar[d.datum]) ut.push(ctx.rodaDagar[d.datum].toLowerCase());
  else if (dow === 0 || dow === 6) ut.push("helg");
  if (totalMin > 0 && totalMin < ARBETSDAG_MIN_MINUTER) ut.push(totalMin === 1 ? "1 minut" : `${totalMin} minuter`);
  // Pass över ARBETSDAG_MAX_MINUTER eller negativt (rast längre än passet) —
  // samma regel som granskningens `orimliga` (lib/arbetsdagRegler).
  const orimligt = d.start_tid && d.slut_tid ? passOrimlighet(d.arbetad_min) : null;
  if (orimligt === "lang") ut.push(`pass ${minText(d.arbetad_min)}`);
  else if (orimligt === "negativ") ut.push("negativ tid");
  if (ctx.deldag?.typ === "hemskickad") { const t = hemskickadText(totalMin); if (t) ut.push(t); }   // betald tid, ingen frånvaro
  else if (ctx.deldag) ut.push(deldagText(ctx.deldag));
  else if (ctx.ledig) ut.push(`${franvaroOrd(ctx.ledig)} och jobb`);
  if (arTidigVardag({ datum: d.datum, start_tid: d.start_tid ?? null, brandrisk_beordrad: null })) ut.push(`började ${hm(d.start_tid)}`);
  if ((d.rast_min || 0) > RAST_FRAGA_MIN) ut.push(`rast ${minText(d.rast_min || 0)}`);
  if (ctx.synkMin) ut.push(`${minText(Math.abs(ctx.synkMin))} mot maskinen`);
  for (const v of ctx.vilobrott || []) ut.push(`${v.typ === "dygnsvila" ? "dygnsvila" : "veckovila"} ${fmtH(v.vila_h)} av ${fmtH(v.krav_h)} tim`);
  if (ctx.kontroll) {
    const maskindag = !!(d.start_tid || d.slut_tid) && !d.perioddag;
    if (maskindag && !d.maskin_id) ut.push("utan maskin");
    if (totalMin > 0 && (d.objekt || []).length === 0) ut.push("utan objekt");
  }
  if (d.bekraftad === false) ut.push("ej bekräftad");
  return ut;
}

const fmtH = (h: number) => (Math.round(h * 10) / 10).toLocaleString("sv-SE");
