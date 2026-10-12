// ─────────────────────────────────────────────────────────────
// UTJÄMNINGSPERIODER I ADMIN (Admin → Avtal). Ren logik: veckor, validering, sortering och regeln om exporterad lön.
//
// Tabellen utjamningsperiod (migration 20260918100000): startdatum (måndag), slutdatum (söndag) — samma CHECK som tabellen —
// medarbetare_id (NULL = alla), anteckning, skapad_av. Årsövertiden läser den (lib/lonesystem/arsovertid).
// En period väljs i HELA ISO-veckor: formuläret erbjuder bara måndagar, så en period som bryter tabellens CHECK inte går
// att skapa.
// ─────────────────────────────────────────────────────────────
import { isoVecka } from "@/lib/vilobrott"

/** Namnet på en period: kort nog att stå i en lista, en kalenderrad och en krockvarning. */
export const MAX_NAMN_TECKEN = 20

/** Längre än så kräver lokal överenskommelse (§5 mom 2). En varning, ingen spärr. */
export const MAX_VECKOR_UTAN_ÖVERENSKOMMELSE = 16

const MAN_KORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]

type Datumpar = { startdatum: string; slutdatum: string }

const lokal = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d) }
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const dagar = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }

/** "v17–27", "v17", eller över årsskifte "v51 2026 – v3 2027". */
export function veckoText(p: Datumpar): string {
  const a = isoVecka(lokal(p.startdatum)), b = isoVecka(lokal(p.slutdatum))
  if (a.år !== b.år) return `v${a.vecka} ${a.år} – v${b.vecka} ${b.år}`
  return a.vecka === b.vecka ? `v${a.vecka}` : `v${a.vecka}–${b.vecka}`
}

/** Hela veckor från måndagen till söndagen (båda inräknade). */
export function antalVeckor(p: Datumpar): number {
  return Math.round((lokal(p.slutdatum).getTime() + 86400000 - lokal(p.startdatum).getTime()) / (7 * 86400000))
}

export const arLangPeriod = (p: Datumpar) => antalVeckor(p) > MAX_VECKOR_UTAN_ÖVERENSKOMMELSE

/** Söndagen i veckan som börjar på måndagen `mandag`. */
export const slutFranMandag = (mandag: string) => iso(dagar(lokal(mandag), 6))

/** Måndagen i veckan som slutar på söndagen `slut` (för att fylla formuläret ur en sparad period). */
export const mandagFranSlut = (slut: string) => iso(dagar(lokal(slut), -6))

export type Veckorad = { mandag: string; vecka: number; etikett: string; manad: string; manadText: string };

