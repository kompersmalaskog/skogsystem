// Sortiment i lassrapporteringen: namnen är SKÖRDARENS ("Timmer: Vislanda Tall_V3"), så föraren ser det han känner igen och så
// "kvar" kan räknas per sortiment mot det skördaren kapat. Ingen standardlista — valen är traktens egna sortiment.
import type { SortimentRad } from './typer';

export const VED_MARKAGARE_NYCKEL = 'ved_markagare';
export const VED_MARKAGARE_NAMN = 'Ved markägare';

/** Nyckeln sortiment grupperas på: skördarens namn, städat (ingen skillnad i mellanslag/versaler). Markägarens ved är ett eget val. */
export function sortimentNyckel(namn: string): string {
  const s = String(namn ?? '').trim().replace(/\s+/g, ' ');
  if (/hemved/i.test(s) || s.toLowerCase() === VED_MARKAGARE_NAMN.toLowerCase()) return VED_MARKAGARE_NYCKEL;
  return s.toLowerCase();
}

const stor = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ── Sortimentnamn i klartext (Martin 2026-10-26) ──────────────────────────────────────────────────────────────────────────────────────────────────
// Föraren ser namnet som han säger det: "Kubb · Alvesta", "Massaved björk", "Talltimmer · Vislanda" — aldrig koder som 305, _V3, 195 1-2 eller BmavFall.
// Grupp och destination läses ur den befintliga sortimentstabellen (vyn vy_sortiment_klass: namn → grupp, destination; `lasSortimentKlass` fyller registret nedan). Trädslaget
// ("Tall", "Bmav" = björk-massaved …) och "kort" läses ur namnet — det finns ingen kolumn för dem. Saknas namnet i tabellen tolkas det ur texten; går inte ens det visas gruppen
// ("Kubb"), annars "Övrigt sortiment" — aldrig koden.

export interface SortimentKlass { grupp: string | null; destination: string | null }
let klassRegister: ReadonlyMap<string, SortimentKlass> = new Map();
let unikaText: ReadonlyMap<string, string> = new Map();
/** Läst ur vy_sortiment_klass (en rad per sortiment-id; samma namn kan stå på flera maskiner — den med mest information gäller). */
export function sattSortimentKlass(rader: ReadonlyArray<{ namn: string | null; grupp: string | null; destination: string | null }>): void {
  const m = new Map<string, SortimentKlass>();
  for (const r of rader) {
    if (!r.namn) continue;
    const k = sortimentNyckel(r.namn);
    const ny = { grupp: r.grupp || null, destination: r.destination && !SARNAMN.some(([re]) => re.test(r.destination!)) ? r.destination : null };
    const gammal = m.get(k);
    const poang = (x: SortimentKlass | undefined) => (x ? (x.grupp ? 1 : 0) + (x.destination ? 2 : 0) : -1);
    if (poang(ny) > poang(gammal)) m.set(k, ny);
  }
  klassRegister = m;
  unikaText = byggUnika(Array.from(m, ([k, v]) => ({ namn: rader.find((r) => r.namn && sortimentNyckel(r.namn) === k)!.namn!, grupp: v.grupp, destination: v.destination })));
}
export const harSortimentKlass = (): boolean => klassRegister.size > 0;

