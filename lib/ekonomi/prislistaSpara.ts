// Prislistans spar-orkestrering — ren och testbar (ingen React).
//
// TVÅ BUGGAR LÖSTA HÄR, båda "man tror att något är sparat som inte är det":
//
// 1) TYST DATAFÖRLUST: ett spar anropade en global omladdning som skrev
//    över ALLA sektioner från databasen — osparade ändringar på andra rader
//    (och i andra sektioner) försvann. Nu:
//    - "smutsig" HÄRLEDS ur en ögonblicksbild av det som laddades (bas*),
//      aldrig en klibbig flagga som kan glömmas — och en ändring som sätts
//      tillbaka räknas inte längre som ändrad;
//    - sparAllaSmutsiga sparar ALLA smutsiga rader i sektionen i ett svep och
//      fortsätter förbi fel (ett fel avbryter aldrig resten);
//    - slaIhopEfterSpar laddar om FRÅN databasen men behåller rader som
//      misslyckades (smutsiga, med felmarkering) — bara det som landade ersätts.
//
// 2) FÖRVAL SER UT SOM SPARAT: värdeminskningens förval (400/300) visades som
//    ifyllt värde fast databasen hade NULL — och en Spara skrev in förvalet
//    som om någon valt det. NULL är nu ett eget tillstånd: tomt fält med
//    förslaget som placeholder. Motorn räknar ingen värdeminskning på NULL
//    (lib/ekonomi/vardeminskning), så vyn säger det: "ej satt — räknas inte".
//
// Versionskontraktet är orört: all versionering går genom saveOneByKey/
// saveAllBracket/saveFormelConfig (lib/ekonomi/prisversion) och dim_maskin
// genom uppdateraVerifierat med värde-återläsning, exakt som förut. Enda
// skillnaden i NÄR det skrivs: en maskins timpris-version skrivs bara om
// timpris/namn faktiskt ändrats (förut skapades en ny version, med
// giltig_fran = idag, även när bara värdeminskningen ändrats — och en
// omförsök efter delvis fel skulle ha stängt dagens egen rad med ett
// omvänt datumintervall).

import type { SupabaseClient } from '@supabase/supabase-js';
import { saveOneByKey } from '@/lib/ekonomi/prisversion';
import { uppdateraVerifierat } from '@/lib/supabase-save';

export type Num = number | '';
export function numOrNull(v: Num | null | undefined): number | null {
  return v === '' || v === null || v === undefined ? null : Number(v);
}

export type RadResultat = { ok: true } | { ok: false; fel: string };

// ── Generisk orkestrering ───────────────────────────────────────────────

/**
 * Spara ALLA smutsiga rader, en i taget. Ett fel (även ett kastat) avbryter
 * aldrig resten — de misslyckade returneras med sitt felmeddelande.
 */
export async function sparaAllaSmutsiga<T>(
  rader: T[],
  arSmutsig: (r: T) => boolean,
  spara: (r: T) => Promise<RadResultat>,
): Promise<{ antalSmutsiga: number; lyckade: T[]; misslyckade: { rad: T; fel: string }[] }> {
  const smutsiga = rader.filter(arSmutsig);
  const lyckade: T[] = [];
  const misslyckade: { rad: T; fel: string }[] = [];
  for (const rad of smutsiga) {
    let res: RadResultat;
    try {
      res = await spara(rad);
    } catch (e: any) {
      res = { ok: false, fel: e?.message || 'okänt fel' };
    }
    if (res.ok) lyckade.push(rad); else misslyckade.push({ rad, fel: res.fel });
  }
  return { antalSmutsiga: smutsiga.length, lyckade, misslyckade };
}

/** "3 maskiner sparade" / "2 sparade, 1 misslyckades — se markerade rader". */
export function sparaSammanfattning(
  lyckade: number, misslyckade: number, singular: string, plural: string,
): { text: string; fel: boolean } {
  if (lyckade === 0 && misslyckade === 0) return { text: 'Inga ändringar att spara', fel: false };
  if (misslyckade === 0) {
    return { text: `${lyckade} ${lyckade === 1 ? singular : plural} ${lyckade === 1 ? 'sparad' : 'sparade'}`, fel: false };
  }
  const forsta = lyckade === 0 ? 'Ingen sparades' : `${lyckade} sparade`;
  return { text: `${forsta}, ${misslyckade} misslyckades — se markerade rader`, fel: true };
}

