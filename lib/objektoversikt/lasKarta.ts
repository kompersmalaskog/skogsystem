// Objektöversiktens karta: läsningen (webbläsaren, den inloggade adminens session).
//
// Varje del läses för sig och ett läsfel i en del tar aldrig bort de andra: det som inte gick står i `fel` med ord
// ("körspåren"), och kartan säger det under sig. Tomt (inga spår, inga stammar) är inget fel.
//
// Planerarens markeringar ligger i x/y mot ett origo — det beslutas med SAMMA regel som egenkontrollens karta
// (beslutaOrigo: objektStartKamera, med ett kvitto mot Vidas traktgräns). Stämmer det inte ritas inga markeringar,
// hellre inga än på fel plats.

import type { SupabaseClient } from '@supabase/supabase-js';
import { beslutaOrigo, lasVidaGrans, markeringsGranser, markeringsPunkter, type VidaGrans } from '@/lib/egenkontrollOrigo';
import type { Origo } from '@/lib/kartkoordinater';
import { hyttsparRitadeLinjer } from '@/lib/sparJamning';
import { byggStrak } from '@/lib/strak';
import { hamtaAlla } from '@/lib/supabaseAlla';
import { optiTidUtcMs } from '@/lib/optiTid';
import {
  inomRuta, medOptiSpar, raknadeSkotarLass, rutaRunt, senastText, sistaPunkt,
  type KartKommentarRad, type KartStam, type LngLat, type MaskinPlats, type SkotarLass, type SkotarSpar,
} from './karta';

export type KartMaskin = { maskin_id: string; namn: string; roll: 'skordare' | 'skotare' };

export type KartData = {
  origo: Origo | null;
  /** Varför markeringarna inte ritas (null = de ritas, eller det finns inga). */
  origoText: string | null;
  markeringar: { data: unknown }[];
  vidaRingar: LngLat[][];
  /** Vidas linjer (kraftledning, basväg) som GeoJSON-features ur objekt_geometri. */
  vidaLinjer: unknown[];
  spar: { roll: 'skordare' | 'skotare'; linjer: LngLat[][] }[];
  stammar: KartStam[];
  /** Stammar som saknar position — de syns inte och räknas inte i ett område. */
  utanPosition: number;
  maskiner: MaskinPlats[];
  /** Maskiner som jobbat på objektet men aldrig skickat en position (appen var inte igång i hytten). */
  utanPlats: string[];
  /** Kommentarerna på planerarens markeringar (kartkommentar, nyckel marker:<id>). */
  kommentarer: KartKommentarRad[];
  /** Skotarens lass som räknas (appens + Opti före appen), med var den lastade. null = gick inte att läsa. */
  skotarLass: SkotarLass[] | null;
  /** Det som inte gick att läsa, i ord. */
  fel: string[];
};

const ORIGO_TEXT = 'Planerarens markeringar visas inte: de går inte att placera säkert på kartan.';

