// PLANERA — dagen som DELAR. Ren logik (ingen databas, ingen React), testad i dag.test.ts.
//
// Martins verkliga fall (2026-10-04): han startar planering på Odenssvalahult 07:00, går över till manuellt arbete,
// åker en stund till Betet — och glömmer att byta eller avsluta. På kvällen står hela dagen som en planering.
// Det han behöver är inte att byta live (det kommer han inte göra) utan att KLIPPA OCH RÄTTA dagen i efterhand.
//
// Modell: en dag är en lista DELAR som täcker tiden från första start till sista slut utan hål:
//   Planering · Odenssvalahult · 07:00–10:00
//   Rast · 10:00–10:30
//   Manuellt · Odenssvalahult · 10:30–13:00
//   Manuellt · Betet · 13:00–16:00
// Varje arbetsdel blir en egen rad i extra_tid. RASTEN är en del med tider i redigeraren men sparas som LUCKAN mellan
// raderna — ingen rad, ingen rast_min (EN rastmodell, se logik.ts). Därför är arbetad tid = summan av arbetsdelarna.
import { debFor, DAGENS_SLUT, KVART, RAST_FRAN_MIN, RAST_MAX_MIN, arPlaneraTyp, kvartNed, kvartUpp, klockaTillMin, liggerIFramtiden, minTillKlocka, type PeriodRad } from "./logik";
import { klassificeraPeriod } from "@/lib/dagsegment";
import type { AktivitetTyp } from "@/lib/aktiviteter";

/** rast = obetald lucka som tolkas som rast (≤ 3 tim). lucka = längre lucka ("Ej inlagd tid") — låst, sparas inte. */
export type DelTyp = AktivitetTyp | "rast" | "lucka";
export type DagDel = {
  nyckel: string;          // stabil nyckel i gränssnittet
  radId: string | null;    // extra_tid.id om delen redan finns i databasen
  start: number;           // minuter från midnatt
  slut: number;
  typ: DelTyp;
  objektId: string | null;
  deb: boolean;
  kommentar: string;
  last: boolean;           // låst: rad som Planera inte hanterar (service, reparation …) eller lång lucka — syns men ändras inte
};

const hhmm = (t: string | null | undefined) => (t || "").slice(0, 5);
export const arArbete = (d: DagDel) => d.typ !== "rast" && d.typ !== "lucka";
const arArbeteRedigerbar = (d: DagDel) => arArbete(d) && !d.last;

/** Dagens stängda rader → delar. Luckor mellan rader blir rast (≤ 3 tim, redigerbar) eller "lucka" (längre, låst). */
export function delarFranRader(rader: PeriodRad[]): DagDel[] {
  const rs = rader.filter(r => r.start_tid && r.slut_tid).sort((a, b) => hhmm(a.start_tid).localeCompare(hhmm(b.start_tid)));
  const ut: DagDel[] = [];
  let slutForr: number | null = null;
  for (const r of rs) {
    const start = klockaTillMin(r.start_tid as string), slut = klockaTillMin(r.slut_tid as string);
    if (slut <= start) continue;
    if (slutForr != null && start > slutForr) {
      const glapp = start - slutForr;
      ut.push({ nyckel: `g:${slutForr}`, radId: null, start: slutForr, slut: start, typ: glapp <= RAST_MAX_MIN ? "rast" : "lucka", objektId: null, deb: false, kommentar: "", last: glapp > RAST_MAX_MIN });
    }
    const planera = arPlaneraTyp(r.aktivitet_typ);
    ut.push({
      nyckel: `r:${r.id}`, radId: r.id, start, slut, typ: (planera ? r.aktivitet_typ : (r.aktivitet_typ || "annat")) as AktivitetTyp,
      objektId: r.objekt_id, deb: !!r.debiterbar, kommentar: r.kommentar || "", last: !planera,
    });
    slutForr = Math.max(slutForr ?? 0, slut);
  }
  return ut;
}

/** En ny, ledig nyckel (n:1, n:2 …). */
export function nyNyckel(delar: DagDel[]): string {
  let n = 1;
  while (delar.some(d => d.nyckel === `n:${n}`)) n++;
  return `n:${n}`;
}