const ART_REGLER: ReadonlyArray<[RegExp, string]> = [
  // Alvestas kubb heter efter längd och inte efter trädslag i skördarens lista: 275 = tall, 305 = gran (Martin 2026-10-26).
  [/alvesta\s*275/i, 'tall'],
  [/alvesta\s*305/i, 'gran'],
  [/övr?lov|övr?löv|ovrigt lov|övrigt löv|ovlov|övlöv/i, 'övrigt löv'],
  // Bmav = BARRmassaved (Martin 2026-10-26: BmavFall 100-1 är barr, BjörkmavFall 104-1 är björk) — aldrig björk.
  [/(^|[^a-zåäö])b(?=mav)/i, 'barr'],
  [/björk|bjork|bjök/i, 'björk'],
  [/(^|[^a-zåäö])bok/i, 'bok'],
  [/(^|[^a-zåäö])ek(?![a-zåäö])|kärstimmerek/i, 'ek'],
  [/(^|[^a-zåäö])asp/i, 'asp'],
  [/gran/i, 'gran'],
  [/tall/i, 'tall'],
  [/barr/i, 'barr'],
  [/löv|lov(?=timmer)/i, 'löv'],
];
/** Sortiment som heter något eget (inget trädslag): visas med sitt namn, inte som bara "Timmer". */
const SARNAMN: ReadonlyArray<[RegExp, string]> = [
  [/stamblock/i, 'Stamblock'],
  [/karbenning/i, 'Karbenning'],
  [/st[öo]dl[äa]ngd/i, 'Stödlängd'],
  [/kortl[äa]ngd/i, 'Kortlängd'],
  [/t[äa]ndsticks/i, 'Tändsticksvirke'],
  [/k[äa]rstimmer/i, 'Kärstimmer'],
];
const GENERISKA = new Set(['tall', 'gran', 'björk', 'bjork', 'kort', 'ek', 'bok', 'asp', 'löv', 'v3']);

function inferGrupp(t: string): string | null {
  if (/hemved/.test(t)) return 'Hemved';
  if (/unclassified|unspecified/.test(t)) return 'Utan sortiment';
  if (/engved|avkap|bränsleved|energi/.test(t)) return 'Energi';
  if (/klentimmer|(^|[^a-zåäö])klt\b/.test(t)) return 'Klentimmer';
  if (/kubb|stolp/.test(t)) return 'Kubb';
  if (/mav|massa/.test(t)) return 'Massa';
  if (/timmer|stamblock|karbenning|kortlängd|stödlängd|tändsticks|ti gran|kv ?\d|\d+-\d/.test(t)) return 'Timmer';
  return null;
}

/** Namnet i klartext delat i sortiment och mottagare. Grupp/destination ur `meta` om den finns, annars ur texten. */
function klartextDelar(namn: string, meta?: SortimentKlass | null): { bas: string; dest: string | null; grupp: string | null } {
  const s = String(namn ?? '').trim();
  if (!s) return { bas: '', dest: null, grupp: null };
  if (sortimentNyckel(s) === VED_MARKAGARE_NYCKEL) return { bas: VED_MARKAGARE_NAMN, dest: null, grupp: 'Hemved' };
  const kolon = s.indexOf(':');
  const fore = kolon >= 0 ? s.slice(0, kolon).trim() : '';
  const rest = (kolon >= 0 ? s.slice(kolon + 1) : s).replace(/(^|[_ ])V\d+\s*$/i, '').replace(/^V3[_ ]/i, '').trim();
  const text = `${fore} ${rest}`.toLowerCase();
  let grupp = meta?.grupp ?? inferGrupp(text);
  if (grupp === 'Massaved') grupp = 'Massa';
  if (!grupp && meta?.destination && !SARNAMN.some(([re]) => re.test(meta.destination!))) grupp = 'Timmer';   // en mottagare utan grupp ("Urshult Gran 494") är timmer
  const art = ART_REGLER.find(([re]) => re.test(`${fore} ${rest}`))?.[1] ?? null;
  // Ett "mottagare" som i själva verket är sortimentets eget ord (Stödlängd, Karbenning …) är ingen mottagare.
  let dest = meta?.destination && !SARNAMN.some(([re]) => re.test(meta.destination!)) ? meta.destination : null;
  const berg = /berg\s?(?:&|o)\s?berg/i.test(`${fore} ${rest}`);
  if (berg) dest = 'Berg & Berg';
  const sarnamn = grupp === 'Timmer' ? SARNAMN.find(([re]) => re.test(`${fore} ${rest}`))?.[1] ?? null : null;
  if (!dest && grupp === 'Övrigt') dest = (rest.match(/^[A-Za-zÅÄÖåäö]+/) ?? [''])[0] || null;
  if (!dest && !berg && (grupp === 'Kubb' || grupp === 'Timmer')) {
    const ord = (rest.match(/^[A-Za-zÅÄÖåäö]+/) ?? [''])[0];
    if (ord.length >= 4 && !GENERISKA.has(ord.toLowerCase()) && !/timmer|kubb|massa|ved|karbenning|stamblock|kortl|st[öo]dl/i.test(ord) && !SARNAMN.some(([re]) => re.test(ord))) dest = stor(ord);
  }
  const kort = grupp === 'Timmer' && /(^|[^a-zåäö])kort/i.test(rest);
  let bas: string;
  switch (grupp) {
    case 'Timmer': bas = sarnamn ? `${sarnamn}${art ? ` ${art}` : ''}` : `${art ? stor(art) : ''}${art ? 'timmer' : 'Timmer'}${kort ? ' kort' : ''}`; break;
    case 'Kubb': bas = /grovkubb/i.test(rest) ? 'Grovkubb' : `${art ? stor(art) : ''}${art ? 'kubb' : 'Kubb'}`; break;
    case 'Övrigt': bas = 'Övrigt sågbart'; break;
    case 'Klentimmer': bas = `Klentimmer${art ? ` ${art}` : ''}`; break;
    case 'Massa': bas = `Massaved${art ? ` ${art}` : ''}`; break;
    case 'Hemved': bas = `Hemved${art ? ` ${art}` : ''}`; break;
    case 'Energi': bas = `${/avkap/.test(text) ? 'Avkap' : 'Energived'}${art ? ` ${art}` : ''}`; break;
    case 'Utan sortiment': bas = 'Utan sortiment'; dest = null; break;
    case null: case undefined: case '': {
      // Okänd grupp: ett rent ord ("Grovbok") duger, en kod gör det inte.
      const ord = rest.replace(/[_]/g, ' ').trim();
      return { bas: /^[A-Za-zÅÄÖåäö ]+$/.test(ord) && ord.length >= 3 ? stor(ord) : 'Övrigt sortiment', dest: null, grupp: null };
    }
    default: bas = grupp;
  }
  return { bas, dest, grupp: grupp ?? null };
}

