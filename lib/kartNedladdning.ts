// "Ladda ner trakten" (Martin 2026-11-02): kartrutorna runt trakten sparas i enheten så kartan kommer direkt — också utan täckning.
//
//   • Vad: Lantmäteriets tre bakgrunder (Flygfoto, Karta, Topokarta) + höjddatan (3D-terräng). OpenStreetMap ALDRIG — deras regler förbjuder
//     att appar hämtar kartbilder i förväg och de spärrar appar som gör det.
//   • Var: Cache Storage `KART_CACHE`. Service workern (public/sw.js) svarar på samma adresser ur cachen först, så MapLibre får rutan direkt.
//     Nyckeln är EXAKT adressen kartan begär — därför bor mallarna här och planeringssidan läser dem härifrån (`KARTRUTA_MALL`).
//   • När: när trakten öppnas, på bra nät (inte "spara data", inte 2G). Redan sparat = inget hämtas igen.
//   • Hur mycket: traktgränsen + `MARGINAL_M`; Flygfoto upp till zoom 18, kartorna till 17, höjddatan till 15. Blir det fler än `MAX_RUTOR`
//     tas den högsta zoomen bort först (Flygfoto 17 är fortfarande skarpt nog på skärmen). De `MAX_TRAKTER` senaste trakterna sparas; äldre rensas.
//   • I BAKGRUNDEN (Tesla: föraren gör ingenting): maskinen tar sin trakt och de två nästa i sin kö, planeraren alla pågående och planerade —
//     bara på wifi/kabel (`bakgrundNat`) och bara med gott om plats (`nogPlats`). En trakt som inte längre behövs och inte öppnats på
//     `RENSA_EFTER_DAGAR` tas bort.

export const KART_CACHE = 'kartrutor-v1';

/** Adresserna kartan begär rutorna på. Planeringssidans källor använder EXAKT de här (annars hittar service workern dem inte i cachen). */
export const KARTRUTA_MALL = {
  satellite: '/api/forarkarta?layer=ortofoto&z={z}&x={x}&y={y}',
  lantmateriet: '/api/forarkarta?z={z}&x={x}&y={y}',
  topographic: '/api/forarkarta?layer=farg&z={z}&x={x}&y={y}',
  terrang: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
} as const;

type Lager = keyof typeof KARTRUTA_MALL;
const ZOOM: Record<Lager, [number, number]> = {
  satellite: [13, 18],
  lantmateriet: [13, 17],
  topographic: [13, 17],
  terrang: [11, 15],
};

export const MARGINAL_M = 300;
export const MAX_RUTOR = 1500;
export const MAX_TRAKTER = 20;

export interface Bbox { vast: number; syd: number; ost: number; nord: number }

/** Rutorna (x, y) som täcker bboxen på zoom z (Web Mercator / XYZ). */
export function rutorFor(b: Bbox, z: number): { x: number; y: number }[] {
  const n = 2 ** z;
  const lon2x = (lon: number) => Math.floor(((lon + 180) / 360) * n);
  const lat2y = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  };
  const x0 = Math.max(0, lon2x(b.vast)), x1 = Math.min(n - 1, lon2x(b.ost));
  const y0 = Math.max(0, lat2y(b.nord)), y1 = Math.min(n - 1, lat2y(b.syd));
  const ut: { x: number; y: number }[] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) ut.push({ x, y });
  return ut;
}

/** Bboxen + marginal i meter. */
export function medMarginal(b: Bbox, m = MARGINAL_M): Bbox {
  const dLat = m / 111_320;
  const dLon = m / (111_320 * Math.cos((((b.syd + b.nord) / 2) * Math.PI) / 180));
  return { vast: b.vast - dLon, ost: b.ost + dLon, syd: b.syd - dLat, nord: b.nord + dLat };
}