/** Vilken trakt en ny del ska få som förval: delen som klipps, eller — om den är en rast — närmaste arbetsdel före
 *  (annars efter). Förval, aldrig ett krav: föraren kan byta. */
export function traktForNyDel(delar: DagDel[], nyckel: string): string | null {
  const i = delar.findIndex(d => d.nyckel === nyckel);
  if (i < 0) return null;
  if (arArbete(delar[i]) && delar[i].objektId) return delar[i].objektId;
  for (let j = i - 1; j >= 0; j--) if (arArbete(delar[j]) && delar[j].objektId) return delar[j].objektId;
  for (let j = i + 1; j < delar.length; j++) if (arArbete(delar[j]) && delar[j].objektId) return delar[j].objektId;
  return null;
}

/** Slå ihop på varandra följande rastdelar till en. */
function slaIhopRast(delar: DagDel[]): DagDel[] {
  const ut: DagDel[] = [];
  for (const d of delar) {
    const f = ut[ut.length - 1];
    if (f && f.typ === "rast" && d.typ === "rast" && !f.last && !d.last && f.slut === d.start) ut[ut.length - 1] = { ...f, slut: d.slut };
    else ut.push(d);
  }
  return ut;
}

/** KLIPP: dela delen `nyckel` vid `tid`. Första halvan behåller delen; den andra blir en NY del av vald typ
 *  (vilken aktivitet som helst, eller rast) på samma trakt om inte annat anges. null om det inte går. */
export function klippDel(delar: DagDel[], nyckel: string, tid: number, ny: { typ: DelTyp; objektId?: string | null }): DagDel[] | null {
  const i = delar.findIndex(d => d.nyckel === nyckel);
  if (i < 0) return null;
  const d = delar[i];
  if (d.last || tid <= d.start || tid >= d.slut) return null;
  const typ: DelTyp = ny.typ === "lucka" ? "rast" : ny.typ;
  const arbete = typ !== "rast";
  const del2: DagDel = {
    nyckel: nyNyckel(delar), radId: null, start: tid, slut: d.slut, typ,
    objektId: arbete ? (ny.objektId !== undefined ? ny.objektId : d.objektId) : null,
    deb: arbete ? debFor(typ as AktivitetTyp) : false, kommentar: "", last: false,
  };
  const ut = [...delar];
  ut[i] = { ...d, slut: tid };
  ut.splice(i + 1, 0, del2);
  return slaIhopRast(ut);
}

/** Flytta gränsen mellan del i och del i+1 till `tid` (båda delar behåller minst en minut). */
export function flyttaGrans(delar: DagDel[], i: number, tid: number): DagDel[] | null {
  const a = delar[i], b = delar[i + 1];
  if (!a || !b || a.last || b.last) return null;
  if (tid <= a.start || tid >= b.slut) return null;
  const ut = [...delar];
  ut[i] = { ...a, slut: tid };
  ut[i + 1] = { ...b, start: tid };
  return ut;
}

/** Flytta dagens allra första start eller allra sista slut. */
function flyttaKant(delar: DagDel[], kant: "start" | "slut", tid: number): DagDel[] | null {
  const i = kant === "start" ? 0 : delar.length - 1;
  const d = delar[i];
  if (!d || d.last) return null;
  if (kant === "start" ? (tid < 0 || tid >= d.slut) : (tid <= d.start || tid > DAGENS_SLUT)) return null;
  const ut = [...delar];
  ut[i] = kant === "start" ? { ...d, start: tid } : { ...d, slut: tid };
  return ut;
}

/** Sätt delens start/slut. Gränsen mot grannen flyttar med, så det aldrig blir hål eller krockar. */
export function sattStart(delar: DagDel[], i: number, tid: number): DagDel[] | null {
  return i === 0 ? flyttaKant(delar, "start", tid) : flyttaGrans(delar, i - 1, tid);
}
export function sattSlut(delar: DagDel[], i: number, tid: number): DagDel[] | null {
  return i === delar.length - 1 ? flyttaKant(delar, "slut", tid) : flyttaGrans(delar, i, tid);
}

/** Ett kvartssteg på delens start eller slut. Står tiden mellan två kvartar snappar första trycket till kvarten.
 *  `tak`: senaste tillåtna slut (idag: nu). null om steget inte går. */