/** Namnet i klartext utan register (och utan tillägg som skiljer det från andra sortiment). Ren funktion (testas utan tabell). */
export function klartextNamn(namn: string, meta?: SortimentKlass | null): string {
  const { bas, dest } = klartextDelar(namn, meta);
  return dest ? `${bas} · ${dest}` : bas;
}

// ── När två sortiment annars får samma text (Martin 2026-10-26) ─────────────────────────────────────────────────────────────────────────────────
// Trädslag står redan i namnet ("Grankubb", "Massaved björk"). Skiljer det inte läggs det till som skiljer: först längd ("3 m", "2,45 m"), sedan kvalitet ("kv 1-2")
// och övrigt ("grov", "spec", "22,9 cm"). Bara de dimensioner som faktiskt skiljer sorterna i gruppen läggs till, och bara på dem som har ett värde — aldrig koden.
interface Dimensioner { langd: string | null; kv: string | null; ovrigt: string | null }

const meter = (cm: number): string => `${(cm / 100).toFixed(2).replace('.', ',').replace(/,00$/, '').replace(/(,\d)0$/, '$1')} m`;

export function sortimentDimensioner(namn: string, grupp: string | null): Dimensioner {
  const t = String(namn ?? '').replace(/(?<=\dm)V3/g, ' ').replace(/[_ ]V3\b/gi, ' ').replace(/_/g, ' ');
  if (grupp === 'Utan sortiment') return { langd: null, kv: null, ovrigt: null };
  let langd: string | null = null;
  const m3 = t.match(/(\d)\s?[mM](?![a-zåäö])/);              // "3m", "3 M", "Engved3mBjörk"
  const mDec = t.match(/(?<![\d,.])(\d),(\d{2})(?!\d)/);         // "2,45"
  const mCm = t.match(/(?<![\d,.-])([1-5]\d\d)(?![\d,])/);       // 195, 245, 275, 305, 494
  if (grupp === 'Klentimmer') langd = null;
  else if (m3) langd = `${m3[1]} m`;
  else if (mDec) langd = `${mDec[1]},${mDec[2]} m`;
  else if (mCm && (grupp === 'Timmer' || grupp === 'Kubb')) langd = meter(Number(mCm[1]));
  const kvM = t.match(/\bkv\s?(\d(?:-\d)?)/i) ?? (grupp === 'Timmer' || grupp === 'Övrigt' ? t.match(/(?<![\d,.-])(\d-\d)(?![\d-])/) : null);
  const kv = kvM ? `kv ${kvM[1]}` : null;
  const delar: string[] = [];
  if (/grov/i.test(t)) delar.push('grov');
  if (/\bspec(?:-\d)?\b/i.test(t)) delar.push('spec');
  if (/ek a-?kubb/i.test(t)) delar.push('A');
  if (grupp === 'Klentimmer') {
    const dm = t.match(/-?\s?(\d{2}),(\d)/) ?? t.match(/\b(\d{2}) cm/) ?? t.match(/\bATA\s+-?(\d{2})(\d)\b/);
    if (dm) delar.push(dm[2] ? `${dm[1]},${dm[2]} cm` : `${dm[1]} cm`);
  }
  return { langd, kv, ovrigt: delar.length ? delar.join(' ') : null };
}

