// Servern för besökssidan /besok/<token>. Allt här körs med SERVICE-klienten (ingen anon-åtkomst till tabellerna) och lämnar ut EXAKT de fält sidan visar:
// traktens namn, utförare, framsteg i procent, traktgränsen, maskinernas SENASTE position med roll (aldrig förare, aldrig spår, aldrig volymer), motorsågsplatser och
// markägarens egen anmälan med kvitteringar. Ingen annan data passerar.
//
// Ren från Next (ingen NextResponse): rutterna är tunna och returnerar `{ status, body }` härifrån, så reglerna kan testas utan nätverk.

import type { SupabaseClient } from '@supabase/supabase-js';
import { beslutaOrigo, lasVidaGrans, markeringsGranser, markeringsPunkter } from '@/lib/egenkontrollOrigo';
import { svgToLatLon } from '@/lib/kartkoordinater';
import { hamtaAltNummer, hogarObjektIds } from '@/lib/objektNummer';
import { idagStockholm } from '@/lib/grotvy/format';
import { besokNamn } from './namn';
import { BESOK_MAX_PER_TIMME, BESOK_RING_M, MASKIN_FERSK_MIN, TOKEN_MIN_TECKEN } from './konstanter';
import { arGiltigtToken } from './offentlig';
import { KLART_CA_FORKLARING, beraknaFramsteg, framstegText, utforareText, type DagVolym } from './framsteg';
import { arKlockslag, arRimligBesokstid, besokstid, type TidVal } from './tid';
import type { MaskinRoll } from './sakerhet';

type Sb = SupabaseClient;
export type Svar = { status: number; body: Record<string, unknown> };

const FEL = (status: number, fel: string): Svar => ({ status, body: { ok: false, fel } });

// ---- Länken ---------------------------------------------------------------------------------------------------------------------------------

type ObjektRad = { id: string; namn: string; vo_nummer: string | null; status: string | null; bolag: string | null; lat: number | null; lng: number | null; kartbild_bounds: unknown; volym: number | null; dim_objekt_id: string | null; fastighetsbeteckning: string | null };

export type LankUtfall = { ok: true; objekt: ObjektRad } | { ok: false; skal: 'okand' | 'avstangd' | 'avslutat' | 'fel'; meddelande?: string };

const AVSLUTAD = (s: string | null) => s === 'avslutat' || s === 'klar';

export async function slaUppLank(sb: Sb, token: string): Promise<LankUtfall> {
  if (!arGiltigtToken(token)) return { ok: false, skal: 'okand' };
  const l = await sb.from('objekt_besok_lank').select('objekt_id, aktiv').eq('token', token).maybeSingle();
  if (l.error) return { ok: false, skal: 'fel', meddelande: l.error.message };
  if (!l.data) return { ok: false, skal: 'okand' };
  if (!(l.data as { aktiv: boolean }).aktiv) return { ok: false, skal: 'avstangd' };
  const o = await sb.from('objekt').select('id, namn, vo_nummer, status, bolag, lat, lng, kartbild_bounds, volym, dim_objekt_id, fastighetsbeteckning').eq('id', (l.data as { objekt_id: string }).objekt_id).maybeSingle();
  if (o.error) return { ok: false, skal: 'fel', meddelande: o.error.message };
  if (!o.data) return { ok: false, skal: 'okand' };
  const objekt = o.data as ObjektRad;
  if (AVSLUTAD(objekt.status)) return { ok: false, skal: 'avslutat' };
  return { ok: true, objekt };
}

/** Lankfel → svar. Samma text till alla utom "okänd" (som är ett 404 utan förklaring: en gissad token ska inte lära sig något). */
export function lankFelSvar(u: Extract<LankUtfall, { ok: false }>): Svar {
  if (u.skal === 'okand') return FEL(404, 'Länken finns inte');
  if (u.skal === 'avstangd') return FEL(410, 'Länken är avstängd');
  if (u.skal === 'avslutat') return FEL(410, 'Arbetet på trakten är avslutat');
  return FEL(503, 'Kunde inte läsa just nu');
}

