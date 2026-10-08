// Faror och hänsyn ur planering_markeringar för /oversikt-v2 — LÄSNINGEN, som ren logik (klienten injiceras; Node-importerbar,
// testas i markeringar-las.test.ts).
//
// Regeln som allt här bygger på: "ingen" får bara visas när en läsning LYCKADES och gav 0 faror/hänsyn för objektet. En läsning som
// felar (statement timeout, nätverk, fel i svaret, inget svar alls) är OKÄND — aldrig "ingen". Varje objekt har därför tre lägen:
//   ok     = läst utan fel (tom ObjWarn = 0 faror/hänsyn)       → raderna får säga "ingen"
//   fel    = läsningen misslyckades, även efter nytt försök      → orange "Kunde inte läsa faror och hänsyn — kolla planeringen"
//   laddar = ännu inte läst (eller läsningen pågår)              → "–" / "Läser …"
//
// Frågan läser BARA de fem JSON-nycklar som klassningen och kommentaren behöver (aldrig hela `data`: den bar base64-foto i vissa rader
// och gav statement timeout), för en liten bit objekt i taget (`in`), sorterat på unik nyckel och sidat över PostgREST:s radgräns.
// En bit som felar läses om objekt för objekt — ETT trasigt eller tungt objekt tar inte med sig de andra.

import { STATUS_AVSLUTADE } from '../oversikt/oversikt-types';
import { byggVarningar, type MarkeringRow, type ObjWarn } from './objekt-info';

export const VARNING_LASFEL = 'Kunde inte läsa faror och hänsyn — kolla planeringen';
export const VARNING_LADDAR = 'Läser faror och hänsyn…';
/** Kolumnerna som läses: ids och de fem JSON-nycklarna — aldrig `data` i sin helhet. */
export const MARKERING_KOLUMNER = 'id, objekt_id, typ, t:data->>type, z:data->>zoneType, l:data->>lineType, a:data->>arrowType, c:data->>comment';

/** Det en rad i en sheet får veta om ett objekts faror/hänsyn: läst (ObjWarn, kan vara tom), misslyckad eller ännu inte läst. */
export type VarningsSvar = ObjWarn | 'fel' | 'laddar';
export interface VarningsLage { ok: Record<string, ObjWarn>; fel: Record<string, true> }
export interface VarningsLasning { ok: Record<string, ObjWarn>; fel: string[] }
export const TOMT_LAGE: VarningsLage = { ok: {}, fel: {} };

/** Så lite av supabase-klienten som behövs — ingen import av den, så modulen går att köra i Node och mot en fake. */
type Sb = { from: (tabell: string) => any };
interface ProjRad { objekt_id: string | null; typ?: string | null; t: string | null; z: string | null; l: string | null; a: string | null; c: string | null }

/** Projicerad rad (t/z/l/a/c = type/zoneType/lineType/arrowType/comment) → samma form som resten av koden läser (`data.type` …). */
export const tillMarkeringRad = (r: ProjRad): MarkeringRow => ({ objekt_id: r.objekt_id, typ: r.typ ?? null, data: { type: r.t, zoneType: r.z, lineType: r.l, arrowType: r.a, comment: r.c } });

/** Objekten som ska läsas direkt vid sidladdning: alla utom avslutade/klara. De övriga läses först när ett ark öppnas för dem. */
export const objektAttLasaForst = (objekt: { id: string; status: string }[]): string[] =>
  objekt.filter((o) => !STATUS_AVSLUTADE.includes(o.status)).map((o) => o.id);

/** Vad som får visas för objektet: läst → faror/hänsyn (kan vara tomma), misslyckad → 'fel', annars 'laddar'. ALDRIG en tom ObjWarn för okänt. */
export function varningFor(lage: VarningsLage, objektId: string): VarningsSvar {
  const ok = lage.ok[objektId];
  if (ok) return ok;
  return lage.fel[objektId] ? 'fel' : 'laddar';
}

/** Lägg in ett läsresultat. En lyckad läsning ersätter allt äldre (och rensar ett tidigare fel); ett fel skriver ALDRIG över något som lästes lyckat. */
export function slaIhop(lage: VarningsLage, res: VarningsLasning): VarningsLage {
  const ok = { ...lage.ok, ...res.ok };
  const fel: Record<string, true> = { ...lage.fel };
  for (const id of Object.keys(res.ok)) delete fel[id];
  for (const id of res.fel) if (!ok[id]) fel[id] = true;
  return { ok, fel };
}

