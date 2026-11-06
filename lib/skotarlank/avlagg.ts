// Skotarlänken: avläggen och lassen som den externa skotaren rapporterar. Ren — ingen databas, ingen karta.
//
// Ett avlägg är ett av tre: hans eget (satt via länken, `egen:<id>`), planerarens (avläggssymbol, `plan:<markeringens id>`) eller Vidas (`vida:<nummer>`).
// Lassen sparas mot avläggets nyckel med m³ per sortiment. Volymen per avlägg = summan av lassen som inte är strukna.

import { svgToLatLon, type Origo } from '@/lib/kartkoordinater';

export type LngLat = [number, number];
export type AvlaggKalla = 'egen' | 'plan' | 'vida';
export type Avlagg = {
  /** nyckeln lassen sparas mot */
  ref: string;
  kalla: AvlaggKalla;
  /** det som står på kartan och i kortet ("2", "01-1") */
  nr: string;
  lng: number;
  lat: number;
  lass: number;
  m3: number;
  /** m³ per sortiment (nyckeln = skördarens namn), störst först */
  sortiment: { namn: string; m3: number }[];
  /** senaste lassen, nyast först (högst 10) */
  senaste: { id: string; m3: number; tid: string }[];
};

export type EgetAvlaggRad = { id: string; nummer: number; lat: number; lng: number; borttagen?: boolean };
export type LassRad = { id: string; avlagg: string; sortiment: unknown; struken?: boolean; skapad_at: string };

/** Ett lass sortiment: bara positiva tal under taket, nycklar som text. Tomt = inget giltigt. */
export const LASS_MAX_M3 = 60;
export function rensaSortiment(v: unknown): Record<string, number> {
  const ut: Record<string, number> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return ut;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const n = Number(x);
    if (typeof k === 'string' && k.trim() && k.length <= 120 && Number.isFinite(n) && n > 0 && n <= LASS_MAX_M3) ut[k] = Math.round(n * 10) / 10;
  }
  return ut;
}

const avr = (n: number) => Math.round(n * 10) / 10;

/** Alla avlägg på trakten med det som rapporterats till dem. Planerarens kräver ett origo (annars går de inte att placera). */
export function byggAvlagg(i: {
  egna: readonly EgetAvlaggRad[];
  markeringar: readonly Record<string, unknown>[];
  origo: Origo | null;
  vida: readonly { geometry: any; properties: Record<string, unknown> }[];
  lass: readonly LassRad[];
}): Avlagg[] {
  const lista: Omit<Avlagg, 'lass' | 'm3' | 'sortiment' | 'senaste'>[] = [];
  for (const e of i.egna) if (!e.borttagen) lista.push({ ref: `egen:${e.id}`, kalla: 'egen', nr: String(e.nummer), lng: e.lng, lat: e.lat });
  if (i.origo) {
    for (const m of i.markeringar) {
      if (m.type !== 'landing' || m.id == null || typeof m.x !== 'number' || typeof m.y !== 'number') continue;
      const ll = svgToLatLon(m.x, m.y, i.origo);
      const nr = m.nummer ?? m.avlaggNummer;
      lista.push({ ref: `plan:${String(m.id)}`, kalla: 'plan', nr: nr != null && String(nr).trim() ? String(nr).trim() : '', lng: ll.lng, lat: ll.lat });
    }
  }
  for (const f of i.vida) {
    const p = f.properties ?? {};
    const c = f.geometry?.coordinates;
    if (p._typ !== 'punkt' || f.geometry?.type !== 'Point' || !Array.isArray(c)) continue;
    const nr = String(p.EXTRA_LABE ?? p.LOPNR ?? '').trim();
    if (!nr) continue;
    lista.push({ ref: `vida:${nr}`, kalla: 'vida', nr, lng: c[0], lat: c[1] });
  }
  type Per = { lass: number; m3: number; s: Map<string, number>; senaste: { id: string; m3: number; tid: string }[] };
  const per = new Map<string, Per>();
  const ordnade = [...i.lass].filter((l) => !l.struken).sort((a, b) => String(b.skapad_at).localeCompare(String(a.skapad_at)));
  for (const l of ordnade) {
    const s = rensaSortiment(l.sortiment);
    const sum = Object.values(s).reduce((a, b) => a + b, 0);
    const p: Per = per.get(l.avlagg) ?? { lass: 0, m3: 0, s: new Map(), senaste: [] };
    p.lass++; p.m3 += sum;
    for (const [k, v] of Object.entries(s)) p.s.set(k, (p.s.get(k) ?? 0) + v);
    if (p.senaste.length < 10) p.senaste.push({ id: l.id, m3: avr(sum), tid: l.skapad_at });
    per.set(l.avlagg, p);
  }
  return lista.map((a) => {
    const p = per.get(a.ref);
    return {
      ...a,
      lass: p?.lass ?? 0,
      m3: avr(p?.m3 ?? 0),
      sortiment: p ? [...p.s].map(([namn, m3]) => ({ namn, m3: avr(m3) })).sort((x, y) => y.m3 - x.m3) : [],
      senaste: p?.senaste ?? [],
    };
  });
}

/** Nästa nummer för ett eget avlägg: efter det högsta heltal som redan står på något avlägg (så "2" aldrig finns två gånger). */
export function nastaNummer(avlagg: readonly Pick<Avlagg, 'nr'>[], egna: readonly EgetAvlaggRad[]): number {
  let max = 0;
  for (const a of avlagg) if (/^\d+$/.test(a.nr)) max = Math.max(max, Number(a.nr));
  for (const e of egna) max = Math.max(max, e.nummer);
  return max + 1;
}

/** Sortimenten att välja i lasskortet: skördarens på trakten, störst först. */
export function lassSortiment(stammar: readonly { volym: number; sortiment: string | null }[]): string[] {
  const m = new Map<string, number>();
  for (const s of stammar) if (s.sortiment && s.sortiment.trim()) m.set(s.sortiment, (m.get(s.sortiment) ?? 0) + (s.volym || 0));
  return [...m].sort((a, b) => b[1] - a[1]).map(([n]) => n);
}
