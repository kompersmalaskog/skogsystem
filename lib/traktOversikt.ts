// ÖVERBLICK NÄR MASKINEN BÖRJAR PÅ EN TRAKT (Martin 2026-11-04, efter Stefan i Giant: "när han börjar på ett objekt vill han få helheten
// av avverkningen, samlat på ett ställe, utan att trycka runt på kartan").
//
// Första gången en maskin öppnar en trakt visas överblicken av sig själv: kartan visar hela trakten och panelen säger allt på EN sida —
// faror, Vidas direktiv och planerarens text, det som avviker inför jobbet (band, ved, manuell fällning …) och vad som finns utmärkt.
// "Börja köra" stänger den och sparar vad som setts. Ändrar planeraren något efteråt kommer den tillbaka — och det nya är märkt "Nytt".
// Den går alltid att öppna igen via "Visa hela trakten" på förarens kort. Allt tryck på kartan fungerar som förut.
//
// Ren logik + enhetens minne (localStorage, per maskin och trakt). Inget sparas i databasen.

import type { SammanfattningRad } from './klarTrakt';

export interface SignaturIndata {
  /** Planeringens markeringar (symboler, linjer, ytor, pilar). */
  markers: ReadonlyArray<{ id: string | number; type?: string | null; lineType?: string | null; zoneType?: string | null; comment?: string | null; photoPath?: string | null }>;
  /** Kartkommentarernas id:n (de skrivna kommentarerna). */
  kommentarIds: readonly string[];
  /** Kartkommentarerna med text — en ändrad text är ny (ersätter id-formen för de som står här). */
  kommentarer?: ReadonlyArray<{ id: string; text: string }>;
  /** Vidas direktiv och planerarens text. */
  texter: readonly string[];
  /** Det som avviker inför jobbet (band, ved …). */
  infor: readonly SammanfattningRad[];
}

const kort = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
};

/** En kartkommentar: id + texten (en ändrad text är ny). */
export const kommentarSig = (id: string, text: string): string => `k:${id}:${kort(String(text ?? '').trim())}`;

/** En signatur per sak som kan vara ny. Samma innehåll ger samma signatur; ändras en kommentar eller ett foto blir det en ny. */
export function markeringSignatur(m: SignaturIndata['markers'][number]): string {
  const typ = m.type ?? m.lineType ?? m.zoneType ?? '';
  return `m:${m.id}:${kort(`${typ}|${String(m.comment ?? '').trim()}|${m.photoPath ?? ''}`)}`;
}

export function signaturer(i: SignaturIndata): string[] {
  const ut: string[] = [];
  for (const m of i.markers) ut.push(markeringSignatur(m));
  for (const k of i.kommentarIds) ut.push(`k:${k}`);
  for (const k of i.kommentarer ?? []) ut.push(kommentarSig(k.id, k.text));
  for (const t of i.texter) if (t.trim()) ut.push(`t:${kort(t.trim())}`);
  for (const r of i.infor) ut.push(`i:${r.id}:${kort(r.text)}`);
  return ut.sort();
}

// ── Enhetens minne ────────────────────────────────────────────────────────────────────────────────────────────────────
const NYCKEL = 'trakt_oversikt_sett_v1';
const nyckel = (maskinId: string, objektId: string) => `${NYCKEL}:${maskinId}:${objektId}`;

/** Vad maskinen har sett av trakten. null = aldrig sett (eller minnet går inte att läsa) — då visas överblicken. */
export function lasSett(maskinId: string, objektId: string, lager: Pick<Storage, 'getItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null): Set<string> | null {
  try {
    const r = lager?.getItem(nyckel(maskinId, objektId));
    if (!r) return null;
    const a = JSON.parse(r);
    return Array.isArray(a) ? new Set(a.filter((x) => typeof x === 'string')) : null;
  } catch { return null; }
}

export function sparaSett(maskinId: string, objektId: string, sig: readonly string[], lager: Pick<Storage, 'setItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null): void {
  try { lager?.setItem(nyckel(maskinId, objektId), JSON.stringify([...sig])); } catch { /* privat läge: visas igen nästa gång */ }
}

/** Ska överblicken visas av sig själv? Aldrig sett, eller något nytt sedan sist. Något som tagits bort räknas inte. */
export function behoverVisas(sett: ReadonlySet<string> | null, sig: readonly string[]): boolean {
  if (!sett) return true;
  return sig.some((s) => !sett.has(s));
}

/**
 * Är ALLT som är nytt sedan föraren senast hade läst trakten hans EGET — symboler han själv satt eller kommentarer han själv skrivit?
 * Då ska överblicken inte öppnas för honom (Martin 2026-11-13, Oskar: "när han sätter ut symboler kommer inforutan upp direkt igen").
 * En enda ny sak från någon annan (planeraren, en annan förare, Vida) → false: då ska den öppnas som vanligt.
 */