/** Alla rutadresser för trakten. Fler än `max` → högsta zoomen bort först, lager för lager, tills det ryms. */
export function planeraRutor(trakt: Bbox, max = MAX_RUTOR): string[] {
  const b = medMarginal(trakt);
  const tak: Record<Lager, number> = { satellite: ZOOM.satellite[1], lantmateriet: ZOOM.lantmateriet[1], topographic: ZOOM.topographic[1], terrang: ZOOM.terrang[1] };
  const bygg = () => {
    const ut: string[] = [];
    for (const l of Object.keys(KARTRUTA_MALL) as Lager[]) {
      for (let z = ZOOM[l][0]; z <= tak[l]; z++) {
        for (const { x, y } of rutorFor(b, z)) ut.push(KARTRUTA_MALL[l].replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)));
      }
    }
    return ut;
  };
  let ut = bygg();
  // Ta bort den högsta zoomen där den är högst först (Flygfoto 18 → kartorna 17 → …), aldrig under lagrets lägsta.
  while (ut.length > max) {
    const hogst = (Object.keys(tak) as Lager[]).filter((l) => tak[l] > ZOOM[l][0] && l !== 'terrang').sort((a, c) => tak[c] - tak[a])[0];
    if (!hogst) break;
    tak[hogst]--;
    ut = bygg();
  }
  return ut;
}

/** Traktens bbox ur Vidas traktgräns (L_TRAKTDEL). Saknas den: null (vi gissar inte en yta ur en punkt). */
export function traktBbox(fc: { features?: any[] } | null | undefined): Bbox | null {
  let vast = Infinity, ost = -Infinity, syd = Infinity, nord = -Infinity;
  const ta = (c: any): void => {
    if (typeof c?.[0] === 'number') {
      const [lon, lat] = c;
      if (lon < vast) vast = lon; if (lon > ost) ost = lon; if (lat < syd) syd = lat; if (lat > nord) nord = lat;
    } else if (Array.isArray(c)) c.forEach(ta);
  };
  for (const f of fc?.features ?? []) if (f?.properties?._lager === 'L_TRAKTDEL') ta(f.geometry?.coordinates);
  return Number.isFinite(vast) ? { vast, ost, syd, nord } : null;
}

/** Bbox runt en punkt (objekt utan traktgräns, t.ex. ett privat jobb): `halv` meter åt varje håll. */
export function punktBbox(lat: number, lon: number, halv = 400): Bbox {
  return medMarginal({ vast: lon, ost: lon, syd: lat, nord: lat }, halv);
}

/** Bra nät att ladda ner på: online, inte "spara data", inte 2G. Okänd anslutning räknas som bra (iOS säger inget). */
export function braNat(nav: { onLine?: boolean; connection?: { saveData?: boolean; effectiveType?: string } } | undefined): boolean {
  if (!nav || nav.onLine === false) return false;
  const c = nav.connection;
  if (c?.saveData) return false;
  if (c?.effectiveType === '2g' || c?.effectiveType === 'slow-2g') return false;
  return true;
}

// ── Minnet av vilka trakter som är sparade (per enhet) ───────────────────────────────────────────────────────────────
export const META_NYCKEL = 'kart_nedladdad_v1';
/** `ts` = när rutorna hämtades (färskhet), `oppnad` = när trakten senast öppnades (rensning). */
export interface TraktMeta { id: string; bbox: Bbox; ts: number; antal: number; oppnad?: number }

export function lasMeta(lager: Pick<Storage, 'getItem'> | null): TraktMeta[] {
  try { const v = JSON.parse(lager?.getItem(META_NYCKEL) ?? '[]'); return Array.isArray(v) ? v.filter((m) => m && typeof m.id === 'string' && m.bbox) : []; } catch { return []; }
}
export function sparaMeta(lager: Pick<Storage, 'setItem'> | null, meta: TraktMeta[]): void {
  try { lager?.setItem(META_NYCKEL, JSON.stringify(meta)); } catch { /* fullt eller avstängt — då laddas trakten ner igen nästa gång */ }
}

/** Lägger trakten först. Ger de som ska rensas (fler än `max`). */
export function medTrakt(meta: TraktMeta[], ny: TraktMeta, max = MAX_TRAKTER): { meta: TraktMeta[]; rensa: TraktMeta[] } {
  const alla = [ny, ...meta.filter((m) => m.id !== ny.id)];
  return { meta: alla.slice(0, max), rensa: alla.slice(max) };
}

