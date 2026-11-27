// Läser det skotningsrapporten visar: kartan, perioden och skotarna.
//
// TALEN LÄSES INTE HÄR. Avståndet, de fyra måtten och kronorna kommer ur
// fakturans eget underlag (`Granskningsunderlag.avstand`), så rapporten kan
// aldrig säga ett annat tal än fakturan. Här hämtas bara det kartan behöver —
// traktgränsen, var virket stod, var skotaren körde, avläggen, hänsynen och
// marken — plus vilka dagar och vilken maskin det var.
//
// KARTAN SKA VISA VARFÖR (Martin 2026-11-25): "inga röda högar dom ska vara som
// appen titta dom och hänsyner ska vara med och om det är blött eller brant så
// dom förstå varför vi måste kört som vi gjort med virket". Inköparen läser ett
// avstånd och ett tillägg; utan hänsynen han inte får köra i, och utan den blöta
// svackan och den branta backen han måste runt, är talet bara ett tal.
//
// VAD SOM RITAS OCH VAD SOM INTE GÖR DET. Kartan är liten (halva A4-bredden)
// och ska läsas på en sekund, så den bär bara det som förklarar skotningen:
// högarna, traktgränsen, körspåret, avläggen, hänsyn/fornlämning/nyckelbiotop
// och blött/brant. Planerarens symboler (evighetsträd, högstubbar) och vägar
// ritas INTE — de hindrar ingen skotning och gör kartan rörig.
//
// KASTAR ALDRIG. Varje del kan falla för sig: utan traktgräns ritas ingen
// gräns, utan spår ingen linje, och rapporten säger vad som saknades. En
// rapport utan karta är bättre än ingen rapport — men en rapport som tiger om
// att kartan är halv är värre än båda.

import type { SupabaseClient } from '@supabase/supabase-js';
import { hamtaAlla } from '@/lib/supabaseAlla';
import { beslutaOrigo, lasVidaGrans, markeringsGranser, markeringsPunkter } from '@/lib/egenkontrollOrigo';
import { kontextFeature } from '@/lib/egenkontrollkarta';
import { origoPerMarkering } from '@/lib/skotarlank/server';
import { korsparLinjer } from '@/lib/korspar';
import { klassaTraktFeature } from '@/lib/traktGeometri';
import { narTrakten, traktModell, type TraktModell } from '@/lib/traktNara';
import type { KartMarkering } from '@/lib/egenkontrollRapportKarta';
import { klippSparMotTrakt, type MarkSlag, type RapportKarta } from './skotningsrapportPdf';
import { kordStracka, type KordStracka } from './kordStracka';
import { rapportMark, type SparatMarkRutnat } from './rapportMark';
import type { Stam } from './virkesfordelning';

export type RapportUnderlag = {
  /**
   * Kartan. `mark` är valfri i `RapportKarta` (egenkontrollens rapport har den
   * inte), men läsningen sätter den ALLTID — tom lista när det inte finns
   * något. Därför är den inte valfri här: annars skulle varje läsare behöva
   * `?? []` för något som alltid finns.
   */
  karta: RapportKarta & { mark: NonNullable<RapportKarta['mark']> };
  /** Skördarens stammar med volym — underlaget för "Var låg virket?". */
  virke: Stam[];
  /** Första och sista lossningsdagen ur lassen. null = inga lass. */
  period: { fran: string; till: string } | null;
  /**
   * Dagar med lass — inte kalenderdagar mellan första och sista. Skotaren
   * står still på trakten medan skördaren ligger före, och en rapport som
   * säger "26 dagar" om 16 arbetade läses som att vi tagit för lång tid.
   */
  dagar: number;
  /** Skotarnas visningsnamn, i bokstavsordning. */
  skotare: string[];
  /**
   * Hur långt maskinerna körde, mätt på RÅDATA (`kordStracka`) och klippt mot
   * samma ram som kartan. null = inget skotarspår på trakten.
   */
  korde: KordStracka | null;
  /** Det som inte gick att läsa, i ord. Tom lista = allt gick. */
  fel: string[];
};

type LatLng = { lat: number; lng: number };

const punkt = (lat: unknown, lng: unknown): LatLng | null => {
  const a = Number(lat), b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && (a !== 0 || b !== 0) ? { lat: a, lng: b } : null;
};