/** Texten per sortiment när tabellen är läst: samma bas + mottagare får det som skiljer dem. nyckel → text. */
function byggUnika(rader: ReadonlyArray<{ namn: string; grupp: string | null; destination: string | null }>): Map<string, string> {
  const delar = rader.map((r) => ({ nyckel: sortimentNyckel(r.namn), d: klartextDelar(r.namn, { grupp: r.grupp, destination: r.destination }), dim: sortimentDimensioner(r.namn, klartextDelar(r.namn, { grupp: r.grupp, destination: r.destination }).grupp) }));
  const grupper = new Map<string, typeof delar>();
  for (const x of delar) { const k = `${x.d.bas}|${x.d.dest ?? ''}`; grupper.set(k, [...(grupper.get(k) ?? []), x]); }
  const ut = new Map<string, string>();
  for (const g of grupper.values()) {
    const varierar = (f: keyof Dimensioner) => new Set(g.map((x) => x.dim[f] ?? '')).size > 1;
    const med = (['langd', 'kv', 'ovrigt'] as const).filter(varierar);
    for (const x of g) {
      const tillagg = med.map((f) => x.dim[f]).filter(Boolean).join(' ');
      ut.set(x.nyckel, `${x.d.bas}${tillagg ? ` ${tillagg}` : ''}${x.d.dest ? ` · ${x.d.dest}` : ''}`);
    }
  }
  return ut;
}

/** Namnet som föraren säger det ("Talltimmer · Vislanda"). Samma i lasskortet, kvar-listan och avläggskortet (alla går hit). */
export function sortimentVisning(namn: string): string {
  const s = String(namn ?? '').trim();
  if (!s) return '';
  return unikaText.get(sortimentNyckel(s)) ?? klartextNamn(s, klassRegister.get(sortimentNyckel(s)) ?? null);
}

/** Två nivåer ur samma namn: sortimentet ("Timmer 195 1-2", vitt/semibold) och mottagaren ("Vislanda", grått efter). Mottagare saknas → null. */
export function sortimentDelar(namn: string): { sortiment: string; mottagare: string | null } {
  const v = sortimentVisning(namn);
  const i = v.indexOf(' · ');
  return i < 0 ? { sortiment: v, mottagare: null } : { sortiment: v.slice(0, i), mottagare: v.slice(i + 3) };
}

export interface SkordatSortiment {
  nyckel: string;
  namn: string;
  m3: number;
  /** Köparens kod (dim_sortiment.kundkod, t.ex. "012-VVI") för sortimentets id:n. Kopplar skördarens sortiment till skotarens i Opti-lassen. */
  kundkoder?: string[];
}

export const OKLASSAT_NYCKEL = 'unclassified';
/** Skördarens "Unclassified": visas aldrig för föraren med eget namn — det räknas in i Övrigt. */
export const arOklassat = (nyckel: string): boolean => nyckel === OKLASSAT_NYCKEL;