/**
 * Efter ett spar: den NYLADDADE listan (databasens sanning) men med de
 * misslyckade lokala raderna kvar — smutsiga, med sitt felmeddelande. Rader
 * som landade ersätts av databasens version. `rebase` flyttar den lokala
 * radens bas till databasens (eller tom bas för en helt ny rad) så att
 * smutsigheten räknas mot vad som faktiskt ligger i databasen NU.
 */
export function slaIhopEfterSpar<T extends { lid: string }>(opts: {
  fresh: T[];
  lokala: T[];
  misslyckade: Map<string, string>;   // lid → felmeddelande
  nyckel: (r: T) => string;
  rebase: (lokal: T, fresh: T | null) => T;
}): T[] {
  const { fresh, lokala, misslyckade, nyckel, rebase } = opts;
  const kvar = lokala.filter(r => misslyckade.has(r.lid));
  const kvarPerNyckel = new Map<string, T>();
  for (const r of kvar) kvarPerNyckel.set(nyckel(r), r);
  const ut: T[] = fresh.map(f => {
    const lokal = kvarPerNyckel.get(nyckel(f));
    return lokal ? { ...rebase(lokal, f), fel: misslyckade.get(lokal.lid) } as T : f;
  });
  const nycklarIDb = new Set(fresh.map(nyckel));
  for (const r of kvar) {
    if (!nycklarIDb.has(nyckel(r))) ut.push({ ...rebase(r, null), fel: misslyckade.get(r.lid) } as T);
  }
  return ut;
}

// ── Maskinpriser (maskin_timpris + dim_maskin) ──────────────────────────

export type MaskinRad = {
  lid: string;
  id?: string;
  maskin_id: string; maskin_namn: string; timpris: Num;
  giltig_fran: string | null;
  // Värdeminskning kr/G15-tim ('' = NULL i databasen = räknas inte) och det
  // FÖRSLAG som visas som placeholder — aldrig som ifyllt värde.
  vardeminskning_kr_per_g15h: Num;
  forslagVm: number;
  sald: boolean; sald_datum: string;
  forestlink: boolean;
  dimFinns: boolean;            // maskinen har en rad i dim_maskin (annars kan vm/FL/såld inte sättas)
  isNew?: boolean;
  fel?: string;
  basTp: string;                // ögonblicksbild av timpris-delen som laddades
  basDim: string;               // ögonblicksbild av dim_maskin-delen som laddades
};

/**
 * Formulärrad ur databasens rader. FÖRVALET är ett FÖRSLAG, aldrig ett värde:
 * NULL i dim_maskin.vardeminskning_kr_per_g15h blir ett TOMT fält (motorn
 * räknar ingen värdeminskning på NULL), och förslaget (400 skördare / 300
 * skotare) följer bara med som placeholder-text. En Spara skriver därför aldrig
 * in förvalet som om någon valt det.
 */
export function maskinRadFranDb(
  tp: { id?: string; maskin_id: string; maskin_namn?: string | null; timpris?: number | string | null; giltig_fran: string | null },
  dim: { maskin_typ?: string | null; vardeminskning_kr_per_g15h?: number | null; sald?: boolean | null; sald_datum?: string | null; forestlink?: boolean | null } | undefined,
  nyLid: () => string,
  forslag: { skordare: number; skotare: number },
): MaskinRad {
  const rad: MaskinRad = {
    lid: nyLid(), id: tp.id,
    maskin_id: tp.maskin_id, maskin_namn: tp.maskin_namn || '', timpris: (tp.timpris ?? '') as Num,
    giltig_fran: tp.giltig_fran,
    vardeminskning_kr_per_g15h: (dim?.vardeminskning_kr_per_g15h ?? '') as Num,
    forslagVm: dim?.maskin_typ === 'Forwarder' ? forslag.skotare : forslag.skordare,
    sald: !!dim?.sald, sald_datum: dim?.sald_datum || '',
    // Kolumnen är NOT NULL default true; saknad dim-rad → false (okänt är inte "ja")
    forestlink: dim?.forestlink === true,
    dimFinns: !!dim,
    basTp: '', basDim: '',
  };
  rad.basTp = timprisDel(rad);
  rad.basDim = dimDel(rad);
  return rad;
}