const MAN_LANG = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
const mandagFor = (s: string) => { const d = lokal(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };

/**
 * En rad per hel vecka från veckan som innehåller `fran` till veckan som innehåller `till`. Veckan hör till MÅNDAGENS månad,
 * så årtalet på månadsrubriken stämmer med raden.
 */
export function veckoRader(fran: string, till: string): Veckorad[] {
  const slut = mandagFor(till);
  const ut: Veckorad[] = [];
  for (let m = mandagFor(fran); m <= slut; m = dagar(m, 7)) {
    const s = dagar(m, 6);
    const dagText = m.getMonth() === s.getMonth() ? `${m.getDate()}–${s.getDate()} ${MAN_KORT[m.getMonth()]}` : `${m.getDate()} ${MAN_KORT[m.getMonth()]}–${s.getDate()} ${MAN_KORT[s.getMonth()]}`;
    const v = isoVecka(m);
    ut.push({ mandag: iso(m), vecka: v.vecka, etikett: `v${v.vecka} · ${dagText}`, manad: iso(m).slice(0, 7), manadText: `${MAN_LANG[m.getMonth()]} ${m.getFullYear()}` });
  }
  return ut;
}

const VECKOR_BAKAT = 6;
const VECKOR_FRAMAT = 26;     // ca sex månader
const VECKOR_PER_TRYCK = 26;

/**
 * Veckorna kalendern visar: ca sex månader framåt och sex veckor bakåt runt det som är valt (annars runt veckan vi är i),
 * så en period man ändrar syns direkt och listan blir kort nog att ligga i arkets enda scroll. `bakat`/`framat` = antal
 * tryck på Tidigare/Senare, 26 veckor var.
 */
export function veckoFonster(u: Urval, idagMandag: string, bakat: number, framat: number): { fran: string; till: string } {
  const a = u.forsta || idagMandag;
  const b = u.sista || u.forsta || idagMandag;
  return {
    fran: iso(dagar(lokal(a), -7 * (VECKOR_BAKAT + VECKOR_PER_TRYCK * bakat))),
    till: iso(dagar(lokal(b), 7 * (VECKOR_FRAMAT + VECKOR_PER_TRYCK * framat))),
  };
}

export type Urval = { forsta: string; sista: string };

/** Första trycket sätter första veckan, nästa sista veckan (före den första byter plats), ett tryck till börjar om. */
export function tryckVecka(u: Urval, mandag: string): Urval {
  if (!u.forsta || u.sista) return { forsta: mandag, sista: "" };
  return mandag < u.forsta ? { forsta: mandag, sista: u.forsta } : { forsta: u.forsta, sista: mandag };
}

/** Ligger veckan i urvalet? Med bara första veckan vald är det just den. */
export const arIUrval = (u: Urval, mandag: string) => !!u.forsta && mandag >= u.forsta && mandag <= (u.sista || u.forsta);

/** "9 veckor, v44–52 2026" under kalendern. */
export function periodSammanfattning(forsta: string, sista: string): string {
  if (!forsta) return "Tryck på första veckan.";
  const a = isoVecka(lokal(forsta));
  if (!sista) return `Från v${a.vecka} ${a.år}. Tryck på sista veckan.`;
  const p = { startdatum: forsta, slutdatum: slutFranMandag(sista) };
  const n = antalVeckor(p);
  const text = veckoText(p);
  return `${n} ${n === 1 ? "vecka" : "veckor"}, ${text.includes(" ") ? text : `${text} ${a.år}`}`;
}

type Krockperiod = { id: string; namn?: string | null; startdatum: string; slutdatum: string; medarbetare_id: string | null; anteckning: string };
export type Forarval = { alla: boolean; ids: string[] };

/** Namnet på en period; för en rad som saknar det de första 20 tecknen av anteckningen (som migrationens backfill), annars 'Period'. */
export function periodNamn(p: { namn?: string | null; anteckning?: string | null }): string {
  const n = (p.namn || "").trim();
  if (n) return n;
  return (p.anteckning || "").trim().slice(0, MAX_NAMN_TECKEN).trim() || "Period";
}

/** Den period man håller på att lägga in: samma namn och samma veckor som en befintlig är samma period för andra förare. */
export type NyPeriod = { namn: string; startdatum: string; slutdatum: string };
const arSammaPeriod = (e: Krockperiod, ny?: NyPeriod) =>
  !!ny && ny.namn.trim() !== "" && periodNamn(e).toLowerCase() === ny.namn.trim().toLowerCase() && e.startdatum === ny.startdatum && e.slutdatum === ny.slutdatum;

/** Perioder som ligger över veckan för någon av de valda förarna. Alla valt = en period för vem som helst krockar. */
export function krockarIVecka<T extends Krockperiod>(mandag: string, val: Forarval, befintliga: T[], utanId?: string, ny?: NyPeriod): T[] {
  if (!val.alla && val.ids.length === 0) return [];   // ingen förare vald: inget att krocka med
  const sondag = slutFranMandag(mandag);
  return befintliga.filter(e => e.id !== utanId && !arSammaPeriod(e, ny) && e.startdatum <= sondag && e.slutdatum >= mandag
    && (val.alla || e.medarbetare_id == null || val.ids.includes(e.medarbetare_id)));
}

/** Perioden som står på en tonad vecka: dess NAMN, och "+N" när flera ligger över varandra. */
export const krockText = (k: { namn?: string | null; anteckning?: string | null }[]) => (k.length === 0 ? "" : k.length === 1 ? periodNamn(k[0]) : `${periodNamn(k[0])} +${k.length - 1}`);

/** Varje krockande period en gång (tidigast först) för veckorna i urvalet. */
export function krockarIUrval<T extends Krockperiod>(u: Urval, val: Forarval, befintliga: T[], utanId?: string, ny?: NyPeriod): T[] {
  if (!u.forsta) return [];
  const sett = new Map<string, T>();
  for (let m = lokal(u.forsta); iso(m) <= (u.sista || u.forsta); m = dagar(m, 7)) for (const k of krockarIVecka(iso(m), val, befintliga, utanId, ny)) sett.set(k.id, k);
  return Array.from(sett.values()).sort((a, b) => a.startdatum.localeCompare(b.startdatum));
}

/**
 * EN rad om krocken: "Krockar med Gävle v17–27 (Joacim, Daniel, Stefan, Martin)". Samma period för flera förare (samma namn och
 * veckor) blir en post; anteckningen står aldrig med. `fornamn` ger förarens förnamn för ett medarbetar-id.
 */
export function krockMening(krockar: Krockperiod[], fornamn: (id: string) => string): string {
  const grupper = new Map<string, { namn: string; startdatum: string; slutdatum: string; forare: string[]; alla: boolean }>();
  for (const k of krockar) {
    const nyckel = `${periodNamn(k).toLowerCase()}|${k.startdatum}|${k.slutdatum}`;
    const g = grupper.get(nyckel) || { namn: periodNamn(k), startdatum: k.startdatum, slutdatum: k.slutdatum, forare: [], alla: false };
    if (k.medarbetare_id == null) g.alla = true;
    else { const n = fornamn(k.medarbetare_id); if (!g.forare.includes(n)) g.forare.push(n); }
    grupper.set(nyckel, g);
  }
  const poster = Array.from(grupper.values()).sort((a, b) => a.startdatum.localeCompare(b.startdatum))
    .map(g => `${g.namn} ${veckoText(g)} (${g.alla ? "alla" : g.forare.join(", ")})`);
  return poster.length ? `Krockar med ${poster.join(", ")}` : "";
}

/** Det som spärrar Spara. Null = går att spara. Anteckningen är valfri och ingår inte. */
export function kontrolleraPeriod(p: { forsta: string; sista: string; namn: string; antalForare?: number }): string | null {
  if (p.antalForare === 0) return "Välj minst en förare."
  const namn = p.namn.trim()
  if (!namn) return "Skriv ett namn på perioden."
  if (namn.length > MAX_NAMN_TECKEN) return `Namnet får vara högst ${MAX_NAMN_TECKEN} tecken.`
  if (!p.forsta) return "Välj första veckan."
  if (!p.sista) return "Välj sista veckan."
  if (p.sista < p.forsta) return "Sista veckan ligger före den första."
  return null
}

/** Kommande och pågående (efter start, tidigast först) överst; avslutade (senast slut först) under. En period som slutar idag pågår. */
export function delaUpp<T extends Datumpar>(rader: T[], idag: string): { kommande: T[]; avslutade: T[] } {
  const kommande = rader.filter(r => r.slutdatum >= idag).sort((a, b) => a.startdatum.localeCompare(b.startdatum))
  const avslutade = rader.filter(r => r.slutdatum < idag).sort((a, b) => b.slutdatum.localeCompare(a.slutdatum))
  return { kommande, avslutade }
}

/** Löneperioderna (YYYY-MM) som perioden berör: varje arbetsmånad från start till slut, löneperiod = arbetsmånad + 1. */
export function loneperioderBerorda(p: Datumpar): string[] {
  const s = lokal(p.startdatum), e = lokal(p.slutdatum)
  const ut: string[] = []
  for (let y = s.getFullYear(), m = s.getMonth(); y < e.getFullYear() || (y === e.getFullYear() && m <= e.getMonth()); m++) {
    if (m > 11) { m = 0; y++ }
    const lone = new Date(y, m + 1, 1)
    ut.push(`${lone.getFullYear()}-${String(lone.getMonth() + 1).padStart(2, "0")}`)
  }
  return ut
}

/**
 * Har perioden påverkat en redan EXPORTERAD löneperiod? Skickad lön (fortnox_export_logg.status = 'skickat') för en
 * berörd löneperiod: för vem som helst om perioden gäller alla, annars för just den personen.
 */
export function arExporterad(p: Datumpar & { medarbetare_id?: string | null }, logg: { period: string; medarbetare_id: string; status: string }[]): boolean {
  const berorda = new Set(loneperioderBerorda(p))
  return logg.some(l => l.status === "skickat" && berorda.has(l.period) && (!p.medarbetare_id || l.medarbetare_id === p.medarbetare_id))
}
