// ─────────────────────────────────────────────────────────────
// UTJÄMNINGSPERIODER I ADMIN (Admin → Avtal). Ren logik: veckor, validering, sortering och regeln om exporterad lön.
//
// Tabellen utjamningsperiod (migration 20260918100000): startdatum (måndag), slutdatum (söndag) — samma CHECK som tabellen —
// medarbetare_id (NULL = alla), anteckning, skapad_av. Årsövertiden läser den (lib/lonesystem/arsovertid).
// En period väljs i HELA ISO-veckor: formuläret erbjuder bara måndagar, så en period som bryter tabellens CHECK inte går
// att skapa.
// ─────────────────────────────────────────────────────────────
import { isoVecka } from "@/lib/vilobrott"
import { anledningGiltig } from "@/lib/redigeraAnledning"

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
const mandagIVecka1 = (ar: number) => { const d = new Date(ar, 0, 4); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
const mandagFor = (s: string) => { const d = lokal(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };

/**
 * En rad per hel vecka, från ISO-vecka 1 året före `ar` till sista veckan året efter. `extra` = datum som måste få plats
 * (en sparad period från ett annat år). Veckan hör till MÅNDAGENS månad, så årtalet på månadsrubriken stämmer med raden.
 */
export function veckoRader(ar: number, extra: string[] = []): Veckorad[] {
  let start = mandagIVecka1(ar - 1);
  let slut = new Date(ar + 1, 11, 31);
  for (const e of extra) { const m = mandagFor(e); if (m < start) start = m; const d = lokal(e); if (d > slut) slut = d; }
  const ut: Veckorad[] = [];
  for (let m = start; m <= slut; m = dagar(m, 7)) {
    const s = dagar(m, 6);
    const dagText = m.getMonth() === s.getMonth() ? `${m.getDate()}–${s.getDate()} ${MAN_KORT[m.getMonth()]}` : `${m.getDate()} ${MAN_KORT[m.getMonth()]}–${s.getDate()} ${MAN_KORT[s.getMonth()]}`;
    const v = isoVecka(m);
    ut.push({ mandag: iso(m), vecka: v.vecka, etikett: `v${v.vecka} · ${dagText}`, manad: iso(m).slice(0, 7), manadText: `${MAN_LANG[m.getMonth()]} ${m.getFullYear()}` });
  }
  return ut;
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

type Krockperiod = { id: string; startdatum: string; slutdatum: string; medarbetare_id: string | null; anteckning: string };
export type Forarval = { alla: boolean; ids: string[] };

/** Perioder som ligger över veckan för någon av de valda förarna. Alla valt = en period för vem som helst krockar. */
export function krockarIVecka<T extends Krockperiod>(mandag: string, val: Forarval, befintliga: T[], utanId?: string): T[] {
  if (!val.alla && val.ids.length === 0) return [];   // ingen förare vald: inget att krocka med
  const sondag = slutFranMandag(mandag);
  return befintliga.filter(e => e.id !== utanId && e.startdatum <= sondag && e.slutdatum >= mandag
    && (val.alla || e.medarbetare_id == null || val.ids.includes(e.medarbetare_id)));
}

/** Perioden som står på en tonad vecka: anteckningen, och "+N" när flera ligger över varandra. */
export const krockText = (k: { anteckning: string }[]) => (k.length === 0 ? "" : k.length === 1 ? k[0].anteckning : `${k[0].anteckning} +${k.length - 1}`);

/** Varje krockande period en gång (tidigast först) för veckorna i urvalet. */
export function krockarIUrval<T extends Krockperiod>(u: Urval, val: Forarval, befintliga: T[], utanId?: string): T[] {
  if (!u.forsta) return [];
  const sett = new Map<string, T>();
  for (let m = lokal(u.forsta); iso(m) <= (u.sista || u.forsta); m = dagar(m, 7)) for (const k of krockarIVecka(iso(m), val, befintliga, utanId)) sett.set(k.id, k);
  return Array.from(sett.values()).sort((a, b) => a.startdatum.localeCompare(b.startdatum));
}

/** Det som spärrar Spara. Null = går att spara. */
export function kontrolleraPeriod(p: { forsta: string; sista: string; anteckning: string; antalForare?: number }): string | null {
  if (p.antalForare === 0) return "Välj minst en förare."
  if (!p.forsta) return "Välj första veckan."
  if (!p.sista) return "Välj sista veckan."
  if (p.sista < p.forsta) return "Sista veckan ligger före den första."
  if (!anledningGiltig(p.anteckning)) return "Skriv en anteckning: minst 3 tecken, vad som gjordes."
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