export const timprisDel = (r: Pick<MaskinRad, 'maskin_namn' | 'timpris'>) =>
  JSON.stringify([r.maskin_namn.trim(), numOrNull(r.timpris)]);
export const dimDel = (r: Pick<MaskinRad, 'vardeminskning_kr_per_g15h' | 'sald' | 'sald_datum' | 'forestlink'>) =>
  JSON.stringify([numOrNull(r.vardeminskning_kr_per_g15h), r.sald, r.sald && r.sald_datum ? r.sald_datum : null, r.forestlink]);

export const arMaskinSmutsig = (r: MaskinRad) =>
  !!r.isNew || timprisDel(r) !== r.basTp || (r.dimFinns && dimDel(r) !== r.basDim);

export function rebaseMaskin(lokal: MaskinRad, fresh: MaskinRad | null): MaskinRad {
  if (!fresh) return { ...lokal, basTp: '', basDim: '', isNew: true };
  return { ...lokal, id: fresh.id, giltig_fran: fresh.giltig_fran, dimFinns: fresh.dimFinns, basTp: fresh.basTp, basDim: fresh.basDim, isNew: false };
}

export async function sparaMaskinRad(sb: SupabaseClient, row: MaskinRad, alla: MaskinRad[]): Promise<RadResultat> {
  const nyckel = row.maskin_id.trim();
  if (!nyckel || !row.maskin_namn.trim() || row.timpris === '' || Number(row.timpris) <= 0) {
    return { ok: false, fel: 'Fyll i maskin-ID, namn och ett pris > 0' };
  }
  if (row.isNew && alla.some(a => a !== row && !a.isNew && a.maskin_id.trim() === nyckel)) {
    return { ok: false, fel: `${nyckel} finns redan — redigera den befintliga raden` };
  }

  // Timpris-versionen skrivs BARA när timpris/namn ändrats (eller raden är ny).
  const skrevTimpris = !!row.isNew || timprisDel(row) !== row.basTp;
  if (skrevTimpris) {
    const err = await saveOneByKey(sb, 'maskin_timpris', 'maskin_id', nyckel, {
      maskin_id: nyckel, maskin_namn: row.maskin_namn.trim(), timpris: Number(row.timpris),
    }, !!row.isNew);
    if (err) return { ok: false, fel: err.message };
  }

  // Värdeminskning/FL/såld bor i dim_maskin (admin-only RLS — chef får tyst 0
  // rader, därför verifierat sparande med värde-återläsning, aldrig tyst).
  const skrivDim = (row.isNew || row.dimFinns) && (row.isNew || dimDel(row) !== row.basDim);
  if (skrivDim) {
    const villSaldDatum = row.sald && row.sald_datum ? row.sald_datum : null;
    const villKrPerTim = numOrNull(row.vardeminskning_kr_per_g15h);
    const dimRes = await uppdateraVerifierat(
      sb, 'dim_maskin',
      { vardeminskning_kr_per_g15h: villKrPerTim, sald: row.sald, sald_datum: villSaldDatum, forestlink: row.forestlink },
      { maskin_id: nyckel },
      'maskin_id, vardeminskning_kr_per_g15h, sald, sald_datum, forestlink',
    );
    const prefix = skrevTimpris ? 'Timpris sparat, men värdeminskning/FL: ' : 'Värdeminskning/FL: ';
    if (!dimRes.ok) return { ok: false, fel: prefix + dimRes.fel };
    const r0: any = dimRes.rows[0];
    const landat = (v: any) => (v == null ? null : Number(v));
    if (landat(r0.vardeminskning_kr_per_g15h) !== villKrPerTim
        || !!r0.sald !== row.sald || (r0.sald_datum || null) !== villSaldDatum
        || !!r0.forestlink !== row.forestlink) {
      return { ok: false, fel: prefix + 'värdet landade inte i dim_maskin — kontrollera behörighet' };
    }
  }
  return { ok: true };
}

// ── Terräng (acord_terrang) och övrigt (acord_ovrigt) — en rad per nyckel ──

