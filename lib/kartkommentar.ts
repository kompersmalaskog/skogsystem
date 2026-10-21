// KOMMENTARER PÅ KARTAN — ren logik (Martin 2026-10-20). En kommentar är EN RAD med författare och tid (tabellen kartkommentar), på Vidas objekt och på egna
// markeringar. Ingen skriver över någon annans: man kan bara ändra och ta bort sina egna (admin får radera andras, aldrig ändra deras text). Tiden sätts av
// servern. Nyckeln är objektets yta_nyckel: Vidas nyckel (lib/vidaNycklar) eller `marker:<id>` för en egen markering.
//
// Utan täckning: ändringen läggs i en lokal kö (lib/kartkommentarKo) och visas direkt med märket "väntar". Det här är de rena delarna: sammanslagning av köposter,
// utseendet på raden och vem som får göra vad.

export interface KommentarRad {
  id: string;
  objekt_id: string;
  yta_nyckel: string;
  text: string;
  skapad_av: string | null;
  /** Författarens namn (null = okänt). */
  namn: string | null;
  skapad_at: string;
  andrad_at: string;
}

export interface KommentarVy extends KommentarRad {
  /** Ligger i den lokala kön och har inte nått servern än. */
  vantar: boolean;
  /** En kommentar från före författare sparades (markeringens gamla kommentarfält). Visas som "Äldre kommentar", utan namn och tid. */
  aldre?: boolean;
}

export const markerNyckel = (markerId: string | number): string => `marker:${markerId}`;

/** Bara den som skrev kommentaren får ändra den. */
export const kanAndraKommentar = (rad: Pick<KommentarRad, 'skapad_av'>, minId: string | null | undefined): boolean => !!minId && rad.skapad_av === minId;

/** Den som skrev den får radera den; admin får radera andras (en rad utan författare kan bara admin radera). */
export const kanRaderaKommentar = (rad: Pick<KommentarRad, 'skapad_av'>, minId: string | null | undefined, arAdmin: boolean): boolean =>
  kanAndraKommentar(rad, minId) || arAdmin;

export const fornamn = (namn: string | null | undefined): string => (namn ?? '').trim().split(/\s+/)[0] ?? '';

const TZ = 'Europe/Stockholm';
const dagNyckel = (d: Date): string => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const klockslag = (d: Date): string => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);

/** "idag 16:20" · "i går 16:20" · "20 okt 16:20" · "20 okt 2025 16:20" (svensk tid). */
export function tidText(iso: string | null | undefined, nu: Date = new Date()): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const kl = klockslag(d);
  const dag = dagNyckel(d);
  if (dag === dagNyckel(nu)) return `idag ${kl}`;
  if (dag === dagNyckel(new Date(nu.getTime() - 24 * 3600 * 1000))) return `i går ${kl}`;
  const manad = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, day: 'numeric', month: 'short' }).format(d).replace('.', '');
  const ar = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric' }).format(d);
  const nuAr = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric' }).format(nu);
  return `${manad}${ar === nuAr ? '' : ` ${ar}`} ${kl}`;
}

/** "Martin · i går 16:20". Saknas författaren står "Okänd", saknas tiden bara namnet. */
export function forfattarText(namn: string | null | undefined, iso: string | null | undefined, nu: Date = new Date()): string {
  const f = fornamn(namn) || 'Okänd';
  const t = tidText(iso, nu);
  return t ? `${f} · ${t}` : f;
}

/** Raden i listan: nyast sist (som ett samtal). */
export const sorteraKommentarer = <T extends Pick<KommentarRad, 'skapad_at' | 'id'>>(rader: readonly T[]): T[] =>
  [...rader].sort((a, b) => a.skapad_at.localeCompare(b.skapad_at) || a.id.localeCompare(b.id));

/** Den senaste kommentaren (den som visas på en rad i larmkortet). Äldre kommentarer utan författare räknas bara om inget annat finns. */
export function senasteKommentar<T extends KommentarVy>(rader: readonly T[]): T | null {
  const nya = rader.filter((r) => !r.aldre);
  const lista = nya.length ? nya : rader;
  return lista.length ? sorteraKommentarer(lista)[lista.length - 1] : null;
}

/** Raden i larmkortet: "Daniel: Stolpe lutar". Utan namn bara texten. */
export function larmKommentarText(r: Pick<KommentarVy, 'namn' | 'text' | 'aldre'>): string {
  const f = r.aldre ? '' : fornamn(r.namn);
  return f ? `${f}: ${r.text}` : r.text;
}

/** Larmets kommentar per nyckel: den senaste, med namn. Nyckeln ingår i kvittensens hash, så en ny eller ändrad kommentar ger ett nytt larm. */
export function senasteLarmKommentarer(rader: readonly KommentarVy[]): Record<string, string> {
  const per: Record<string, KommentarVy[]> = {};
  for (const r of rader) (per[r.yta_nyckel] ||= []).push(r);
  const ut: Record<string, string> = {};
  for (const [nyckel, lista] of Object.entries(per)) { const s = senasteKommentar(lista); if (s) ut[nyckel] = larmKommentarText(s); }
  return ut;
}

export function kommentarerForNyckel<T extends KommentarRad>(rader: readonly T[], nyckel: string): T[] {
  return sorteraKommentarer(rader.filter((r) => r.yta_nyckel === nyckel));
}