// ---- Cache (best effort, per serverinstans) -------------------------------------------------------------------------------------------------

const cache = new Map<string, { ts: number; v: unknown }>();
async function cachad<T>(nyckel: string, ttlMs: number, f: () => Promise<T>, nu = Date.now()): Promise<T> {
  const e = cache.get(nyckel);
  if (e && nu - e.ts < ttlMs) return e.v as T;
  const v = await f();
  cache.set(nyckel, { ts: nu, v });
  if (cache.size > 200) for (const k of Array.from(cache.keys()).slice(0, 50)) cache.delete(k);
  return v;
}
export const rensaBesokCache = () => cache.clear();

// ---- Tung del: traktgräns, motorsåg, framsteg (cachas) --------------------------------------------------------------------------------------

type Pos = { lat: number; lng: number };
type Tung = { gran: [number, number][][] | null; motorsag: Pos[]; harMotorsag: boolean; framsteg: { procent: number | null; klartCa: string | null } };

async function tungDel(sb: Sb, o: ObjektRad, nu: Date): Promise<Tung> {
  const vida = await lasVidaGrans(sb, o.id);
  const gran = vida.typ === 'ok' && vida.ringar && vida.ringar.length ? vida.ringar : null;

  // Motorsåg: manuell fällning-symbolerna. Placeras med SAMMA origobeslut som egenkontrollen — kan origot inte styrkas ritas ingen ring (men raden "Någon fäller med motorsåg" finns kvar).
  let motorsag: Pos[] = [];
  let harMotorsag = false;
  const m = await sb.from('planering_markeringar').select('typ, data').eq('objekt_id', o.id);
  if (!m.error && Array.isArray(m.data)) {
    const rader = m.data as { typ: string | null; data: Record<string, unknown> | null }[];
    const fall = rader.filter((r) => (r.typ ?? (r.data as { type?: string } | null)?.type) === 'manualfelling');
    harMotorsag = fall.length > 0;
    if (harMotorsag) {
      const beslut = beslutaOrigo({ objekt: { lat: o.lat, lng: o.lng, kartbild_bounds: o.kartbild_bounds }, punkter: markeringsPunkter(rader), granser: markeringsGranser(rader), vida });
      if (beslut.ok) {
        motorsag = fall.flatMap((r) => {
          const d = r.data ?? {};
          const x = Number((d as { x?: unknown }).x), y = Number((d as { y?: unknown }).y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
          const ll = svgToLatLon(x, y, beslut.origo);
          return [{ lat: ll.lat, lng: ll.lng }];
        });
      }
    }
  }

  // Framsteg: volymer summeras av databasen (besok_volymer) och lämnar aldrig servern. Går funktionen inte att anropa (migrationen ej körd) utelämnas framsteget — ärligt tomt.
  let framsteg: Tung['framsteg'] = { procent: null, klartCa: null };
  try {
    const alt = await hamtaAltNummer(sb, o.id);
    const ids = Array.from(new Set([...(o.vo_nummer ? hogarObjektIds(o.vo_nummer, alt) : []), ...(o.dim_objekt_id ? [o.dim_objekt_id] : [])]));
    if (ids.length) {
      const v = await sb.rpc('besok_volymer', { p_objekt: o.id, p_ids: ids });
      if (!v.error && Array.isArray(v.data)) {
        const rader = v.data as { kalla: string; datum: string; m3: number | string }[];
        const dagar = (kalla: string): DagVolym[] => rader.filter((r) => r.kalla === kalla).map((r) => ({ datum: String(r.datum).slice(0, 10), m3: Number(r.m3) }));
        const sk = dagar('skordat'), st = dagar('skotat');
        const summa = (d: DagVolym[]) => d.reduce((s, x) => s + (Number.isFinite(x.m3) ? x.m3 : 0), 0);
        framsteg = beraknaFramsteg({ planeradM3: o.volym, skordatM3: sk.length ? summa(sk) : null, skotatM3: summa(st), skordatPerDag: sk, skotatPerDag: st, idag: idagStockholm(nu) });
      }
    }
  } catch { /* framsteget utelämnas */ }

  return { gran, motorsag, harMotorsag, framsteg };
}

// ---- Maskinerna på trakten (hyttspårets SENASTE punkt per roll) -----------------------------------------------------------------------------

export type PublikMaskin = { roll: MaskinRoll; lat: number; lng: number; tid: string };

export async function maskinerPaTrakten(sb: Sb, objektId: string, nu: Date): Promise<PublikMaskin[]> {
  const idag = idagStockholm(nu);
  const igar = idagStockholm(new Date(nu.getTime() - 86400000));
  const r = await sb.from('hyttspar').select('roll, datum, points, uppdaterad_at').eq('objekt_id', objektId).gte('datum', igar).lte('datum', idag);
  if (r.error || !Array.isArray(r.data)) return [];
  const senast = new Map<MaskinRoll, PublikMaskin>();
  for (const rad of r.data as { roll: string; points: unknown }[]) {
    if (rad.roll !== 'skordare' && rad.roll !== 'skotare') continue;
    const pts = Array.isArray(rad.points) ? (rad.points as { lat?: unknown; lng?: unknown; tid?: unknown }[]) : [];
    const p = pts[pts.length - 1];
    if (!p) continue;
    const lat = Number(p.lat), lng = Number(p.lng), t = typeof p.tid === 'string' ? Date.parse(p.tid) : NaN;
    if (![lat, lng, t].every(Number.isFinite)) continue;
    if (nu.getTime() - t > MASKIN_FERSK_MIN * 60000 || t - nu.getTime() > 5 * 60000) continue;
    const gammal = senast.get(rad.roll);
    if (!gammal || Date.parse(gammal.tid) < t) senast.set(rad.roll, { roll: rad.roll, lat, lng, tid: new Date(t).toISOString() });
  }
  return Array.from(senast.values()).sort((a, b) => (a.roll < b.roll ? -1 : 1));
}

// ---- Markägarens egen anmälan ---------------------------------------------------------------------------------------------------------------

export type PublikBesok = { id: string; besokstid: string; kvitteringar: { roll: MaskinRoll; tid: string }[] };

export async function minAnmalan(sb: Sb, objektId: string, besokId: string | null | undefined): Promise<PublikBesok | null> {
  if (!besokId || !/^[0-9a-f-]{36}$/i.test(besokId)) return null;
  const b = await sb.from('objekt_besok').select('id, besokstid').eq('id', besokId).eq('objekt_id', objektId).maybeSingle();
  if (b.error || !b.data) return null;
  const k = await sb.from('objekt_besok_kvittens').select('roll, kvitterad_at').eq('besok_id', besokId);
  const kv = !k.error && Array.isArray(k.data) ? (k.data as { roll: string | null; kvitterad_at: string }[]).filter((x) => x.roll === 'skordare' || x.roll === 'skotare').map((x) => ({ roll: x.roll as MaskinRoll, tid: x.kvitterad_at })) : [];
  const d = b.data as { id: string; besokstid: string };
  return { id: d.id, besokstid: d.besokstid, kvitteringar: kv };
}

// ---- GET /api/besok/<token> ---------------------------------------------------------------------------------------------------------------

export async function publikVy(sb: Sb, token: string, opt: { besokId?: string | null; nu?: Date } = {}): Promise<Svar> {
  const nu = opt.nu ?? new Date();
  const u = await slaUppLank(sb, token);
  if (!u.ok) return lankFelSvar(u);
  const o = u.objekt;
  const [tung, maskiner, besok] = await Promise.all([
    cachad(`tung:${o.id}`, 5 * 60000, () => tungDel(sb, o, nu), nu.getTime()),
    maskinerPaTrakten(sb, o.id, nu),
    minAnmalan(sb, o.id, opt.besokId),
  ]);
  const roller = maskiner.map((m) => m.roll);
  return {
    status: 200,
    body: {
      ok: true,
      namn: besokNamn(o.namn, o.vo_nummer, o.fastighetsbeteckning),
      utforare: utforareText(o.bolag),
      framsteg: { procent: tung.framsteg.procent, klartCa: tung.framsteg.klartCa, text: framstegText(tung.framsteg), forklaring: tung.framsteg.klartCa ? KLART_CA_FORKLARING : null },
      gran: tung.gran,
      mitt: o.lat != null && o.lng != null ? { lat: o.lat, lng: o.lng } : null,
      maskiner,
      roller,
      motorsag: tung.motorsag,
      harMotorsag: tung.harMotorsag,
      ringM: BESOK_RING_M,
      uppdaterad: nu.toISOString(),
      besok,
    },
  };
}

// ---- POST /api/besok/<token>/anmal --------------------------------------------------------------------------------------------------------

const STYRTECKEN = /[\u0000-\u001f\u007f]/g;
export const rensaNamn = (s: unknown): string => (typeof s === 'string' ? s.replace(STYRTECKEN, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) : '');
export function rensaTelefon(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.replace(/[^\d+\s-]/g, '').replace(/\s+/g, ' ').trim();
  const siffror = t.replace(/\D/g, '');
  return siffror.length >= 6 && siffror.length <= 15 && t.length <= 30 ? t : null;
}

export function tolkaTidVal(b: Record<string, unknown>): TidVal | null {
  if (b.nar === 'nu') return { val: 'nu' };
  if (b.nar === 'om1h') return { val: 'om1h' };
  if (b.nar === 'tid' && arKlockslag(b.tid)) return { val: 'tid', tid: String(b.tid).trim() };
  return null;
}

export async function skapaAnmalan(sb: Sb, token: string, body: unknown, nu: Date = new Date()): Promise<Svar> {
  const u = await slaUppLank(sb, token);
  if (!u.ok) return lankFelSvar(u);
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const namn = rensaNamn(b.namn);
  const telefon = rensaTelefon(b.telefon);
  const val = tolkaTidVal(b);
  if (!namn) return FEL(400, 'Skriv ditt namn');
  if (!telefon) return FEL(400, 'Skriv ett telefonnummer vi kan nå dig på');
  if (!val) return FEL(400, 'Välj när du kommer');
  const tid = besokstid(val, nu);
  if (!tid || !arRimligBesokstid(tid, nu)) return FEL(400, 'Välj en tid de närmaste dygnen');

  // Skydd mot översvämning: högst BESOK_MAX_PER_TIMME anmälningar per objekt och timme.
  const sedan = new Date(nu.getTime() - 3600000).toISOString();
  const c = await sb.from('objekt_besok').select('id', { count: 'exact', head: true }).eq('objekt_id', u.objekt.id).gte('skapad_at', sedan);
  if (c.error) return FEL(503, 'Kunde inte spara just nu');
  if ((c.count ?? 0) >= BESOK_MAX_PER_TIMME) return FEL(429, 'För många anmälningar just nu — försök igen om en stund');

  const ins = await sb.from('objekt_besok').insert({ objekt_id: u.objekt.id, namn, telefon, besokstid: tid }).select('id, besokstid').single();
  if (ins.error || !ins.data) return FEL(503, 'Kunde inte spara just nu');
  return { status: 200, body: { ok: true, id: (ins.data as { id: string }).id, besokstid: (ins.data as { besokstid: string }).besokstid } };
}

export { TOKEN_MIN_TECKEN };

/** Är länken fortfarande giltig? Kort cache (60 s) så att en karta med tjugo rutor inte gör tjugo uppslag. */
export async function lankGiltig(sb: Sb, token: string, nu = Date.now()): Promise<boolean> {
  if (!arGiltigtToken(token)) return false;
  return cachad(`giltig:${token}`, 60000, async () => (await slaUppLank(sb, token)).ok, nu);
}
