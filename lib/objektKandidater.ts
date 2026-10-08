// KANDIDATOBJEKT FÖR MASKINDATORNS POSITIONSVAL: planerade/pågående objekt + deras traktgräns (objekt_geometri).
//
// Fältfel (Oskar, Rottne, R64428, 2026-10-07): appen startade på senast valda objekt (Älmehult) men maskinen stod i Trestensdal och loggade 377 punkter
// på fel objekt i 4 timmar. Datan var rätt (båda traktgränserna fanns, ingen överlappning) — det som saknades var att laddningen av kandidaterna
// kunde misslyckas TYST och att avstämningen bara gjorde en enda utvärdering på det den hade:
//   • supabase-js KASTAR inte vid nätfel/RLS-fel — den returnerar { data: null, error }. Koden läste `data || []` och räknade tom lista som "laddat".
//   • objekt_geometri har RLS (bara `authenticated`). En utgången/utloggad session får TOMMA rader UTAN fel, medan `objekt` svarar som vanligt →
//     alla kandidater får geometri null → ingen träff någonsin, men ingen ser något fel.
//   • ett anrop som hänger (4G-tapp) gav ingen laddning alls och inget fel.
// Därför: ett försök räknas bara som lyckat om båda frågorna svarade UTAN fel OCH geometrin inte är tom; annars försöker vi igen (backoff, tidsgräns
// per försök) tills det går, och laddar om med jämna mellanrum så att tilldelningar/status inte blir gamla.

export const KANDIDAT_KOLUMNER = 'id,namn,typ,grot,status,areal,lat,lng,volym,volym_planerad,volym_skordad,volym_skotad,skotare_maskin_id,skordare_maskin_id,pagaende_startad_timestamp';
export const KANDIDAT_STATUS: readonly string[] = ['planerad', 'pagaende'];
/** Ett försök som inte svarat så här länge räknas som misslyckat (hängande anrop). */
export const KANDIDAT_TIDSGRANS_MS = 20_000;
/** Väntan före omförsök efter ett misslyckande; sista värdet gäller för alla följande försök. */
export const KANDIDAT_OMFORSOK_MS: readonly number[] = [3_000, 6_000, 12_000, 30_000, 60_000];
/** Efter ett lyckat försök: ladda om så här ofta (tilldelning och status ändras av planeraren medan maskinen kör). */
export const KANDIDAT_UPPDATERA_MS = 5 * 60_000;

export interface KandidatSvar {
  objekt: { data: any[] | null; error: unknown };
  geometri: { data: any[] | null; error: unknown };
}

export interface KandidatResultat {
  ok: boolean;
  /** null när ok; annars varför: 'objekt-fel' | 'geometri-fel' | 'geometri-tom' | 'tidsgrans' | 'undantag' */
  orsak: string | null;
  /** Objektraderna med `geometri` ihopslagen (tom vid misslyckande). */
  kandidater: any[];
}

/** Slår ihop svaren. ok=false vid fel i någon fråga, eller om geometri-tabellen svarar TOMT fast objekt finns (anon/utgången session ger tomt utan fel). */
export function byggKandidater(svar: KandidatSvar): KandidatResultat {
  if (svar.objekt.error) return { ok: false, orsak: 'objekt-fel', kandidater: [] };
  if (svar.geometri.error) return { ok: false, orsak: 'geometri-fel', kandidater: [] };
  const rader = svar.objekt.data || [];
  const geo = svar.geometri.data || [];
  if (rader.length > 0 && geo.length === 0) return { ok: false, orsak: 'geometri-tom', kandidater: [] };
  const geoMap = new Map<string, any>();
  for (const g of geo) geoMap.set(g.objekt_id, g.geometri);
  return { ok: true, orsak: null, kandidater: rader.map((r) => ({ ...r, geometri: geoMap.get(r.id) ?? null })) };
}

/** De två frågorna mot databasen (parallellt). Fel läggs i svaret — supabase-js kastar inte, men nätfel kan ändå kasta → fångas av laddaren. */
export async function hamtaKandidatSvar(supabase: any): Promise<KandidatSvar> {
  const [o, g] = await Promise.all([
    supabase.from('objekt').select(KANDIDAT_KOLUMNER).in('status', [...KANDIDAT_STATUS]),
    supabase.from('objekt_geometri').select('objekt_id,geometri'),
  ]);
  return { objekt: { data: o.data, error: o.error }, geometri: { data: g.data, error: g.error } };
}

/**
 * Laddar kandidaterna och FORTSÄTTER tills det lyckas: tidsgräns per försök, backoff vid misslyckande, omladdning efter lyckat försök.
 * `vid` anropas efter VARJE försök (ok eller inte) — anroparen sätter bara sin "klar"-flagga när ok=true.
 * Returnerar stopp-funktionen (anropa vid avmontering / när maskinläget avslutas).
 */
export function startaKandidatLaddning(a: {
  hamta: () => Promise<KandidatSvar>;
  vid: (r: KandidatResultat) => void;
  tidsgransMs?: number;
  omforsokMs?: readonly number[];
  uppdateraMs?: number;
}): () => void {
  const tidsgrans = a.tidsgransMs ?? KANDIDAT_TIDSGRANS_MS;
  const omforsok = a.omforsokMs && a.omforsokMs.length ? a.omforsokMs : KANDIDAT_OMFORSOK_MS;
  const uppdatera = a.uppdateraMs ?? KANDIDAT_UPPDATERA_MS;
  let stoppad = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let misslyckade = 0;

  const forsok = async () => {
    if (stoppad) return;
    let res: KandidatResultat;
    try {
      res = await new Promise<KandidatResultat>((klart) => {
        const t = setTimeout(() => klart({ ok: false, orsak: 'tidsgrans', kandidater: [] }), tidsgrans);
        a.hamta().then(
          (svar) => { clearTimeout(t); klart(byggKandidater(svar)); },
          () => { clearTimeout(t); klart({ ok: false, orsak: 'undantag', kandidater: [] }); },
        );
      });
    } catch { res = { ok: false, orsak: 'undantag', kandidater: [] }; }
    if (stoppad) return;
    try { a.vid(res); } catch { /* anroparens fel får inte stoppa laddningen */ }
    if (res.ok) { misslyckade = 0; timer = setTimeout(forsok, uppdatera); }
    else { const v = omforsok[Math.min(misslyckade, omforsok.length - 1)]; misslyckade++; timer = setTimeout(forsok, v); }
  };

  void forsok();
  return () => { stoppad = true; if (timer) { clearTimeout(timer); timer = null; } };
}