/**
 * Vidas avlägg: tilläggspunkter som INTE är larmkoordinaten.
 *
 * FELET SOM RÄTTADES 2026-11-25: de lästes förut ur `VidaGrans.linjer`, som
 * filtrerar `_typ === 'linje'` — och en tilläggspunkt har `_typ: 'punkt'`.
 * Rapporten har alltså aldrig ritat ett enda avlägg, och det syntes inte i
 * något test (fixturerna bar avläggen direkt). Nu läses de ur `punkter`.
 */
function avlaggUrPunkter(punkter: unknown[]): RapportKarta['avlagg'] {
  const ut: RapportKarta['avlagg'] = [];
  for (const f of punkter) {
    const p = (f as { properties?: Record<string, unknown>; geometry?: { coordinates?: unknown } } | null);
    const prop = p?.properties ?? {};
    if (prop._lager !== 'L_TILLAGGSPUNKTER') continue;
    if (String(prop.FLBESKR ?? '').toLowerCase().includes('larmkoordinat')) continue;
    const c = p?.geometry?.coordinates;
    if (!Array.isArray(c) || c.length < 2) continue;
    const pt = punkt(c[1], c[0]);
    if (!pt) continue;
    const nr = Number(prop.EXTRA_LABE ?? prop.LOPNR);
    ut.push({ nr: Number.isFinite(nr) ? nr : ut.length + 1, namn: String(prop.EXTRA_LABE ?? prop.LOPNR ?? 'Avlägg'), plats: pt });
  }
  return ut;
}

/**
 * Vidas ytor som hindrar skotningen → zoner med appens egna stilar.
 *
 * Kategorin kommer ur `klassaTraktFeature` — EN källa med kartan i hytten, så
 * en hänsynsyta ritas grön och snedstreckad på papperet precis som på skärmen.
 * TYP 71 ("Övrigt") klassas redan av den som `ovrigt` och är ingen hänsyn
 * (lib/vidaYtaTyp) — den ritas inte här. Skogsbruksplan och fastighetsgränser
 * är inga hinder och ritas inte heller.
 */
const VIDA_ZON: Partial<Record<string, string>> = {
  hansyn: 'protected',
  nyckelbiotop: 'protected',
  lamning: 'fornlamning',
};

function vidaZoner(ytor: unknown[], trakt: TraktModell | null): KartMarkering[] {
  const ut: KartMarkering[] = [];
  for (const f of ytor) {
    const g = (f as { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } } | null);
    const typ = VIDA_ZON[klassaTraktFeature(g?.properties).kategori];
    if (!typ) continue;
    // BARA DET SOM BERÖR TRAKTEN. Vidas leverans bär allt i närheten: Bondeskog
    // har tre fornlämningar som ligger söder och väster OM trakten (mätt i prod
    // 2026-11-25). De förklarar ingenting om skotningen, och ritade drar de ut
    // kartans ram så att trakten blir en klump i hörnet — samma fälla som
    // hemresan i körspåret. Måttet är appens eget (lib/traktNara, 50 m, samma
    // som Fokus på trakten); utan traktgräns finns inget att mäta mot och allt
    // ritas som förut.
    if (trakt && !narTrakten(g?.geometry, trakt)) continue;
    const geom = g?.geometry;
    // Polygon → en ring; MultiPolygon → en zon per del (en hänsyn kan vara flera bitar).
    const ringar: unknown[] =
      geom?.type === 'Polygon' ? [(geom.coordinates as unknown[])?.[0]]
      : geom?.type === 'MultiPolygon' ? ((geom.coordinates as unknown[][]) ?? []).map((d) => d?.[0])
      : [];
    for (const r of ringar) {
      if (!Array.isArray(r)) continue;
      const pkt = r
        .map((c: unknown) => (Array.isArray(c) && c.length >= 2 ? punkt(c[1], c[0]) : null))
        .filter((p): p is LatLng => !!p);
      if (pkt.length >= 3) ut.push({ slag: 'zon', typ, punkter: pkt });
    }
  }
  return ut;
}

/**
 * Planerarens egna zoner som hindrar skotningen.
 *
 * Bara dessa typer: hänsyn och kultur (får inte köras i) och blött/brant (som
 * förklarar en längre väg). Gallringszoner, ungskog och övriga ytor ritas inte.
 */
const EGNA_ZONER = new Set(['protected', 'fornlamning', 'culture', 'wet', 'steep', 'noentry']);

