// Läser det skotningsrapporten visar: kartan, perioden och skotarna.
//
// TALEN LÄSES INTE HÄR. Avståndet, de fyra måtten och kronorna kommer ur
// fakturans eget underlag (`Granskningsunderlag.avstand`), så rapporten kan
// aldrig säga ett annat tal än fakturan. Här hämtas bara det kartan behöver —
// traktgränsen, var virket stod, var skotaren körde och avläggen — plus vilka
// dagar och vilken maskin det var.
//
// KASTAR ALDRIG. Varje del kan falla för sig: utan traktgräns ritas ingen
// gräns, utan spår ingen linje, och rapporten säger vad som saknades. En
// rapport utan karta är bättre än ingen rapport — men en rapport som tiger om
// att kartan är halv är värre än båda.

import type { SupabaseClient } from '@supabase/supabase-js';
import { hamtaAlla } from '@/lib/supabaseAlla';
import { lasVidaGrans } from '@/lib/egenkontrollOrigo';
import { korsparLinjer } from '@/lib/korspar';
import { klippSparMotTrakt, type RapportKarta } from './skotningsrapportPdf';
import type { Stam } from './virkesfordelning';

export type RapportUnderlag = {
  karta: RapportKarta;
  /**
   * Skördarens stammar med volym — underlaget för "Var låg virket?".
   * Samma läsning som kartans prickar, bara med `total_volym` med.
   */
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
  /** Det som inte gick att läsa, i ord. Tom lista = allt gick. */
  fel: string[];
};

type LatLng = { lat: number; lng: number };

const punkt = (lat: unknown, lng: unknown): LatLng | null => {
  const a = Number(lat), b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && (a !== 0 || b !== 0) ? { lat: a, lng: b } : null;
};

/** Vidas avlägg ur geometrin: tilläggspunkter som INTE är larmkoordinaten. */
function avlaggUrGeometri(linjer: unknown[]): RapportKarta['avlagg'] {
  const ut: RapportKarta['avlagg'] = [];
  for (const f of linjer) {
    const p = (f as { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } } | null);
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
 * Allt rapporten behöver utöver fakturans tal.
 *
 * `objektUuid` är objekt-tabellens id (traktgräns och hyttspår nycklas på
 * det); `nummer` är traktens alla nummer (stammarna ligger under vilket som
 * helst av dem — samma fälla som produktionshögarna).
 */
export async function lasSkotningsrapport(
  sb: SupabaseClient,
  a: { objektUuid: string; nummer: string[] },
): Promise<RapportUnderlag> {
  const fel: string[] = [];
  const ids = a.nummer.length > 0 ? a.nummer : ['__inget__'];

  const [gransSvar, stamSvar, sparSvar, lassSvar] = await Promise.all([
    lasVidaGrans(sb, a.objektUuid).catch((e: unknown) => ({ typ: 'fel' as const, meddelande: String(e) })),
    // Kolumnerna heter `latitude`/`longitude` i detalj_stam (inte lat/lng).
    // `total_volym` bär m³fub per stam och summerar till traktens skördade
    // volym — det är underlaget för "Var låg virket?".
    // Pagineras: PostgREST kapar tyst vid 1 000, och Skälviken har 2 842.
    hamtaAlla<{ latitude: number | null; longitude: number | null; total_volym: number | null }>(
      () => sb.from('detalj_stam').select('id, latitude, longitude, total_volym')
        .in('objekt_id', ids).not('latitude', 'is', null),
      'id',
    ),
    sb.from('hyttspar').select('points').eq('objekt_id', a.objektUuid).eq('roll', 'skotare'),
    sb.from('skotar_lass')
      .select('datum, maskin_id, status, bekraftad_av')
      .in('vo_nummer', ids)
      .neq('status', 'struket'),
  ]);

  // Traktgränsen. `VidaGrans` har också ett 'laddar'-läge — det ska aldrig nå
  // hit (läsningen är avvaktad), men typen tvingar oss att hantera det, och
  // då faller det stängt: ingen gräns, och det sägs.
  let granser: LatLng[][] = [];
  let avlagg: RapportKarta['avlagg'] = [];
  if (gransSvar.typ === 'ok') {
    granser = (gransSvar.ringar ?? []).map((r: [number, number][]) =>
      r.map(([lng, lat]: [number, number]) => ({ lat, lng })));
    avlagg = avlaggUrGeometri(gransSvar.linjer ?? []);
  } else if (gransSvar.typ === 'saknas') {
    fel.push('Vida har ingen traktgräns för trakten.');
  } else {
    fel.push('Traktgränsen kunde inte läsas.');
  }

  // Stammarna — var virket stod. Samma rader bär kartans prickar och
  // fördelningens volym; en stam utan volym ritas men räknas inte.
  let stammar: LatLng[] = [];
  let virke: Stam[] = [];
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
  if (sparSvar.error) fel.push('Skotarens körspår kunde inte läsas.');
  else {
    korspar = ((sparSvar.data ?? []) as { points?: unknown }[])
      .flatMap(r => korsparLinjer(Array.isArray(r.points) ? (r.points as never) : []))
      .map(l => l.map(([lng, lat]) => ({ lat, lng })))
      .filter(l => l.length > 1);
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
  const karta = klippSparMotTrakt({ granser, stammar, korspar, avlagg });
  return { karta, virke, period, dagar, skotare, fel };
}