function medTidsgrans<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`inget svar inom ${ms} ms`)), ms);
    Promise.resolve(p).then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}
function bitar<T>(lista: T[], storlek: number): T[][] {
  const ut: T[][] = [];
  for (let i = 0; i < lista.length; i += storlek) ut.push(lista.slice(i, i + storlek));
  return ut;
}
/** Kör uppgifterna med högst n åt gången. */
async function samtidigt(uppgifter: Array<() => Promise<void>>, n: number): Promise<void> {
  let nasta = 0;
  await Promise.all(Array.from({ length: Math.min(n, uppgifter.length) }, async () => {
    while (nasta < uppgifter.length) { const i = nasta++; await uppgifter[i](); }
  }));
}

/** EN bit objekt, alla sidor. Kastar vid fel, vid ett svar som inte är en lista och när inget svar kommer. */
async function lasBit(sb: Sb, ids: string[], sida: number, tidsgrans: number): Promise<MarkeringRow[]> {
  const rader: MarkeringRow[] = [];
  for (let fran = 0; ; fran += sida) {
    const svar: any = await medTidsgrans(
      sb.from('planering_markeringar').select(MARKERING_KOLUMNER).in('objekt_id', ids).order('id').range(fran, fran + sida - 1), tidsgrans);
    if (svar?.error) throw new Error(`${svar.error.code ?? ''} ${svar.error.message ?? 'läsfel'}`.trim());
    if (!Array.isArray(svar?.data)) throw new Error('svaret saknar data');
    for (const r of svar.data as ProjRad[]) rader.push(tillMarkeringRad(r));
    if (svar.data.length < sida) return rader;
  }
}

export interface LasOpt {
  /** Objekt per fråga (10). */ bit?: number;
  /** Rader per sida (1000 = PostgREST:s tak). */ sida?: number;
  /** Millisekunder utan svar innan en fråga räknas som misslyckad. */ tidsgrans?: number;
  /** Väntan före omläsningen av ett enskilt objekt (transienta fel). */ omforsokMs?: number;
  /** Ersätts i tester. */ vanta?: (ms: number) => Promise<void>;
}

/**
 * Läs faror och hänsyn för objekten. Kastar ALDRIG: varje objekt hamnar i `ok` (läst, kan vara tomt) eller `fel` (misslyckades även efter
 * ett nytt försök). Frågor: en per bit av 10 objekt (4 samtidigt); felar en bit läses dess objekt om ett och ett (5 samtidigt) —
 * högst bitar + objekt frågor, aldrig en loop.
 */
export async function lasVarningar(sb: Sb, objektIds: string[], opt: LasOpt = {}): Promise<VarningsLasning> {
  const bit = opt.bit ?? 10, sida = opt.sida ?? 1000, tidsgrans = opt.tidsgrans ?? 15000;
  const vanta = opt.vanta ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const ids = Array.from(new Set(objektIds.filter((x) => typeof x === 'string' && x.length > 0)));
  const ok: Record<string, ObjWarn> = {};
  const fel: string[] = [];
  const lagg = (delIds: string[], rader: MarkeringRow[]) => {
    const per = byggVarningar(rader);
    for (const id of delIds) ok[id] = per[id] ?? { faror: [], hansyn: [] };   // läst utan fel och inga faror/hänsyn = "ingen"
  };
  const enskilt = async (id: string) => {
    await vanta(opt.omforsokMs ?? 300);
    try { lagg([id], await lasBit(sb, [id], sida, tidsgrans)); }
    catch (e) { console.error('[Översikt v2] markeringar: objektet gick inte att läsa', id, e); fel.push(id); }
  };
  const delLas = async (delIds: string[]) => {
    try { lagg(delIds, await lasBit(sb, delIds, sida, tidsgrans)); }
    catch (e) {
      console.error('[Översikt v2] markeringar: läsningen av en bit gav fel, läser om objekt för objekt', e);
      await samtidigt(delIds.map((id) => () => enskilt(id)), 5);
    }
  };
  await samtidigt(bitar(ids, bit).map((d) => () => delLas(d)), 4);
  return { ok, fel };
}