export type TerrangRad = {
  lid: string; id?: string; namn: string; tillagg_kr_per_m3fub: Num;
  giltig_fran: string | null; isNew?: boolean; fel?: string; bas: string;
};
export const terrangSnapshot = (r: Pick<TerrangRad, 'tillagg_kr_per_m3fub'>) => JSON.stringify([numOrNull(r.tillagg_kr_per_m3fub)]);
export const arTerrangSmutsig = (r: TerrangRad) => !!r.isNew || terrangSnapshot(r) !== r.bas;
export function rebaseTerrang(lokal: TerrangRad, fresh: TerrangRad | null): TerrangRad {
  return fresh ? { ...lokal, id: fresh.id, giltig_fran: fresh.giltig_fran, bas: fresh.bas, isNew: false } : { ...lokal, bas: '', isNew: true };
}
export async function sparaTerrangRad(sb: SupabaseClient, row: TerrangRad, alla: TerrangRad[]): Promise<RadResultat> {
  const nyckel = row.namn.trim();
  if (!nyckel || row.tillagg_kr_per_m3fub === '') return { ok: false, fel: 'Terräng: namn och tillägg krävs' };
  if (row.isNew && alla.some(a => a !== row && !a.isNew && a.namn.trim() === nyckel)) {
    return { ok: false, fel: `${nyckel} finns redan — redigera den befintliga raden` };
  }
  const err = await saveOneByKey(sb, 'acord_terrang', 'namn', nyckel, {
    namn: nyckel, tillagg_kr_per_m3fub: Number(row.tillagg_kr_per_m3fub),
  }, !!row.isNew);
  return err ? { ok: false, fel: err.message } : { ok: true };
}

export type OvrigtRad = {
  lid: string; id?: string; nyckel: string; beskrivning: string; varde: Num; enhet: string;
  giltig_fran: string | null; isNew?: boolean; fel?: string; bas: string;
};
export const ovrigtSnapshot = (r: Pick<OvrigtRad, 'beskrivning' | 'varde' | 'enhet'>) => JSON.stringify([r.beskrivning, numOrNull(r.varde), r.enhet]);
export const arOvrigtSmutsig = (r: OvrigtRad) => !!r.isNew || ovrigtSnapshot(r) !== r.bas;
export function rebaseOvrigt(lokal: OvrigtRad, fresh: OvrigtRad | null): OvrigtRad {
  return fresh ? { ...lokal, id: fresh.id, giltig_fran: fresh.giltig_fran, bas: fresh.bas, isNew: false } : { ...lokal, bas: '', isNew: true };
}
export async function sparaOvrigtRad(sb: SupabaseClient, row: OvrigtRad, alla: OvrigtRad[]): Promise<RadResultat> {
  const nyckel = row.nyckel.trim();
  if (!nyckel || row.varde === '') return { ok: false, fel: 'Övrigt: nyckel och värde krävs' };
  if (row.isNew && alla.some(a => a !== row && !a.isNew && a.nyckel.trim() === nyckel)) {
    return { ok: false, fel: `${nyckel} finns redan — redigera den befintliga raden` };
  }
  const err = await saveOneByKey(sb, 'acord_ovrigt', 'nyckel', nyckel, {
    nyckel, beskrivning: row.beskrivning || null, varde: Number(row.varde), enhet: row.enhet || null,
  }, !!row.isNew);
  return err ? { ok: false, fel: err.message } : { ok: true };
}

// ── Hela uppsättningar och formel-config: smutsighet ur ögonblicksbild ──

export const acordSnapshot = (rader: { medelstam: Num; pris_total: Num; pris_skordare: Num; pris_skotare: Num }[]) =>
  JSON.stringify(rader.map(r => [numOrNull(r.medelstam), numOrNull(r.pris_total), numOrNull(r.pris_skordare), numOrNull(r.pris_skotare)]));
export const traktSnapshot = (rader: { fran_m3fub: Num; till_m3fub: Num; tillagg_kr_per_m3fub: Num }[]) =>
  JSON.stringify(rader.map(r => [numOrNull(r.fran_m3fub), numOrNull(r.till_m3fub), numOrNull(r.tillagg_kr_per_m3fub)]));
export const avstandSnapshot = (a: { grundavstand_m: Num; kr_per_100m: Num }) =>
  JSON.stringify([numOrNull(a.grundavstand_m), numOrNull(a.kr_per_100m)]);
export const sortSnapshot = (s: { grundantal: Num; kr_per_extra_sortiment: Num }) =>
  JSON.stringify([numOrNull(s.grundantal), numOrNull(s.kr_per_extra_sortiment)]);