export function baraEgetNytt(forra: ReadonlySet<string> | null, sig: readonly string[], egnaMarkeringar: ReadonlySet<string>, egnaKommentarer: ReadonlySet<string>): boolean {
  if (!forra) return false;
  const nya = sig.filter((s) => !forra.has(s));
  if (nya.length === 0) return false;
  return nya.every((s) => {
    const d = s.split(':');
    return (d[0] === 'm' && egnaMarkeringar.has(d[1])) || (d[0] === 'k' && egnaKommentarer.has(d[1]));
  });
}

/** Markeringarna som är nya sedan maskinen såg trakten (tom när den aldrig setts — då är allt "nytt" och inget märks). */
export function nyaMarkeringar(sett: ReadonlySet<string> | null, markers: SignaturIndata['markers'], kommentarer: ReadonlyArray<{ id: string; nyckel: string; text?: string }> = []): Set<string> {
  const ut = new Set<string>();
  if (!sett) return ut;
  for (const m of markers) if (!sett.has(markeringSignatur(m))) ut.add(String(m.id));
  for (const k of kommentarer) {
    const kand = k.text != null ? kommentarSig(k.id, k.text) : `k:${k.id}`;
    if (sett.has(kand)) continue;
    if (k.nyckel.startsWith('marker:')) ut.add(k.nyckel.slice('marker:'.length));
    else { ut.add(k.nyckel); ut.add(`vida-yta:${k.nyckel}`); }
  }
  return ut;
}

/** En kartkommentar som är ny sedan föraren läste trakten (id). Tom när trakten aldrig lästs. */
export function nyaKommentarer(sett: ReadonlySet<string> | null, kommentarer: ReadonlyArray<{ id: string; text: string }>): Set<string> {
  const ut = new Set<string>();
  if (!sett) return ut;
  for (const k of kommentarer) if (!sett.has(kommentarSig(k.id, k.text))) ut.add(k.id);
  return ut;
}

export const textNy = (sett: ReadonlySet<string> | null, text: string): boolean => !!sett && !!text.trim() && !sett.has(`t:${kort(text.trim())}`);

// ── Vad som visas ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** Inför jobbet = bara det som AVVIKER (Martin: "inget om det är normalt"). Avlägg, basväg, terräng och avstånd är inga avvikelser. */
const AVVIKER = new Set(['band-skordare', 'band-skotare', 'manuell', 'ved', 'ris', 'breddat', 'vagn', 'trailer', 'avlagg-hugga', 'basvagsanlaggning', 'konfiguration']);
export function inforJobbet(rader: readonly SammanfattningRad[]): SammanfattningRad[] {
  return rader.filter((r) => AVVIKER.has(r.id) || (r.id === 'barighet' && r.text !== 'Bra'));
}

/** "Slutavverkning · PEFC · 2,5 ha" — bara det som finns. */
export function oversiktUnder(typ: string | null, cert: readonly string[], arealHa: number | null): string {
  const delar = [typ?.trim() || null, cert.length ? cert.join(' och ') : null, arealHa != null && arealHa > 0 ? `${arealHa.toFixed(1).replace('.', ',')} ha` : null];
  return delar.filter(Boolean).join(' · ');
}

const st = (n: number, en: string, flera: string) => `${n} ${n === 1 ? en : flera}`;

/** EN mening överst: "2 faror · 3 saker inför jobbet · 24 saker på kartan, 5 med text". */
export function oversiktMening(i: { faror: number; infor: number; paKartan: number; medText: number }): string {
  const d: string[] = [];
  d.push(i.faror > 0 ? st(i.faror, 'fara', 'faror') : 'Inga faror');
  if (i.infor > 0) d.push(`${st(i.infor, 'sak', 'saker')} inför jobbet`);
  if (i.paKartan > 0) d.push(`${st(i.paKartan, 'sak', 'saker')} på kartan${i.medText > 0 ? `, ${i.medText} med text` : ''}`);
  return d.join(' · ');
}

// ── Kvittot (Martin 2026-11-05: "första gången ska det vara bekräftelse på att han har tagit del av allt") ──────────────
/** Fingeravtrycket föraren kvitterar ("Jag har läst allt") i trakt_risk_last — skiljs från riskbedömningens med prefixet. Ändras något är det ett nytt underlag. */
export const OVERSIKT_PREFIX = 'oversikt:';
export function oversiktUnderlag(sig: readonly string[]): string {
  return `${OVERSIKT_PREFIX}${kort([...sig].sort().join('|'))}`;
}
/** Har den här föraren läst exakt det här innehållet? */
export function harLastOversikt(kvitton: ReadonlyArray<{ medarbetareId: string; underlag: string }>, medarbetareId: string | null, underlag: string): boolean {
  return !!medarbetareId && kvitton.some((k) => k.medarbetareId === medarbetareId && k.underlag === underlag);
}

