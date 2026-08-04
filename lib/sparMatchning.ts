// Map-matchning av lastbilsspåret: dra spåret längs vägnätet i stället för
// fågelvägen. Loggpunkterna ligger 5–10 min isär, så råa raka linjer genar över
// sjöar och skog.
//
// ORS free-tier är rate-limitat (≈40/min → 429 vid burst), så vi matchar HELA
// rundan i så FÅ anrop som möjligt: ett ORS-anrop per chunk om ≤MAX_WAYPOINTS
// punkter (POST med alla punkter som waypoints), inte ett per segment. Bara om
// ett chunk inte kan routas (t.ex. en punkt på en gård utanför vägnätet) faller
// vi ner till per-segment för DET chunket — och ett segment som ändå inte
// matchas ritas RAKT och dämpat (vi gissar aldrig). Vid 429 slutar vi anropa
// helt den här omgången (rest rakt) och cachar INTE (så en rate-svacka inte
// fastnar). Resultatet cachas per runda (lastbil_spar_cache) → räknas om en gång.
//
// OBS: den riktiga lösningen är Scanias 1-minutsintervall (beställs via
// Börjessons/My Scania) — då är råspåret redan tätt. Detta gör det bästa av
// 5–10-minutersdatan som finns.

export interface SparPunkt { lat: number; lng: number }
// coords = [[lng,lat],...] (GeoJSON-ordning). matchad=false → rak dämpad linje.
export interface SparSegment { coords: [number, number][]; matchad: boolean }

export interface MatchResultat {
  segment: SparSegment[]
  nagonOmatchad: boolean   // minst ett segment ritas rakt
  matchningPa: boolean     // ORS-nyckel finns → matchning ens försökt
  cache: boolean           // svaret kom ur cachen
}

const POST_URL = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson'
const GET_URL = 'https://api.openrouteservice.org/v2/directions/driving-car'
const MAX_WAYPOINTS = 48   // ORS free tål ~50 waypoints per directions-anrop
const ORS_BUDGET = 30      // hårt tak på ORS-anrop per matchning (skyddsnät)

interface Ctx { key: string; used: number; rateLimitad: boolean }
const kanAnropa = (c: Ctx) => !c.rateLimitad && c.used < ORS_BUDGET

function fetchTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t))
}

/** ORS-rutt genom en punktsekvens (ett anrop). coords | null. Sätter rateLimitad vid 429. */
async function orsChunk(c: Ctx, pts: SparPunkt[]): Promise<[number, number][] | null> {
  c.used++
  try {
    const r = await fetchTimeout(POST_URL, {
      method: 'POST',
      headers: { Authorization: c.key, 'Content-Type': 'application/json', Accept: 'application/geo+json' },
      body: JSON.stringify({ coordinates: pts.map(p => [p.lng, p.lat]) }),
    }, 6000)
    if (r.status === 429) { c.rateLimitad = true; return null }
    if (!r.ok) return null
    const b: any = await r.json()
    const coords = b?.features?.[0]?.geometry?.coordinates
    return Array.isArray(coords) && coords.length >= 2 ? coords : null
  } catch { return null }
}

/** ORS-rutt mellan två punkter (fallback). coords | null. Sätter rateLimitad vid 429. */
async function orsSegment(c: Ctx, a: SparPunkt, b: SparPunkt): Promise<[number, number][] | null> {
  c.used++
  try {
    const r = await fetchTimeout(`${GET_URL}?start=${a.lng},${a.lat}&end=${b.lng},${b.lat}`,
      { headers: { Authorization: c.key, Accept: 'application/geo+json' } }, 4000)
    if (r.status === 429) { c.rateLimitad = true; return null }
    if (!r.ok) return null
    const body: any = await r.json()
    const coords = body?.features?.[0]?.geometry?.coordinates
    return Array.isArray(coords) && coords.length >= 2 ? coords : null
  } catch { return null }
}

const rakt = (a: SparPunkt, b: SparPunkt): SparSegment =>
  ({ coords: [[a.lng, a.lat], [b.lng, b.lat]], matchad: false })

async function cacheHamta(db: any, flyttdagId: string, antal: number): Promise<SparSegment[] | null> {
  try {
    const { data } = await db.from('lastbil_spar_cache')
      .select('punkt_antal, segment').eq('flyttdag_id', flyttdagId).maybeSingle()
    if (data && data.punkt_antal === antal && Array.isArray(data.segment)) return data.segment
    return null
  } catch { return null }   // tabellen kanske inte körd än — matcha ändå, ocachat
}

async function cacheSpar(db: any, flyttdagId: string, antal: number, segment: SparSegment[]): Promise<void> {
  try {
    await db.from('lastbil_spar_cache').upsert(
      { flyttdag_id: flyttdagId, punkt_antal: antal, segment },
      { onConflict: 'flyttdag_id' },
    )
  } catch { /* cache är en optimering — aldrig blockerande */ }
}

/** Chunk-gränser med 1 punkts överlapp så linjen hänger ihop mellan chunk. */
function chunkGranser(n: number): [number, number][] {
  const out: [number, number][] = []
  let s = 0
  while (s < n - 1) {
    const e = Math.min(s + MAX_WAYPOINTS - 1, n - 1)
    out.push([s, e])
    s = e
  }
  return out
}

export async function matchaSpar(db: any, flyttdagId: string, punkter: SparPunkt[]): Promise<MatchResultat> {
  const key = process.env.ORS_API_KEY
  if (punkter.length < 2) return { segment: [], nagonOmatchad: false, matchningPa: !!key, cache: false }

  const cached = await cacheHamta(db, flyttdagId, punkter.length)
  if (cached) return { segment: cached, nagonOmatchad: cached.some(s => !s.matchad), matchningPa: true, cache: true }

  if (!key) {
    // Ingen nyckel → rita rått (rakt), cacha inte (matchning kan komma senare).
    const segment = punkter.slice(0, -1).map((_, i) => rakt(punkter[i], punkter[i + 1]))
    return { segment, nagonOmatchad: true, matchningPa: false, cache: false }
  }

  const c: Ctx = { key, used: 0, rateLimitad: false }
  const segment: SparSegment[] = []

  for (const [s, e] of chunkGranser(punkter.length)) {
    const chunk = punkter.slice(s, e + 1)
    if (chunk.length < 2) continue

    // 1) hela chunket i ett anrop
    if (kanAnropa(c)) {
      const coords = await orsChunk(c, chunk)
      if (coords) { segment.push({ coords, matchad: true }); continue }
    }
    // 2) chunket kunde inte routas (eller rate/budget) → per-segment inom chunket
    for (let i = 0; i < chunk.length - 1; i++) {
      const a = chunk[i], b = chunk[i + 1]
      if (kanAnropa(c)) {
        const cc = await orsSegment(c, a, b)
        if (cc) { segment.push({ coords: cc, matchad: true }); continue }
      }
      segment.push(rakt(a, b))
    }
  }

  const nagonOmatchad = segment.some(s => !s.matchad)
  // Cacha bara ett komplett resultat — aldrig ett som kapades av 429 (då kan
  // fler segment matchas nästa gång rate-limiten släppt).
  if (!c.rateLimitad) await cacheSpar(db, flyttdagId, punkter.length, segment)

  return { segment, nagonOmatchad, matchningPa: true, cache: false }
}