/** Skördat per sortiment ur fakt_sortiment (volym_m3sub) + dim_sortiment.namn. Samma nyckel ⇒ en rad. */
export function skordatPerSortiment(
  rader: ReadonlyArray<{ sortiment_id: string | null; volym_m3sub: number | string | null }>,
  namnPerId: ReadonlyMap<string, string>,
  kodPerId?: ReadonlyMap<string, string | null>,
): SkordatSortiment[] {
  const per = new Map<string, SkordatSortiment>();
  for (const r of rader) {
    const id = r.sortiment_id ?? '';
    const namn = namnPerId.get(id);
    const volym = Number(r.volym_m3sub ?? 0);
    if (!namn || !Number.isFinite(volym)) continue;
    const nyckel = sortimentNyckel(namn);
    const g = per.get(nyckel) ?? { nyckel, namn: nyckel === VED_MARKAGARE_NYCKEL ? VED_MARKAGARE_NAMN : namn, m3: 0, kundkoder: [] };
    g.m3 += volym;
    const kod = kodPerId?.get(id);
    if (kod && !g.kundkoder!.includes(kod)) g.kundkoder!.push(kod);
    per.set(nyckel, g);
  }
  return Array.from(per.values()).filter((g) => g.m3 > 0).sort((a, b) => b.m3 - a.m3);
}

/** Sortimenten föraren kan välja mellan i Ändra: traktens egna (störst först) + "Ved markägare" när trakten har markägarved. */
export function valbaraSortiment(skordat: readonly SkordatSortiment[], harMarkagarVed: boolean): SortimentRad[] {
  const ut: SortimentRad[] = skordat.filter((s) => !arOklassat(s.nyckel)).map((s) => ({ nyckel: s.nyckel, namn: s.namn, m3: 0 }));
  if (harMarkagarVed && !ut.some((u) => u.nyckel === VED_MARKAGARE_NYCKEL)) ut.push({ nyckel: VED_MARKAGARE_NYCKEL, namn: VED_MARKAGARE_NAMN, m3: 0 });
  return ut;
}

// ── Sortimentlistan i Ändra får aldrig vara tom ────────────────────────────────────────────────────────
// Skördarens filer kommer 1–2 gånger om dagen och privata jobb har inget Vida-underlag, så skotaren kan börja innan något är skördat.
// Förarens lista byggs därför i tre steg, första som ger något gäller: (1) det skördaren kapat på trakten, (2) objektets egna sortiment
// (Vida-order/traktdirektiv, objekt.sortiment), (3) sortimenten vi använt senaste 12 månaderna, mest använda först.
// "Fler sortiment…" visar ALLTID hela listan (alla tre källorna + Ved markägare), så föraren aldrig fastnar.

export type SortimentKalla = 'skordat' | 'objekt' | 'historik' | 'ingen';

/** Ett sortiment vi använt senaste 12 månaderna (Opti-lass + appens lass). `antal` = antal rader, för "mest använda först". */
export interface HistorikSortiment { nyckel: string; namn: string; antal: number }

/** Objektets egna sortiment (`objekt.sortiment`, t.ex. "Gran timmer · Urshult") som valbara rader. Tomma och dubbletter bort. */
export function objektSortimentRader(lista: readonly (string | null | undefined)[] | null | undefined): SortimentRad[] {
  const sett = new Set<string>();
  const ut: SortimentRad[] = [];
  for (const s of lista ?? []) {
    const namn = String(s ?? '').trim();
    if (!namn) continue;
    const nyckel = sortimentNyckel(namn);
    if (sett.has(nyckel)) continue;
    sett.add(nyckel);
    ut.push({ nyckel, namn: nyckel === VED_MARKAGARE_NYCKEL ? VED_MARKAGARE_NAMN : namn, m3: 0 });
  }
  return ut;
}

/** Historiken som valbara rader, mest använda först (lika många: namnet). "Unclassified" är aldrig ett val. */
export function historikSortimentRader(h: readonly HistorikSortiment[] | null | undefined): SortimentRad[] {
  return [...(h ?? [])]
    .filter((x) => x.nyckel && x.namn && !arOklassat(x.nyckel))
    .sort((a, b) => b.antal - a.antal || a.namn.localeCompare(b.namn, 'sv'))
    .map((x) => ({ nyckel: x.nyckel, namn: x.nyckel === VED_MARKAGARE_NYCKEL ? VED_MARKAGARE_NAMN : x.namn, m3: 0 }));
}