// ── Certifieringens rad: det ni redan satt ut, i ord ──────────────────────────────────────────────────────────────────
export interface CertMiljo { id: string; antal: number; krav: number | null }
const ORD: Record<string, [string, string]> = { evighetstrad: ['evighetsträd', 'evighetsträd'], hogstubbar: ['högstubbe', 'högstubbar'] };
const ordFor = (id: string, n: number) => (ORD[id] ? (n === 1 ? ORD[id][0] : ORD[id][1]) : id);

/**
 * "PEFC: alla 26 evighetsträd och 8 högstubbar är utsatta – spara dem." / "PEFC: 18 av 26 evighetsträd utsatta – 8 till behövs."
 * Talen är markeringarna på kartan (lib/miljokrav), aldrig något nytt. Utan cert eller utan krav: null.
 */
export function certRad(cert: readonly string[], miljo: readonly CertMiljo[]): { text: string; klar: boolean } | null {
  if (cert.length === 0) return null;
  const namn = cert.join(' och ');
  const ordning = ['evighetstrad', 'hogstubbar'];
  const rader = ordning.map((id) => miljo.find((m) => m.id === id)).filter((m): m is CertMiljo => !!m && m.krav != null && m.krav > 0);
  if (rader.length === 0) return null;
  const saknas = rader.filter((m) => m.antal < (m.krav as number));
  if (saknas.length === 0) {
    const delar = rader.map((m) => `${m.antal} ${ordFor(m.id, m.antal)}`);
    const alla = rader.length > 1 || rader[0].antal > 1 ? 'alla ' : '';
    return { text: `${namn}: ${alla}${delar.join(' och ')} är utsatta – spara dem.`, klar: true };
  }
  const delar = saknas.map((m) => `${m.antal} av ${m.krav} ${ordFor(m.id, m.krav as number)} utsatta – ${(m.krav as number) - m.antal} till behövs`);
  return { text: `${namn}: ${delar.join('. ')}.`, klar: false };
}

// ── Certifieringen: står alltid, också när trakten inte är certifierad (Martin 2026-11-12) ─────────────────────────────
/** cert = FSC/PEFC; ingen = uttryckligen inte certifierad ("Ej certifierad", "None", "Nej"); okand = uppgiften saknas ("Not known", tomt). */
export interface CertLage { lage: 'cert' | 'ingen' | 'okand'; namn: string }
export function certLage(cert: string | null | undefined, typer: readonly string[]): CertLage {
  if (typer.length) return { lage: 'cert', namn: typer.join(' och ') };
  const t = String(cert ?? '').trim().toLowerCase();
  if (/^(ej\b|inte\b|nej$|none$|ingen)/.test(t)) return { lage: 'ingen', namn: '' };
  return { lage: 'okand', namn: '' };
}

// ── Skyddade områden ur traktanalysen ─────────────────────────────────────────────────────────────────────────────────
const SKYDD_NAMN: Record<string, string> = {
  vattenskydd: 'Vattenskyddsområde', fornlamning: 'Fornlämning', nyckelbiotop: 'Nyckelbiotop', biotopskydd: 'Biotopskydd',
  naturreservat: 'Naturreservat', natura2000: 'Natura 2000', strandskydd: 'Strandskydd',
};
export interface SkyddRad { namn: string; text: string | null }
/**
 * 'inte' = traktanalysen har aldrig körts (säg det — aldrig "inget hittat"); 'inga' = körd, inget hittat; annars en rad per fynd.
 */
export function skyddadeOmraden(restr: ReadonlyArray<{ type?: string; name?: string; warning?: string; details?: string }> | null | undefined, analyserad: boolean): { lage: 'inte' | 'inga' | 'finns'; rader: SkyddRad[] } {
  if (!analyserad) return { lage: 'inte', rader: [] };
  const rader = (restr ?? []).map((r) => {
    const typ = SKYDD_NAMN[String(r.type ?? '')] ?? (String(r.type ?? '').trim() || 'Skyddat område');
    const namn = String(r.name ?? '').trim();
    const text = String(r.warning ?? r.details ?? '').trim() || null;
    return { namn: namn && namn !== typ ? `${typ} · ${namn}` : typ, text };
  });
  return { lage: rader.length ? 'finns' : 'inga', rader };
}

// ── Utan text: en rad, inga tal att tolka ─────────────────────────────────────────────────────────────────────────────
/** "4 basvägar · 1 avlägg · 3 blött" — sorterna som INTE har någon text. Tom = ingen rad. */
export function utanTextRad(sorter: ReadonlyArray<{ namn: string; antal: number }>): string {
  return sorter.filter((s) => s.antal > 0).map((s) => `${s.namn} ${s.antal}`).join(' · ');
}
