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

/** Ordningen i listans rad: det som stoppar mest först. Vattenskydd sist (det ändrar hur man tankar, inte om man får köra). */
const RAD_ORDNING = ['Natura 2000', 'Naturreservat', 'Biotopskydd', 'Nyckelbiotop', 'Fossil åker', 'Kolbotten', 'Fornlämning', 'Kulturlämning', 'Vattenskydd'];
/** Högst så många sorter skrivs ut på raden; resten blir "+N". */
export const RAD_MAX_ORD = 3;
const radOrd = (f: TraktFynd): string => f.text.split(' · ')[0];
const gemen = (s: string): string => (s.startsWith('Natura') ? s : s.toLowerCase());

/**
 * EN rad i objektlistan — högst en, och bara när något finns. ALLT analysen hittat står på raden, en gång per sort, det viktigaste
 * först: "Natura 2000 · nyckelbiotop · vattenskydd" (Martin 2026-11-18: Bengt-Eric Ericsson Klipp visade bara "Vattenskydd" fast
 * Natura 2000 och tre nyckelbiotoper låg på trakten, och Gallring Santhe visade ingenting fast ett naturreservat gränsar).
 * Högst RAD_MAX_ORD sorter, sedan "+N" — raden blir aldrig två rader. Bara fossil åker/kolbotten = "… – kräver barmark" som förut.
 * `kategori` är första sortens (styr prickens färg). Raden säger att något finns på eller intill trakten, inte hur mycket.
 * Kunde en kontroll inte köras och inget hittades står "Ej kontrollerad" (grå), för tomt läses som "inget finns".
 */
export function listRad(a: TraktAnalys): { text: string; kategori: FyndKategori | null } | null {
  if (a.lage === 'ej_kord') return null;
  if (a.lage === 'fel') return { text: 'Ej kontrollerad', kategori: null };
  const sorter = new Map<string, FyndKategori>();
  for (const f of a.fynd) if (!sorter.has(radOrd(f))) sorter.set(radOrd(f), f.kategori);
  if (!sorter.size) return a.ofullstandig ? { text: 'Ej kontrollerad', kategori: null } : null;
  const plats = (o: string) => { const i = RAD_ORDNING.indexOf(o); return i < 0 ? RAD_ORDNING.length : i; };
  const ord = [...sorter.keys()].sort((x, y) => plats(x) - plats(y));
  const kategori = sorter.get(ord[0])!;
  if (ord.length === 1 && kategori === 'barmark') return { text: `${ord[0]} – kräver barmark`, kategori };
  const visas = ord.slice(0, RAD_MAX_ORD).map((o, i) => (i === 0 ? o : gemen(o)));
  const fler = ord.length - visas.length;
  return { text: visas.join(' · ') + (fler > 0 ? ` +${fler}` : ''), kategori };
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