function utanDubbletter(listor: readonly (readonly SortimentRad[])[]): SortimentRad[] {
  const sett = new Set<string>();
  const ut: SortimentRad[] = [];
  for (const l of listor) for (const r of l) { if (sett.has(r.nyckel)) continue; sett.add(r.nyckel); ut.push(r); }
  return ut;
}

export interface SortimentVal {
  /** Det som visas först under "Lägg till": traktens egna val, annars objektets, annars de mest använda. */
  primara: SortimentRad[];
  /** Hela listan (primära först): skördat + objektets + senaste 12 månaderna + Ved markägare. Visas av "Fler sortiment…". */
  alla: SortimentRad[];
  kalla: SortimentKalla;
}

/**
 * "Mest använda först" bland de primära: först hur många gånger sortimentet använts PÅ TRAKTEN (`traktAnvandning`, per nyckel), sedan
 * senaste 12 månaderna (historiken), sist ordningen listan redan hade (skördat störst först / objektets ordning). Stabil sortering.
 */
export function ordnaMestAnvanda(
  rader: readonly SortimentRad[],
  traktAnvandning: ReadonlyMap<string, number> | null | undefined,
  historik: readonly HistorikSortiment[] | null | undefined,
): SortimentRad[] {
  const hist = new Map((historik ?? []).map((h) => [h.nyckel, h.antal]));
  const pa = (r: SortimentRad) => traktAnvandning?.get(r.nyckel) ?? 0;
  const tolv = (r: SortimentRad) => hist.get(r.nyckel) ?? 0;
  return rader.map((r, i) => ({ r, i })).sort((a, b) => pa(b.r) - pa(a.r) || tolv(b.r) - tolv(a.r) || a.i - b.i).map((x) => x.r);
}

/** Hur ofta varje sortiment (nyckel) använts på trakten: rader i lass som räknas (bara bekräftade) + Opti-lassens rader. */
export function traktAnvandning(
  lass: ReadonlyArray<{ status: string; bekraftadAv?: string | null; delar: ReadonlyArray<{ rader: ReadonlyArray<{ nyckel: string }> }> }>,
  optiNamn: ReadonlyArray<string> = [],
): Map<string, number> {
  const per = new Map<string, number>();
  const plus = (nyckel: string) => per.set(nyckel, (per.get(nyckel) ?? 0) + 1);
  for (const l of lass) { if (l.status !== 'bekraftat' || l.bekraftadAv === 'auto') continue; for (const d of l.delar) for (const r of d.rader) plus(r.nyckel); }
  for (const namn of optiNamn) if (namn) plus(sortimentNyckel(namn));
  return per;
}

export function sortimentVal(i: {
  skordat: readonly SkordatSortiment[] | null;
  objekt: readonly (string | null | undefined)[] | null;
  historik: readonly HistorikSortiment[] | null;
  /** Hur ofta sortimentet använts på trakten (se `traktAnvandning`). */
  traktAnvandning?: ReadonlyMap<string, number> | null;
}): SortimentVal {
  const sk = i.skordat ?? [];
  const harMarkagarVed = sk.some((s) => s.nyckel === VED_MARKAGARE_NYCKEL);
  const skordatRader = valbaraSortiment(sk, harMarkagarVed);
  // Skördat räknas bara om det finns ett riktigt sortiment (inte bara "Unclassified"/markägarens ved som ensam rad av ingenting).
  const harSkordat = sk.some((s) => !arOklassat(s.nyckel));
  const objektRader = objektSortimentRader(i.objekt);
  const historikRader = historikSortimentRader(i.historik);
  const ved: SortimentRad[] = [{ nyckel: VED_MARKAGARE_NYCKEL, namn: VED_MARKAGARE_NAMN, m3: 0 }];
  const [forst, kalla]: [SortimentRad[], SortimentKalla] = harSkordat
    ? [skordatRader, 'skordat']
    : objektRader.length
      ? [objektRader, 'objekt']
      : historikRader.length ? [historikRader, 'historik'] : [[], 'ingen'];
  const primara = ordnaMestAnvanda(forst, i.traktAnvandning, i.historik);
  return { primara, alla: utanDubbletter([primara, skordatRader, objektRader, historikRader, ved]), kalla };
}
