// Hämtar allt radbyggaren behöver för ETT vo-nummer.
//
// Skild från byggRader med flit: hämtningen är full av Supabase-detaljer
// (paginering, RLS, tabellnamn) medan bygget är ren aritmetik som ska gå att
// pröva mot riktiga fakturor utan databas.
//
// ⚠️ fakt_produktion OCH fakt_tid JOINAS ALDRIG DIREKT.
// fakt_produktion har många rader per dag (en per trädslag/sortiment/
// operatör), fakt_tid har en eller få. En direkt join multiplicerar tiden.
// Båda hämtas separat och summeras var för sig — se CLAUDE.md.
//
// ⚠️ ETT VO KAN HA FLERA objekt_id.
// Jätsbygd (11217392) har två rader i dim_objekt: en per maskin som skapat
// filer. Allt aggregeras över HELA gruppen, annars saknas halva volymen.

import { fetchAllRows } from '@/lib/ekonomi/period';
import { avrakningsdatum } from '@/lib/objekt/avrakning';
import { skotningsavstandM } from '@/lib/skotningsavstand';
import {
  isValidOn, lookupAcordPris, traktTillagg, sortimentTillagg, skotAvstandKr,
} from '@/lib/ekonomi/acord';
import { kostnadsstalleFor, harKrockandeKostnadsstalle } from '@/lib/ekonomi/kostnadsstalle';
import type { VoUnderlag, Maskinrad } from '@/lib/faktura/radbyggare';

type SB = { from: (t: string) => any };

/** Saker som inte är fel på en RAD men som granskningen måste visa. */
export type Underlagsnot = { niva: 'varning' | 'info'; text: string };

export type HamtatUnderlag = {
  underlag: VoUnderlag;
  noter: Underlagsnot[];
  /** dim_objekt-id:n som ingår — spårbarhet i granskningen. */
  objektIds: string[];
};

const sum = (rader: any[], f: string) =>
  rader.reduce((s, r) => s + (Number(r[f]) || 0), 0);