export function stappaDel(delar: DagDel[], i: number, kant: "start" | "slut", riktning: -1 | 1, tak: number): DagDel[] | null {
  const d = delar[i];
  if (!d) return null;
  const nu = kant === "start" ? d.start : d.slut;
  const ny = riktning < 0 ? (nu % KVART ? kvartNed(nu) : nu - KVART) : (nu % KVART ? kvartUpp(nu) : nu + KVART);
  if (kant === "slut" && i === delar.length - 1 && ny > tak) return null;
  if (kant === "slut" && i < delar.length - 1 && ny > tak) return null;
  const r = kant === "start" ? sattStart(delar, i, ny) : sattSlut(delar, i, ny);
  return r ? slaIhopRast(r) : null;
}

/** TA BORT en del. Tiden går till föregående ARBETSdel (annars nästa); finns ingen blir den rast (obetald) — den
 *  försvinner aldrig tyst och tiden hamnar aldrig hos en rast. Den enda delen: [] (hela perioden tas bort). */
export function taBortDel(delar: DagDel[], nyckel: string): DagDel[] | null {
  const i = delar.findIndex(d => d.nyckel === nyckel);
  if (i < 0) return null;
  const d = delar[i];
  if (d.last) return null;
  if (delar.length === 1) return [];
  const fore = delar[i - 1], efter = delar[i + 1];
  if (fore && arArbeteRedigerbar(fore)) {
    const ut = delar.filter((_, j) => j !== i);
    ut[i - 1] = { ...fore, slut: d.slut };
    return slaIhopRast(ut);
  }
  if (efter && arArbeteRedigerbar(efter)) {
    const ut = delar.filter((_, j) => j !== i);
    ut[i] = { ...efter, start: d.start };
    return slaIhopRast(ut);
  }
  const ut = [...delar];
  ut[i] = { ...d, typ: "rast", objektId: null, deb: false, kommentar: "", radId: d.radId };
  return slaIhopRast(ut);
}

/** Byt typ på en del (arbete ↔ rast). Rast har varken trakt, fakturering eller kommentar. */
export function bytTyp(delar: DagDel[], nyckel: string, typ: DelTyp): DagDel[] {
  const ut = delar.map(d => {
    if (d.nyckel !== nyckel || d.last) return d;
    if (typ === "rast") return { ...d, typ, objektId: null, deb: false, kommentar: "" };
    return { ...d, typ, deb: debFor(typ as AktivitetTyp) };
  });
  return slaIhopRast(ut);
}

export function andraDel(delar: DagDel[], nyckel: string, andring: Partial<Pick<DagDel, "objektId" | "deb" | "kommentar">>): DagDel[] {
  return delar.map(d => (d.nyckel === nyckel && !d.last ? { ...d, ...andring } : d));
}

/** Arbetad tid = summan av arbetsdelarna (rast och luckor räknas inte). */
export const arbetadMin = (delar: DagDel[]) => delar.reduce((s, d) => s + (arArbete(d) ? d.slut - d.start : 0), 0);
export const harRast = (delar: DagDel[]) => delar.some(d => !arArbete(d));
export const spannMin = (delar: DagDel[]) => (delar.length ? delar[delar.length - 1].slut - delar[0].start : 0);
/** Dagen är längre än 5 tim och ingen rast är satt → Spara frågar "Hade du rast?" (ett aktivt val, aldrig en gissning). */
export const behovFragaRast = (delar: DagDel[]) => spannMin(delar) > RAST_FRAN_MIN && !harRast(delar);

/** Samma kontroller som sparandet (och servern gör om dem): inte efter nu, inte inne i/korsande ett maskinpass,
 *  varje arbetsdel har en trakt och minst en minut. Returnerar första felet eller null. */