/**
 * Planerarens SYMBOLER som ska med (Martin 2026-11-26: "att evighetsträden är
 * med och högstubbarna").
 *
 * Det är hänsynen vi lämnat kvar, och den förklarar både varför skotaren kört
 * som den gjort och att vi gjort vad certifieringen kräver — inköparen ser den
 * på bilden i stället för att behöva tro på en siffra. Naturhörnan räknas som
 * evighetsträd i appens egen räkning (`lib/miljokrav`) och följer därför med.
 *
 * Inget annat: en karta med alla symboler planeraren satt blir samma rörighet
 * som högarna var.
 */
const EGNA_SYMBOLER = new Set(['eternitytree', 'highstump', 'naturecorner']);

/**
 * Allt rapporten behöver utöver fakturans tal.
 *
 * `objektUuid` är objekt-tabellens id (traktgräns, hyttspår, markeringar och
 * skogsdata nycklas på det); `nummer` är traktens alla nummer (stammarna
 * ligger under vilket som helst av dem — samma fälla som produktionshögarna).
 */
export async function lasSkotningsrapport(
  sb: SupabaseClient,
  a: { objektUuid: string; nummer: string[] },
): Promise<RapportUnderlag> {
  const fel: string[] = [];
  const ids = a.nummer.length > 0 ? a.nummer : ['__inget__'];

  const [gransSvar, stamSvar, sparSvar, lassSvar, markSvar, objektSvar, skogSvar] = await Promise.all([
    lasVidaGrans(sb, a.objektUuid).catch((e: unknown) => ({ typ: 'fel' as const, meddelande: String(e) })),
    // Kolumnerna heter `latitude`/`longitude` i detalj_stam (inte lat/lng).
    // `total_volym` bär m³fub per stam och summerar till traktens skördade
    // volym — det är underlaget för "Var låg virket?".
    // Trädslaget läses inte: virket ritas inte på kartan längre, och tabellen
    // delar på avstånd, inte på trädslag.
    // Pagineras: PostgREST kapar tyst vid 1 000, och Skälviken har 2 842.
    hamtaAlla<{ latitude: number | null; longitude: number | null; total_volym: number | null }>(
      () => sb.from('detalj_stam').select('id, latitude, longitude, total_volym')
        .in('objekt_id', ids).not('latitude', 'is', null),
      'id',
    ),
    // Båda rollernas körspår: skotarens är det rapporten handlar om, skördarens
    // ritar STRÅKEN som kartan i hytten visar dem (se `RapportKarta.skordarspar`).
    sb.from('hyttspar').select('points, roll').eq('objekt_id', a.objektUuid).in('roll', ['skotare', 'skordare']),
    sb.from('skotar_lass')
      .select('datum, maskin_id, status, bekraftad_av')
      .in('vo_nummer', ids)
      .neq('status', 'struket'),
    sb.from('planering_markeringar').select('data').eq('objekt_id', a.objektUuid),
    sb.from('objekt').select('lat, lng, kartbild_bounds').eq('id', a.objektUuid).maybeSingle(),
    // Marken: timjobbets redan hämtade lutning och markfuktighet (lib/skogsdata).
    // Rapporten frågar ingen extern tjänst när den skapas.
    sb.from('objekt_skogsdata').select('rutnat').eq('objekt_id', a.objektUuid).maybeSingle(),
  ]);

  // Traktgränsen, Vidas ytor och avläggen. `VidaGrans` har också ett
  // 'laddar'-läge — det ska aldrig nå hit (läsningen är avvaktad), men typen
  // tvingar oss att hantera det, och då faller det stängt: ingen gräns, och
  // det sägs.
  let granser: LatLng[][] = [];
  let avlagg: RapportKarta['avlagg'] = [];
  const markeringar: KartMarkering[] = [];
  if (gransSvar.typ === 'ok') {
    granser = (gransSvar.ringar ?? []).map((r: [number, number][]) =>
      r.map(([lng, lat]: [number, number]) => ({ lat, lng })));
    avlagg = avlaggUrPunkter(gransSvar.punkter ?? []);
    // Traktmodellen byggs ur traktgränsens egna ringar (`traktgransRingar`
    // läser L_TRAKTDEL), så måttet är exakt den gräns kartan ritar.
    const trakt = traktModell({
      features: (gransSvar.ringar ?? []).map((r: [number, number][]) =>
        ({ properties: { _lager: 'L_TRAKTDEL' }, geometry: { type: 'Polygon', coordinates: [r] } })),
    });
    markeringar.push(...vidaZoner(gransSvar.ytor ?? [], trakt));
  } else if (gransSvar.typ === 'saknas') {
    fel.push('Vida har ingen traktgräns för trakten.');
  } else {
    fel.push('Traktgränsen kunde inte läsas.');
  }

  // Stammarna — var virket stod.
  //
  // `virke` bär volymerna och blir tabellen "Var låg virket?". `stammar` är
  // bara lägena: de RITAS INTE på kartan (Martin 2026-11-26) men bestämmer
  // kartans ram och var körspåret klipps, se `RapportKarta.stammar`.
  const stammar: LatLng[] = [];
  const virke: Stam[] = [];
  if (stamSvar.error) fel.push('Stammarnas lägen kunde inte läsas.');
  else {
    for (const s of stamSvar.data ?? []) {
      const p = punkt(s.latitude, s.longitude);
      if (!p) continue;
      stammar.push(p);
      const v = Number(s.total_volym);
      if (Number.isFinite(v) && v > 0) virke.push({ ...p, volym: v });
    }
  }

  // Skotarens körspår. RITNINGEN går genom `korsparLinjer` — samma rensning
  // och utjämning som kartan i appen, så rapporten och skärmen visar samma
  // linje. (Rådata har GPS-hopp och darr; allt som RÄKNAS använder rådata,
  // men det här är en bild.)
  let korspar: LatLng[][] = [];
  let skordarspar: LatLng[][] = [];
  // RÅA punkter, sparade för sig: talet "Maskinen körde" räknas på dem.
  // Utjämningen kortar linjen till 69–85 % av det maskinen verkligen körde, så
  // ett tal räknat på ritningen hade varit för lågt — och det talet går till
  // kund. Se `kordStracka`.
  let raSkotare: LatLng[][] = [];
  let raSkordare: LatLng[][] = [];
  if (sparSvar.error) fel.push('Körspåren kunde inte läsas.');
  else {
    const rader = (sparSvar.data ?? []) as { points?: unknown; roll?: unknown }[];
    const punkter = (r: { points?: unknown }) => Array.isArray(r.points) ? (r.points as never[]) : [];
    const forRoll = (roll: string) => rader.filter(r => r.roll === roll);
    const linjer = (roll: string) => forRoll(roll)
      .flatMap(r => korsparLinjer(punkter(r)))
      .map(l => l.map(([lng, lat]) => ({ lat, lng })))
      .filter(l => l.length > 1);
    const ra = (roll: string): LatLng[][] => forRoll(roll)
      .map(r => punkter(r)
        .filter((p: { lat?: unknown; lng?: unknown }) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))
        .map((p: { lat: number; lng: number }) => ({ lat: p.lat, lng: p.lng })))
      .filter(l => l.length > 1);
    korspar = linjer('skotare');
    skordarspar = linjer('skordare');
    raSkotare = ra('skotare');
    raSkordare = ra('skordare');
  }

  // Planerarens zoner. De ligger i x/y mot ett origo, och origot avgörs med
  // SAMMA regel som egenkontrollens karta och objektöversikten — stämmer det
  // inte ritas inga, och det sägs. Hellre ingen hänsyn på kartan än en hänsyn
  // flera mil fel.
  if (markSvar.error || objektSvar.error) fel.push('Planerarens hänsyn kunde inte läsas.');
  else {
    const rader = (markSvar.data ?? []) as { data: unknown }[];
    if (rader.length > 0) {
      const beslut = beslutaOrigo({
        objekt: objektSvar.data as { lat?: number | null; lng?: number | null; kartbild_bounds?: unknown } | null,
        punkter: markeringsPunkter(rader),
        granser: markeringsGranser(rader),
        vida: gransSvar as never,
      });
      // Faller punktkontrollen räknas varje MARKERING en gång i stället
      // (`origoPerMarkering`, samma undantag som skotarlänken). Bondeskog är
      // själva fallet: två GPS-spårade basvägar ut till allmän väg bär ~175
      // punkter och vägde mer än alla symboler tillsammans, så kvittot sa nej
      // fast markeringarna låg rätt. En felplacerad trakt flyttar alla
      // markeringar åt samma håll och fångas fortfarande.
      const origo = beslut.ok ? beslut.origo
        : beslut.skal === 'stammer_inte' && markeringsGranser(rader).length === 0
          ? origoPerMarkering(
              objektSvar.data as { lat: number | null; lng: number | null; kartbild_bounds: unknown },
              rader, gransSvar as never)
          : null;
      if (!origo) {
        fel.push('Planerarens hänsyn ritas inte: kartans läge går inte att kontrollera mot Vidas traktgräns.');
      } else {
        for (const rad of rader) {
          const f = kontextFeature(rad.data, origo);
          if (!f) continue;
          const typ = String(f.properties.typ ?? '');
          if (f.properties.kind === 'symbol') {
            if (!EGNA_SYMBOLER.has(typ)) continue;
            if (f.geometry.type !== 'Point') continue;
            const [lng, lat] = f.geometry.coordinates as [number, number];
            markeringar.push({ slag: 'symbol', typ, plats: { lat, lng } });
            continue;
          }
          if (f.properties.kind !== 'zon') continue;
          if (!EGNA_ZONER.has(typ)) continue;
          const ring = f.geometry.type === 'Polygon' ? (f.geometry.coordinates[0] as [number, number][])
            : f.geometry.type === 'LineString' ? (f.geometry.coordinates as [number, number][]) : [];
          if (ring.length >= 3) markeringar.push({ slag: 'zon', typ, punkter: ring.map(([lng, lat]) => ({ lat, lng })) });
        }
      }
    }
  }

  // Blött och brant ur timjobbets skogsdata. Ett läsfel är en rad i `fel` —
  // marken försvinner aldrig tyst, för den är halva svaret på varför vägen
  // blev så lång.
  let mark: { slag: MarkSlag; ruta: LatLng[] }[] = [];
  if (skogSvar.error) fel.push('Blöt och brant mark kunde inte läsas.');
  else {
    const rutnat = (skogSvar.data as { rutnat?: unknown } | null)?.rutnat;
    if (Array.isArray(rutnat)) {
      try {
        mark = rapportMark(rutnat as SparatMarkRutnat[]);
      } catch {
        fel.push('Blöt och brant mark kunde inte räknas ut.');
      }
    }
  }

  // Perioden, dagarna och skotarna ur lassen som räknas.
  let period: { fran: string; till: string } | null = null;
  let dagar = 0;
  const maskiner = new Set<string>();
  if (lassSvar.error) fel.push('Lassen kunde inte läsas, så perioden saknas.');
  else {
    const rader = ((lassSvar.data ?? []) as { datum: string | null; maskin_id: string | null; bekraftad_av: string | null }[])
      .filter(r => r.bekraftad_av !== 'auto' && r.datum);
    const unika = [...new Set(rader.map(r => r.datum!))].sort();
    if (unika.length > 0) period = { fran: unika[0], till: unika[unika.length - 1] };
    dagar = unika.length;
    for (const r of rader) if (r.maskin_id) maskiner.add(r.maskin_id);
  }

  // Maskinernas namn — aldrig ett maskin_id i en rapport till kund.
  let skotare: string[] = [];
  if (maskiner.size > 0) {
    const { data, error } = await sb.from('dim_maskin')
      .select('maskin_id, visningsnamn').in('maskin_id', Array.from(maskiner));
    if (error) fel.push('Maskinernas namn kunde inte läsas.');
    else {
      skotare = ((data ?? []) as { visningsnamn: string | null }[])
        .map(m => m.visningsnamn)
        .filter((n): n is string => !!n)
        .sort((x, y) => x.localeCompare(y, 'sv'));
    }
  }

  // Spåret klipps mot trakten SIST, när gränsen, stammarna och avläggen är
  // lästa — hemresan hör inte till jobbet och drar annars ut kartans ram.
  const karta = klippSparMotTrakt({ granser, stammar, korspar, skordarspar, avlagg, markeringar, mark });

  // Talet klipps mot SAMMA ram, med samma funktion: annars kan bilden visa en
  // sträcka och talet en annan. Här är det råpunkterna som går igenom.
  const raKlippt = klippSparMotTrakt({
    granser, stammar, avlagg, markeringar: [], mark: [],
    korspar: raSkotare, skordarspar: raSkordare,
  });
  const korde = kordStracka(raKlippt.korspar, raKlippt.skordarspar ?? []);

  return { karta, virke, period, dagar, skotare, korde, fel };
}