/** Markeringens gamla kommentarfält (före författare) som en rad "Äldre kommentar". */
export function aldreKommentar(objektId: string, nyckel: string, text: string | null | undefined): KommentarVy | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  return { id: `aldre:${nyckel}`, objekt_id: objektId, yta_nyckel: nyckel, text: t, skapad_av: null, namn: null, skapad_at: '', andrad_at: '', vantar: false, aldre: true };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Kön
// ---------------------------------------------------------------------------------------------------------------------------------

export type KoOp = 'ny' | 'andra' | 'radera';
export interface KoPost {
  /** Kommentarens id (skapas i klienten, så ett omförsök aldrig ger en dubblett). */
  id: string;
  objekt_id: string;
  yta_nyckel: string;
  op: KoOp;
  text: string;
  skapad_av: string | null;
  /** Författarens namn, för visningen medan kommentaren väntar. */
  namn: string | null;
  /** När den skrevs på enheten — bara för visningen; servern sätter den riktiga tiden. */
  skapad_lokalt: string;
  forsok: number;
  /** Tidigast nästa försök (ms sedan epoch). */
  nasta: number;
}

/** En ny åtgärd på samma kommentar slås ihop med den som väntar: ny+ändra = ny med den nya texten, ny+radera = ingenting (den nådde aldrig servern),
 *  ändra+ändra = ändra, ändra+radera = radera, och en radera ändras aldrig igen. */
export function slaIhopOp(befintlig: KoPost | undefined, ny: KoPost): KoPost | null {
  if (!befintlig) return ny;
  if (befintlig.op === 'radera') return befintlig;
  if (ny.op === 'radera') return befintlig.op === 'ny' ? null : { ...befintlig, op: 'radera', forsok: 0, nasta: 0 };
  return { ...befintlig, text: ny.text, op: befintlig.op === 'ny' ? 'ny' : 'andra', forsok: 0, nasta: 0 };
}

/** Lägger köns åtgärder OVANPÅ serverns rader: ny visas direkt (med märket "väntar"), ändra byter texten, radera tar bort raden. */
export function laggKoOvanpa(server: readonly KommentarRad[], ko: readonly KoPost[], objektId: string): KommentarVy[] {
  const ut = new Map<string, KommentarVy>();
  for (const r of server) ut.set(r.id, { ...r, vantar: false });
  for (const p of ko) {
    if (p.objekt_id !== objektId) continue;
    if (p.op === 'radera') { ut.delete(p.id); continue; }
    const finns = ut.get(p.id);
    if (finns) { ut.set(p.id, { ...finns, text: p.text, vantar: true }); continue; }
    if (p.op === 'ny') ut.set(p.id, { id: p.id, objekt_id: p.objekt_id, yta_nyckel: p.yta_nyckel, text: p.text, skapad_av: p.skapad_av, namn: p.namn, skapad_at: p.skapad_lokalt, andrad_at: p.skapad_lokalt, vantar: true });
  }
  return [...ut.values()];
}

/** Väntetid före nästa försök: 5 s, 10 s, 20 s … högst 2 min. */
export const koVantan = (forsok: number): number => Math.min(120_000, 5_000 * 2 ** Math.max(0, forsok - 1));

/** Ett fel som aldrig blir bättre av att försöka igen (behörighet, constraint, okänd tabell) — posten ges upp i stället för att fastna i kön för alltid. */
export function arVaranFel(fel: { code?: string | null; status?: number | null } | null | undefined): boolean {
  if (!fel) return false;
  const c = String(fel.code ?? '');
  if (c === '23505') return false;                       // finns redan: hanteras som en lyckad ny
  if (/^(42|23|22)/.test(c) || c === 'PGRST204' || c === 'PGRST205') return true;   // PGRST301 (utgången session) försöker vi igen
  return false;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Raderna på kortet
// ---------------------------------------------------------------------------------------------------------------------------------

export interface KortKommentar {
  id: string;
  text: string;
  /** "Martin · i går 16:20"; null för en äldre kommentar (visas som "Äldre kommentar"). */
  forfattare: string | null;
  vantar: boolean;
  kanAndra: boolean;
  kanRadera: boolean;
}

/** Kommentarerna för ETT objekt på kartan som rader på kortet: markeringens äldre kommentarfält först (om det finns), sedan en rad per kommentar, äldst först. */
export function kortKommentarer(i: {
  rader: readonly KommentarVy[]; nyckel: string; objektId: string; aldreText?: string | null; minId: string | null | undefined; arAdmin: boolean; nu?: Date;
}): KortKommentar[] {
  const aldre = aldreKommentar(i.objektId, i.nyckel, i.aldreText);
  const lista = [...(aldre ? [aldre] : []), ...kommentarerForNyckel(i.rader, i.nyckel)];
  return lista.map((r) => ({
    id: r.id,
    text: r.text,
    forfattare: r.aldre ? null : forfattarText(r.namn, r.skapad_at, i.nu),
    vantar: r.vantar,
    kanAndra: !r.aldre && kanAndraKommentar(r, i.minId),
    kanRadera: kanRaderaKommentar(r, i.minId, i.arAdmin) && (!r.aldre || i.arAdmin),
  }));
}