/** Text i ⓘ. null = ingen rad (nedladdning stöds inte, eller inget att säga). */
export type NedladdningLage = { lage: 'av' } | { lage: 'laddar'; klara: number; totalt: number } | { lage: 'klar' } | { lage: 'fel' };
export function nedladdningText(l: NedladdningLage): string | null {
  if (l.lage === 'klar') return 'Kartan sparad i enheten ✓';
  if (l.lage === 'laddar') return `Sparar kartan i enheten … ${l.totalt ? Math.floor((100 * l.klara) / l.totalt) : 0} %`;
  if (l.lage === 'fel') return 'Kartan kunde inte sparas – försöker igen nästa gång';
  return null;
}

// ── Bakgrunden: vilka trakter, på vilket nät, med hur mycket plats ────────────────────────────────────────────────────
export const KO_FRAMAT = 2;              // maskinen: trakten den står på + så många till i sin kö
export const RENSA_EFTER_DAGAR = 14;     // en trakt som inte behövs längre och inte öppnats på så länge tas bort
export const MIN_LEDIGT_BYTES = 500 * 1024 * 1024;
export const MAX_ANDEL_ANVANT = 0.6;

export interface KoRad { objekt_id: string; ordning: number | null }

/** Vilka trakter som ska finnas i enheten. Maskinen: den öppna + de närmaste i kön. Planeraren: alla pågående och planerade. */
export function onskadeTrakter(p: { roll: 'maskin' | 'planerare' | null; oppen: string | null; ko: KoRad[]; aktiva: string[] }): string[] {
  const ut: string[] = [];
  const lagg = (id: string | null | undefined) => { if (id && !ut.includes(id)) ut.push(id); };
  if (p.roll === 'maskin') {
    lagg(p.oppen);
    const sorterad = [...p.ko].sort((a, b) => (a.ordning ?? 1e9) - (b.ordning ?? 1e9));
    for (const k of sorterad) { if (ut.length >= 1 + KO_FRAMAT) break; lagg(k.objekt_id); }
  } else if (p.roll === 'planerare') {
    lagg(p.oppen);
    for (const id of p.aktiva) lagg(id);
  }
  return ut;
}

/**
 * Nät för bakgrunden (mycket data): bara wifi eller kabel. Vet webbläsaren inte vilket nät det är (Safari, Chrome på dator)
 * räcker bra nät på en dator eller maskindator — aldrig på en telefon, där det kan vara mobildata.
 */
export function bakgrundNat(nav: { onLine?: boolean; userAgent?: string; maxTouchPoints?: number; connection?: { type?: string; saveData?: boolean; effectiveType?: string } } | undefined, arMaskin: boolean): boolean {
  if (!braNat(nav as any)) return false;
  const typ = nav?.connection?.type;
  if (typ) return typ === 'wifi' || typ === 'ethernet';
  if (arMaskin) return true;
  const ua = nav?.userAgent ?? '';
  const telefon = /iPhone|iPod|Android.+Mobile|Mobile Safari/i.test(ua);
  return !telefon;
}

/** Gott om plats: minst `MIN_LEDIGT_BYTES` kvar och högst `MAX_ANDEL_ANVANT` av det webbläsaren ger appen. Vet vi inte: ja. */
export function nogPlats(e: { usage?: number; quota?: number } | null | undefined): boolean {
  if (!e || !e.quota) return true;
  const anv = e.usage ?? 0;
  return e.quota - anv >= MIN_LEDIGT_BYTES && anv / e.quota <= MAX_ANDEL_ANVANT;
}

/** Trakter i minnet som inte behövs längre och inte öppnats på `RENSA_EFTER_DAGAR`. */
export function attRensa(meta: TraktMeta[], onskade: string[], nu: number): string[] {
  return meta.filter((m) => !onskade.includes(m.id) && nu - Math.max(m.ts, m.oppnad ?? 0) > RENSA_EFTER_DAGAR * 86_400_000).map((m) => m.id);
}
