// VAD TRAKTANALYSEN HITTAT, i klartext — EN tolkning för alla vyer (Översikten, objektlistan, senare snövarningen i helikoptern).
// Datan är objekt.trakt_analys, skriven av servern (cron /api/cron/traktanalys) mot Vidas traktgräns. Ingen vy tolkar fynden själv.
//
// Martin 2026-11-05: "vi säger det är vinter då är det ju inte lämpligt att köra fossil åker om det är snö för då ser vi inte stenhögarna".
// Därför tre kategorier efter vad fyndet betyder för planeringen, inte vad det heter:
//   barmark     = fossil åker, odlingsrösen, stensträngar, kolbottnar — syns inte under snö
//   vattenskydd = vattenskyddsområde — tankning och invallning
//   skydd       = nyckelbiotop, naturreservat, Natura 2000, biotopskydd, övriga fornlämningar och kulturlämningar
//
// ÄRLIGT:
//   • Inget hittat är ingen bekräftelse — RAÄ har långt ifrån all fossil åker registrerad. Inget hittat = ingen rad.
//   • En kontroll som inte gick att köra sägs ("Ej kontrollerad"), aldrig tomt.

export type FyndKategori = 'barmark' | 'vattenskydd' | 'skydd';

export interface TraktFynd {
  kategori: FyndKategori;
  /** Märket i klartext ("Fossil åker · barmark", "Vattenskydd", "Nyckelbiotop"). */
  text: string;
  /** Fyndets eget namn ur registret ("Fossil åker (L1960:1234)"), för kortet vid tryck på markören. */
  namn: string;
  /** Där fyndet ligger på trakten, för markören. null = bara raden. */
  plats: { lat: number; lng: number } | null;
}

export type TraktAnalys =
  | { lage: 'ej_kord' }                                               // servern har inte analyserat trakten än (eller trakten saknar Vidas gräns)
  | { lage: 'fel'; at: string }                                       // ingen kontroll gick att köra
  | { lage: 'klar'; at: string; fynd: TraktFynd[]; ofullstandig: boolean };   // ofullstandig = minst en kontroll föll

export const BARMARK_MONSTER = /fossil\s*åker|röjningsröse|odlingsröse|stensträng|åkerren|åkerterrass|odlingslämning|hägnad|kolbott|kolning/i;
const KOL_MONSTER = /kolbott|kolning/i;

const SKYDD_TEXT: Record<string, string> = {
  nyckelbiotop: 'Nyckelbiotop',
  naturreservat: 'Naturreservat',
  natura2000: 'Natura 2000',
  biotopskydd: 'Biotopskydd',
  fornlamning: 'Fornlämning',
  skogochhistoria: 'Kulturlämning',
};

type RaFynd = { type?: unknown; name?: unknown; details?: unknown; plats?: unknown };

/** Ett fynd ur registret → kategori och märke. */
export function tolkaFynd(f: RaFynd): TraktFynd | null {
  const typ = String(f.type ?? '');
  const namn = String(f.name ?? '').trim();
  const text = `${namn} ${String(f.details ?? '')}`;
  const p = f.plats as { lat?: unknown; lng?: unknown } | null | undefined;
  const plats = p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) ? { lat: Number(p.lat), lng: Number(p.lng) } : null;
  if (typ === 'vattenskydd') return { kategori: 'vattenskydd', text: 'Vattenskydd', namn: namn || 'Vattenskyddsområde', plats };
  if ((typ === 'fornlamning' || typ === 'skogochhistoria') && BARMARK_MONSTER.test(text)) {
    return { kategori: 'barmark', text: KOL_MONSTER.test(text) ? 'Kolbotten · barmark' : 'Fossil åker · barmark', namn, plats };
  }
  const skydd = SKYDD_TEXT[typ];
  return skydd ? { kategori: 'skydd', text: skydd, namn: namn || skydd, plats } : null;
}

/** Läs serverns analys på ett objekt. Saknas eller trasig = 'ej_kord'. */
export function lasTraktAnalys(o: { trakt_analys?: unknown } | null | undefined): TraktAnalys {
  const a = o?.trakt_analys as { at?: unknown; fynd?: unknown; fel?: unknown } | null | undefined;
  if (!a || typeof a !== 'object' || typeof a.at !== 'string') return { lage: 'ej_kord' };
  const fel = Array.isArray(a.fel) ? a.fel.filter((x) => typeof x === 'string') : [];
  const fynd = (Array.isArray(a.fynd) ? a.fynd : []).map((f) => tolkaFynd(f as RaFynd)).filter((f): f is TraktFynd => !!f);
  if (fel.length >= ANTAL_KONTROLLER && fynd.length === 0) return { lage: 'fel', at: a.at };
  return { lage: 'klar', at: a.at, fynd, ofullstandig: fel.length > 0 };
}
export const ANTAL_KONTROLLER = 7;

/**
 * EN rad i objektlistan — högst en, och bara när något finns (Martin 2026-11-06: "det får inte bli för mycket").
 * Fossil åker går före vattenskydd; båda = "Fossil åker · vattenskydd". Skydd (nyckelbiotop m.m.) står inte i listan — det syns i trakten.
 * Kunde en kontroll inte köras och inget hittades står "Ej kontrollerad" (grå), för tomt läses som "inget finns".
 */
export function listRad(a: TraktAnalys): { text: string; kategori: FyndKategori | null } | null {
  if (a.lage === 'ej_kord') return null;
  if (a.lage === 'fel') return { text: 'Ej kontrollerad', kategori: null };
  const barmark = a.fynd.find((f) => f.kategori === 'barmark');
  const vatten = a.fynd.some((f) => f.kategori === 'vattenskydd');
  if (barmark && vatten) return { text: `${barmark.text.split(' · ')[0]} · vattenskydd`, kategori: 'barmark' };
  if (barmark) return { text: `${barmark.text.split(' · ')[0]} – kräver barmark`, kategori: 'barmark' };
  if (vatten) return { text: 'Vattenskydd', kategori: 'vattenskydd' };
  return a.ofullstandig ? { text: 'Ej kontrollerad', kategori: null } : null;
}

/** Märkena för texten om trakten (Översikten): ett per sort, barmark först, sedan vattenskydd, sedan skydd. */
export function markenRader(a: TraktAnalys): { text: string; kategori: FyndKategori | null }[] {
  if (a.lage === 'ej_kord') return [];
  if (a.lage === 'fel') return [{ text: 'Ej kontrollerad', kategori: null }];
  const ordning: FyndKategori[] = ['barmark', 'vattenskydd', 'skydd'];
  const sedda = new Set<string>();
  const ut: { text: string; kategori: FyndKategori | null }[] = [];
  for (const k of ordning) for (const f of a.fynd) if (f.kategori === k && !sedda.has(f.text)) { sedda.add(f.text); ut.push({ text: f.text, kategori: k }); }
  if (a.ofullstandig) ut.push({ text: 'Ej helt kontrollerad', kategori: null });
  return ut;
}