/** Läser allt kartan visar. Kastar aldrig. */
export async function lasKartdata(
  sb: SupabaseClient,
  a: { objektUuid: string; ids: string[]; maskiner: KartMaskin[]; jobbade: string[] },
  nu: Date = new Date(),
): Promise<KartData> {
  const fel: string[] = [];
  const ids = a.ids.length > 0 ? a.ids : ['__inget__'];

  const [objektSvar, markSvar, vida, sparSvar, stamSvar, utanSvar, tsSvar] = await Promise.all([
    sb.from('objekt').select('lat, lng, kartbild_bounds').eq('id', a.objektUuid).maybeSingle(),
    sb.from('planering_markeringar').select('data').eq('objekt_id', a.objektUuid),
    lasVidaGrans(sb, a.objektUuid).catch((e: unknown): VidaGrans => ({ typ: 'fel', meddelande: String(e) })),
    sb.from('hyttspar').select('roll, maskin_id, datum, points').eq('objekt_id', a.objektUuid).order('datum', { ascending: true }).order('id', { ascending: true }),
    hamtaAlla<{ latitude: number; longitude: number; total_volym: number | null; tradslag_id: string | null }>(
      () => sb.from('detalj_stam').select('latitude, longitude, total_volym, tradslag_id').in('objekt_id', ids).not('latitude', 'is', null),
      'id',
    ),
    sb.from('detalj_stam').select('id', { count: 'exact', head: true }).in('objekt_id', ids).is('latitude', null),
    sb.from('dim_tradslag').select('tradslag_id, namn'),
  ]);
  const [kommSvar, appSvar, optiSvar] = await Promise.all([
    sb.from('kartkommentar').select('yta_nyckel, text, skapad_at, medarbetare:skapad_av(namn)').eq('objekt_id', a.objektUuid).like('yta_nyckel', 'marker:%'),
    sb.from('skotar_lass').select('maskin_id, datum, spar, skotar_lass_del(lossad_tid, skotar_lass_sortiment(m3_forare))').eq('objekt_id', a.objektUuid).neq('status', 'struket'),
    hamtaAlla<{ maskin_id: string; datum: string; lossnings_tid: string | null; lastnings_tid: string | null; tid_ar_utc: boolean | null; volym_m3sub: number | null }>(
      () => sb.from('fakt_lass').select('id, maskin_id, datum, lossnings_tid, lastnings_tid, tid_ar_utc, volym_m3sub').in('objekt_id', ids),
      'id',
    ),
  ]);

  // Kommentarerna på markeringarna
  let kommentarer: KartKommentarRad[] = [];
  if (kommSvar.error) fel.push('kommentarerna');
  else kommentarer = ((kommSvar.data ?? []) as any[]).map(r => ({
    yta_nyckel: String(r.yta_nyckel), text: String(r.text ?? ''), skapad_at: String(r.skapad_at ?? ''),
    namn: (Array.isArray(r.medarbetare) ? r.medarbetare[0]?.namn : r.medarbetare?.namn) ?? null,
  }));

  // Vidas traktgräns
  let vidaRingar: LngLat[][] = [];
  let vidaLinjer: unknown[] = [];
  if (vida.typ === 'ok') { vidaRingar = (vida.ringar ?? []) as LngLat[][]; vidaLinjer = vida.linjer ?? []; }
  else if (vida.typ === 'fel') fel.push('Vidas traktgräns');

  // Markeringarna + origot
  let markeringar: { data: unknown }[] = [];
  let origo: Origo | null = null;
  let origoText: string | null = null;
  if (markSvar.error || objektSvar.error) {
    fel.push('planerarens markeringar');
  } else {
    markeringar = (markSvar.data ?? []) as { data: unknown }[];
    if (markeringar.length > 0) {
      const beslut = beslutaOrigo({
        objekt: objektSvar.data as { lat?: number | null; lng?: number | null; kartbild_bounds?: unknown } | null,
        punkter: markeringsPunkter(markeringar),
        granser: markeringsGranser(markeringar),
        vida,
      });
      if (beslut.ok) origo = beslut.origo;
      else origoText = ORIGO_TEXT;
    }
  }

  // Trädslagens namn
  const tsNamn = new Map<string, string>();
  for (const r of (tsSvar.data ?? []) as { tradslag_id: string; namn: string }[]) tsNamn.set(r.tradslag_id, r.namn);

  // Stammarna
  let stammar: KartStam[] = [];
  if (stamSvar.error) fel.push('stammarna');
  else {
    stammar = stamSvar.data
      .filter(s => typeof s.latitude === 'number' && typeof s.longitude === 'number')
      .map(s => ({ lat: s.latitude, lng: s.longitude, volym: Number(s.total_volym) || 0, tradslag: tsNamn.get(String(s.tradslag_id)) ?? '' }));
  }
  const utanPosition = utanSvar.error ? 0 : (utanSvar.count ?? 0);

  // Körspåren
  const per: Record<'skordare' | 'skotare', LngLat[][]> = { skordare: [], skotare: [] };
  const skotarSpar: SkotarSpar[] = [];
  const sparMaskiner = new Set<string>();
  if (sparSvar.error) fel.push('körspåren');
  else {
    for (const rad of (sparSvar.data ?? []) as { roll: string; maskin_id: string | null; points: unknown }[]) {
      if (rad.roll !== 'skordare' && rad.roll !== 'skotare') continue;
      if (rad.maskin_id) sparMaskiner.add(rad.maskin_id);
      if (!Array.isArray(rad.points)) continue;
      const punkter = (rad.points as { lat?: unknown; lng?: unknown; tid?: unknown }[])
        .filter(p => typeof p?.lat === 'number' && typeof p?.lng === 'number')
        .map(p => ({ lat: p.lat as number, lng: p.lng as number, tid: typeof p.tid === 'string' ? p.tid : '' }));
      for (const linje of hyttsparRitadeLinjer(punkter)) per[rad.roll].push(linje as LngLat[]);
      // Skotarens rådata med tider (aldrig de utjämnade linjerna): Opti-lassens väg mellan två lossningar.
      if (rad.roll === 'skotare' && rad.maskin_id) {
        skotarSpar.push({ maskin: rad.maskin_id, punkter: punkter.map(p => ({ lng: p.lng, lat: p.lat, ms: Date.parse(p.tid) })).filter(p => Number.isFinite(p.ms)) });
      }
    }
  }
  // STRÅK (lib/strak): alla körningar per roll ihop till stråk — bara ritningen; skotarSpar (rådata) räknas som förut.
  const spar = (['skordare', 'skotare'] as const).filter(r => per[r].length > 0).map(roll => ({ roll, linjer: byggStrak(per[roll], roll) as LngLat[][] }));

  // Skotarens lass. Går appens eller Opti-lassen inte att läsa finns inget skotat (aldrig en halv summa).
  let skotarLass: SkotarLass[] | null = null;
  if (appSvar.error || optiSvar.error || sparSvar.error) fel.push('skotarens lass');
  else {
    const app: SkotarLass[] = ((appSvar.data ?? []) as any[]).map(l => {
      const delar = (l.skotar_lass_del ?? []) as any[];
      const tider = delar.map(d => Date.parse(d.lossad_tid)).filter(Number.isFinite);
      const m3 = delar.flatMap(d => (d.skotar_lass_sortiment ?? []) as any[]).reduce((s, r) => s + (Number(r.m3_forare) || 0), 0);
      const spar = Array.isArray(l.spar)
        ? (l.spar as { lat?: unknown; lng?: unknown }[]).filter(p => typeof p?.lat === 'number' && typeof p?.lng === 'number').map(p => [p.lng as number, p.lat as number] as LngLat)
        : [];
      return { maskin: String(l.maskin_id), datum: String(l.datum), tidMs: tider.length ? Math.min(...tider) : null, m3, app: true, spar: spar.length ? spar : null };
    });
    const opti: SkotarLass[] = optiSvar.data.map(l => ({
      maskin: String(l.maskin_id), datum: String(l.datum), tidMs: optiTidUtcMs(l.lossnings_tid ?? l.lastnings_tid, l.tid_ar_utc),
      m3: Number(l.volym_m3sub) || 0, app: false, spar: null,
    }));
    skotarLass = medOptiSpar(raknadeSkotarLass([...app, ...opti]), skotarSpar);
  }

  // Maskinerna nu: senaste kända position (sista hyttspårspunkten, var den än är).
  const ruta = rutaRunt([
    ...vidaRingar.flat(),
    ...stammar.map(s => [s.lng, s.lat] as LngLat),
  ]);
  // Maskinerna som jobbat på objektet: tid/produktion/tilldelning (a.jobbade, från servern) och hyttspår här.
  const jobbade = new Set([...a.jobbade, ...sparMaskiner]);
  const kandidater = a.maskiner.filter(m => jobbade.has(m.maskin_id));
  const maskiner: MaskinPlats[] = [];
  const utanPlats: string[] = [];
  const svar = await Promise.all(kandidater.map(m =>
    sb.from('hyttspar').select('datum, points').eq('maskin_id', m.maskin_id).order('datum', { ascending: false }).order('id', { ascending: false }).limit(1),
  ));
  let maskinFel = false;
  svar.forEach((s, i) => {
    if (s.error) { maskinFel = true; return; }
    const rad = (s.data ?? [])[0] as { datum: string | null; points: unknown } | undefined;
    const m = kandidater[i];
    const p = rad ? sistaPunkt(rad.points) : null;
    if (!p) { utanPlats.push(m.namn); return; }
    maskiner.push({
      maskin_id: m.maskin_id, namn: m.namn, roll: m.roll, lat: p.lat, lng: p.lng,
      nar: senastText(p.tid, rad?.datum ?? null, nu),
      har: ruta ? inomRuta(p.lng, p.lat, ruta) : false,
    });
  });
  if (maskinFel) fel.push('maskinernas position');

  return { origo, origoText, markeringar: origo ? markeringar : [], vidaRingar, vidaLinjer, spar, stammar, utanPosition, maskiner, utanPlats, kommentarer, skotarLass, fel };
}