export function valideraDelar(delar: DagDel[], ctx: { datum: string; pass: { start_tid: string | null; slut_tid: string | null }; nu: Date }): string | null {
  for (const d of delar) {
    if (d.last || !arArbete(d)) continue;
    const text = `${minTillKlocka(d.start)}–${minTillKlocka(d.slut)}`;
    if (d.slut <= d.start) return `Delen ${text} måste sluta efter att den börjar.`;
    if (!d.objektId) return `Välj trakt för delen ${text}.`;
    if (liggerIFramtiden(ctx.datum, d.slut, ctx.nu)) return `Delen ${text} ligger i framtiden — inget sparat. Spara den när tiden har varit.`;
    const lage = klassificeraPeriod({ start: minTillKlocka(d.start), slut: minTillKlocka(d.slut) }, ctx.pass);
    const passText = `${hhmm(ctx.pass.start_tid)}–${hhmm(ctx.pass.slut_tid)}`;
    if (lage === "inne") return `Delen ${text} ligger inom maskinpasset (${passText}) och är redan arbetstid. Perioder inom passet märks under Dag eller Kalender.`;
    if (lage === "korsar") return `Delen ${text} korsar maskinpassets gräns (${passText}). Dela upp den i en före och en efter passet.`;
  }
  return null;
}

export type Skrivplan = { radera: string[]; uppdatera: { id: string; del: DagDel }[]; infoga: DagDel[] };
/** Vad som ska skrivas för att databasen ska bli som delarna: ta bort rader som inte längre är arbetsdelar (rast och
 *  borttagna delar), uppdatera rader som ändrats, lägg in nya delar. Rader Planera inte hanterar rörs aldrig. */
export function skrivplan(gamla: PeriodRad[], delar: DagDel[]): Skrivplan {
  const arbete = delar.filter(d => arArbete(d) && !d.last);
  const behall = new Set(arbete.filter(d => d.radId).map(d => d.radId as string));
  const radera = gamla.filter(r => arPlaneraTyp(r.aktivitet_typ) && !behall.has(r.id)).map(r => r.id);
  const uppdatera: { id: string; del: DagDel }[] = [];
  for (const d of arbete) {
    if (!d.radId) continue;
    const r = gamla.find(x => x.id === d.radId);
    if (!r) continue;
    const lika = hhmm(r.start_tid) === minTillKlocka(d.start) && hhmm(r.slut_tid) === minTillKlocka(d.slut)
      && (r.objekt_id || null) === (d.objektId || null) && r.aktivitet_typ === d.typ && !!r.debiterbar === d.deb
      && (r.kommentar || "").trim() === d.kommentar.trim() && !((r.rast_min ?? 0) > 0);
    if (!lika) uppdatera.push({ id: d.radId, del: d });
  }
  const infoga = arbete.filter(d => !d.radId);
  return { radera, uppdatera, infoga };
}

/** Ordningen skrivningarna körs i så att två delar aldrig överlappar ens tillfälligt (en rad som ska växa in i
 *  tid som en annan rad lämnar måste vänta på den). Raderingar först. Returnerar null om ingen ordning finns. */
export function ordnaSkrivningar(gamla: PeriodRad[], plan: Skrivplan): ({ typ: "radera"; id: string } | { typ: "uppdatera"; id: string; del: DagDel } | { typ: "infoga"; del: DagDel })[] | null {
  const intervall = new Map<string, [number, number]>();
  for (const r of gamla) {
    if (!r.start_tid) continue;
    intervall.set(r.id, [klockaTillMin(r.start_tid), r.slut_tid ? klockaTillMin(r.slut_tid) : DAGENS_SLUT]);
  }
  const ut: ReturnType<typeof ordnaSkrivningar> = [];
  for (const id of plan.radera) { ut!.push({ typ: "radera", id }); intervall.delete(id); }
  type Op = { typ: "uppdatera"; id: string; del: DagDel } | { typ: "infoga"; del: DagDel };
  const vantar: Op[] = [...plan.uppdatera.map(u => ({ typ: "uppdatera" as const, id: u.id, del: u.del })), ...plan.infoga.map(d => ({ typ: "infoga" as const, del: d }))];
  let nyId = 0;
  while (vantar.length) {
    const k = vantar.findIndex(op => {
      const sjalv = op.typ === "uppdatera" ? op.id : null;
      for (const [id, [s, e]] of Array.from(intervall.entries())) {
        if (id === sjalv) continue;
        if (op.del.start < e && s < op.del.slut) return false;
      }
      return true;
    });
    if (k < 0) return null;
    const op = vantar.splice(k, 1)[0];
    ut!.push(op);
    intervall.set(op.typ === "uppdatera" ? op.id : `ny-${nyId++}`, [op.del.start, op.del.slut]);
  }
  return ut;
}

export { RAST_FRAN_MIN };