export async function hamtaVoUnderlag(sb: SB, voNummer: string): Promise<HamtatUnderlag> {
  const noter: Underlagsnot[] = [];

  // ── Objektgruppen ──────────────────────────────────────────────────────
  const { data: objRader, error: objFel } = await sb.from('dim_objekt')
    .select('objekt_id, object_name, vo_nummer, bolag, timpeng, huvudtyp, exkludera, '
      + 'skordning_avslutad, skotning_avslutad, egen_skotning, '
      + 'medelstam_manuell, sortiment_grupper_manuell, terrang_kr_manuell, '
      + 'skotavstand_manuell, acord_andel_skordare_manuell')
    .eq('vo_nummer', voNummer)
    .order('objekt_id');
  if (objFel) throw new Error('Kunde inte läsa dim_objekt: ' + objFel.message);
  const objekt = (objRader || []).filter((o: any) => !o.exkludera);
  if (objekt.length === 0) throw new Error(`Inget icke-exkluderat objekt för VO ${voNummer}.`);

  const objektIds = objekt.map((o: any) => o.objekt_id);
  const huvud = objekt[0];

  if (objekt.length > 1) {
    noter.push({ niva: 'info', text: `VO:t har ${objekt.length} objektrader — allt är summerat över gruppen.` });
  }
  // Blandade flaggor inom gruppen är ett datafel som ändrar priset. Visa det.
  for (const f of ['timpeng', 'egen_skotning'] as const) {
    if (new Set(objekt.map((o: any) => !!o[f])).size > 1) {
      noter.push({ niva: 'varning', text: `Objektraderna i VO:t har OLIKA ${f} — gruppens första rad används.` });
    }
  }

  // ── Avräkningsdag: hela gruppen ska vara klar ──────────────────────────
  const avrPerObjekt = objekt.map((o: any) => avrakningsdatum(o));
  const oavraknade = objekt.filter((_: any, i: number) => !avrPerObjekt[i]);
  const avrDatum = avrPerObjekt.filter(Boolean).sort().slice(-1)[0] || null;
  if (oavraknade.length) {
    noter.push({
      niva: 'varning',
      text: `${oavraknade.length} av ${objekt.length} objektrader är inte slutavräknade: `
        + oavraknade.map((o: any) => o.objekt_id).join(', '),
    });
  }
  // Uppslagsdatum = avräkningsdagen. Saknas den kan inget pris slås upp, och
  // då ska raderna visa 'pris_saknas' — inte tyst hämtas på dagens taxa.
  const uppslag = avrDatum || new Date().toISOString().slice(0, 10);

  // ── Fakta: fyra separata hämtningar, aldrig en join ────────────────────
  const [prod, tid, lass, sort] = await Promise.all([
    fetchAllRows((f, t) => sb.from('fakt_produktion')
      .select('maskin_id, volym_m3sub, stammar').in('objekt_id', objektIds)
      .order('maskin_id').order('datum').order('id').range(f, t)),
    fetchAllRows((f, t) => sb.from('fakt_tid')
      .select('maskin_id, datum, processing_sek, terrain_sek, other_work_sek')
      .in('objekt_id', objektIds).order('maskin_id').order('datum').order('id').range(f, t)),
    fetchAllRows((f, t) => sb.from('fakt_lass')
      .select('datum, korstracka_m, volym_m3sub').in('objekt_id', objektIds)
      .order('datum').order('id').range(f, t)),
    fetchAllRows((f, t) => sb.from('fakt_sortiment')
      .select('sortiment_id').in('objekt_id', objektIds)
      .order('sortiment_id').order('id').range(f, t)),
  ]);

  // ── Register och prislistor ────────────────────────────────────────────
  const [maskinRes, kstRes, timprisRes, acordRes, traktRes, sortConfRes, ovrigtRes, avstRes,
         grupperRes, bolagRes, objektRes] = await Promise.all([
    sb.from('dim_maskin').select('maskin_id, visningsnamn, modell, maskin_typ'),
    sb.from('maskin_kostnadsstalle').select('maskin_id, kostnadsstalle_kod, giltig_fran, giltig_till'),
    sb.from('maskin_timpris').select('maskin_id, timpris, giltig_fran, giltig_till'),
    sb.from('acord_priser').select('medelstam, pris_total, pris_skordare, pris_skotare, giltig_fran, giltig_till'),
    sb.from('acord_traktstorlek').select('fran_m3fub, till_m3fub, tillagg_kr_per_m3fub, giltig_fran, giltig_till'),
    sb.from('acord_sortiment_tillagg').select('grundantal, kr_per_extra_sortiment, giltig_fran, giltig_till'),
    sb.from('acord_ovrigt').select('nyckel, varde, giltig_fran, giltig_till'),
    sb.from('acord_skotningsavstand').select('grundavstand_m, kr_per_100m, giltig_fran, giltig_till'),
    sb.from('dim_sortiment_grupp').select('sortiment_id, grupp'),
    sb.from('bolag').select('namn, fortnox_kundnr'),
    sb.from('objekt').select('id, vo_nummer, kontraktsnummer').eq('vo_nummer', voNummer),
  ]);
  for (const r of [maskinRes, kstRes, timprisRes, acordRes, traktRes, sortConfRes,
                   ovrigtRes, avstRes, grupperRes, bolagRes, objektRes]) {
    if (r.error) throw new Error('Kunde inte läsa register: ' + r.error.message);
  }

  const giltiga = (rader: any[] | null) =>
    (rader || []).filter((r: any) => isValidOn(uppslag, r.giltig_fran, r.giltig_till));

  // ── Ackordets delar ────────────────────────────────────────────────────
  const volym = sum(prod, 'volym_m3sub');
  const stammar = sum(prod, 'stammar');
  const medelstamAuto = stammar > 0 ? volym / stammar : 0;
  const medelstam = Number(huvud.medelstam_manuell) || medelstamAuto;
  if (!huvud.medelstam_manuell && stammar === 0) {
    noter.push({ niva: 'varning', text: 'Ingen stamdata — medelstammen kan inte räknas fram.' });
  }

  const gruppMap = new Map<string, string | null>(
    (grupperRes.data || []).map((g: any) => [g.sortiment_id, g.grupp]));
  const grupperAuto = new Set(
    sort.map((s: any) => gruppMap.get(s.sortiment_id)).filter(Boolean) as string[]).size;
  const sortimentgrupper = huvud.sortiment_grupper_manuell != null
    ? Number(huvud.sortiment_grupper_manuell) : grupperAuto;

  const acordList = giltiga(acordRes.data);
  const traktKr = traktTillagg(volym, giltiga(traktRes.data) as any).krPerM3;
  const sortKr = sortimentTillagg(sortimentgrupper, giltiga(sortConfRes.data)[0] as any);
  const kvalitetRad = giltiga(ovrigtRes.data).find((r: any) => r.nyckel === 'kvalitetssakring');
  const kvalitetKr = kvalitetRad ? Number(kvalitetRad.varde) || 0 : 0;
  if (!kvalitetRad) noter.push({ niva: 'varning', text: `Ingen kvalitetssäkringssats gäller ${uppslag}.` });
  if (!acordList.length) noter.push({ niva: 'varning', text: `Ingen ackordsprislista gäller ${uppslag}.` });

  // ── Skotningsavståndet: KRONOR, per lass eller ur den manuella siffran ──
  // Manuell siffra är redan ENKELRIKTAD; korstracka_m är tur och retur.
  const avstList = avstRes.data || [];
  let skotKr = 0;
  if (huvud.skotavstand_manuell != null) {
    skotKr = skotAvstandKr(uppslag, Number(huvud.skotavstand_manuell), volym, avstList as any);
    noter.push({ niva: 'info', text: `Avståndet kommer från skotavstand_manuell (${huvud.skotavstand_manuell} m), inte ur lassen.` });
  } else if (lass.length) {
    for (const l of lass) {
      skotKr += skotAvstandKr(l.datum, skotningsavstandM(l.korstracka_m),
        Number(l.volym_m3sub) || 0, avstList as any);
    }
  } else {
    noter.push({ niva: 'varning', text: 'Inga lass och ingen manuell sträcka — avståndstillägget blir 0 kr.' });
  }

  // ── Maskinerna som arbetat på VO:t ─────────────────────────────────────
  const typMap = new Map<string, any>((maskinRes.data || []).map((m: any) => [m.maskin_id, m]));
  const g15PerMaskin = new Map<string, number>();
  const sistaDagPerMaskin = new Map<string, string>();
  for (const r of tid) {
    const sek = (Number(r.processing_sek) || 0) + (Number(r.terrain_sek) || 0) + (Number(r.other_work_sek) || 0);
    g15PerMaskin.set(r.maskin_id, (g15PerMaskin.get(r.maskin_id) || 0) + sek);
    const f = sistaDagPerMaskin.get(r.maskin_id);
    if (!f || r.datum > f) sistaDagPerMaskin.set(r.maskin_id, r.datum);
  }

  const maskiner: Maskinrad[] = [];
  for (const [maskinId, sek] of Array.from(g15PerMaskin.entries())) {
    const dm = typMap.get(maskinId);
    const roll: 'skordare' | 'skotare' = dm?.maskin_typ === 'Harvester' ? 'skordare' : 'skotare';
    // Kostnadsstället slås upp på maskinens SISTA arbetsdag på objektet —
    // det är den dagen fakturan avser. Scorpionen låg på M13 till mars och
    // SCO därefter; ett uppslag utan datum hade satt dagens kod på en
    // gammal period. Se lib/ekonomi/kostnadsstalle.
    const dag = sistaDagPerMaskin.get(maskinId) || uppslag;
    const kst = kostnadsstalleFor(maskinId, dag, kstRes.data as any);
    if (!kst) {
      noter.push({
        niva: 'varning',
        text: harKrockandeKostnadsstalle(maskinId, dag, kstRes.data as any)
          ? `${maskinId} har TVÅ kostnadsställen giltiga ${dag} — koden lämnas tom.`
          : `${maskinId} saknar kostnadsställe ${dag}.`,
      });
    }
    const tp = (timprisRes.data || []).find((p: any) =>
      p.maskin_id === maskinId && isValidOn(dag, p.giltig_fran, p.giltig_till));
    maskiner.push({
      maskin_id: maskinId,
      // visningsnamn är namnet Vida ser. modell är en reserv, inte ett val:
      // saknas visningsnamn ska det synas som ett tomt fält i registret.
      namn: dm?.visningsnamn || dm?.modell || maskinId,
      roll,
      kostnadsstalle: kst,
      g15h: sek / 3600,
      timpris: tp ? Number(tp.timpris) || 0 : null,
    });
  }
  maskiner.sort((a, b) => (a.roll === b.roll ? a.maskin_id.localeCompare(b.maskin_id) : a.roll === 'skordare' ? -1 : 1));
  if (!maskiner.length) noter.push({ niva: 'varning', text: 'Ingen maskin har tidrader på VO:t.' });

  // ── Kund och kontrakt ──────────────────────────────────────────────────
  const bolagRad = (bolagRes.data || []).find((b: any) => b.namn === huvud.bolag);
  if (huvud.bolag && !bolagRad) {
    noter.push({ niva: 'varning', text: `Bolaget "${huvud.bolag}" finns inte i bolagstabellen.` });
  }
  const kontrakt = (objektRes.data || []).map((o: any) => o.kontraktsnummer).filter(Boolean);
  if (new Set(kontrakt).size > 1) {
    noter.push({ niva: 'varning', text: `VO:t har flera kontraktsnummer: ${Array.from(new Set(kontrakt)).join(', ')}` });
  }

  // ── Flyttar: uuid mot objekt.id, ALDRIG mot dim_objekt.objekt_id ───────
  // fakturaunderlag_flytt pekar på objekt.id (uuid). objekt.dim_objekt_id är
  // NULL på varenda rad, så enda vägen till dim_objekt är vo_nummer.
  const objektUuids = (objektRes.data || []).map((o: any) => o.id);
  let flyttar: VoUnderlag['flyttar'] = [];
  if (objektUuids.length) {
    const { data: fl, error: flFel } = await sb.from('fakturaunderlag_flytt')
      .select('id, datum, maskin, km, status, fakturerad_tid, till_objekt_id')
      .in('till_objekt_id', objektUuids).eq('status', 'aktiv')
      .is('fakturerad_tid', null).order('datum');
    if (flFel) throw new Error('Kunde inte läsa flyttar: ' + flFel.message);
    flyttar = (fl || []).map((f: any) => ({
      id: f.id, datum: f.datum, maskin: f.maskin, km: f.km == null ? null : Number(f.km),
    }));
    for (const f of flyttar) {
      if (avrDatum && f.datum > avrDatum) {
        noter.push({ niva: 'varning', text: `Flytten ${f.datum} (${f.maskin}) är EFTER avräkningsdagen ${avrDatum}.` });
      }
      if (f.km == null) noter.push({ niva: 'varning', text: `Flytten ${f.datum} saknar km — radtypen kan inte avgöras.` });
    }
  }

  const underlag: VoUnderlag = {
    vo_nummer: voNummer,
    objektnamn: huvud.object_name || voNummer,
    kontraktsnummer: kontrakt[0] || null,
    bolag: huvud.bolag || null,
    fortnox_kundnr: bolagRad?.fortnox_kundnr ?? null,
    timpeng: !!huvud.timpeng || (huvud.huvudtyp || '') === 'Gallring',
    avrakningsdatum: avrDatum,
    volymM3fub: volym,
    medelstam,
    sortimentgrupper,
    terrangKr: Number(huvud.terrang_kr_manuell) || 0,
    skotAvstandKr: skotKr,
    andelSkordareManuell: huvud.acord_andel_skordare_manuell == null
      ? null : Number(huvud.acord_andel_skordare_manuell),
    acordList: acordList as any,
    sortKr, traktKr, kvalitetKr,
    maskiner,
    flyttar,
    // Ingenting i appen samlar in manuella poster än (fällning, GROT-skotning,
    // papp). De finns på Martins fakturor men har ingen källa här ännu.
    manuellaPoster: [],
  };

  return { underlag, noter, objektIds };
}
