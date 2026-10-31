// Maskinkollen (skyddsronden) — ren logik, ingen Supabase. Spec: Claude Docs "Arbetsmiljö i Skogsystem – spec".
//
// Föraren svarar Ja/Nej på maskinens frågor en gång i månaden. Ja är ALLTID bra (frågorna formuleras så), och varje
// fråga är något man GÖR (öppna nödutgången, tryck nödstoppet) — inte ett omdöme (Martin 2026-10-31: ingen förare
// använder checklistor; det som testas är det man annars aldrig rör). Nej kräver ett foto; databasen skapar då en
// åtgärd (trigger am_svar_till_atgard). STOPPFRÅGA: Nej = maskinen ska stå. FOTO VID JA: mätaren/lådan fotas också
// när svaret är Ja. Bilden måste vara nytagen (`bildArGammal`). Databasen vägrar `klar` tills allt är besvarat.

/** Versionen av texten föraren godkänner första gången ("Jag gör maskinkollen på …"). Byt när texten ändras i sak. */
export const GODKANNANDE_VERSION = 'v1-2026-10-31';

/** Storage-bucket för maskinkollens foton (privat). Första mappen MÅSTE vara förarens medarbetare-id (RLS). */
export const MASKINKOLL_BUCKET = 'am-foton';

export type MaskinTyp = 'Harvester' | 'Forwarder' | 'Lastbil' | string;

export type Fraga = {
  id: string;
  kod: string;
  text: string;
  hjalptext: string | null;
  maskin_typ: string | null;
  foto_url: string | null;
  ordning: number;
  /** Nej betyder att maskinen inte ska köras (nödutgång, nödstopp, dörrbrytare). */
  stopp: boolean;
  /** Ett foto krävs också vid Ja (brandsläckarnas mätare, förbandslådan). */
  foto_vid_ja: boolean;
};

export type Svar = {
  fraga_id: string;
  ok: boolean;
  foto_url: string | null;
  kommentar: string | null;
};

/** Frågorna för maskinen: alla maskiner (maskin_typ NULL) + maskinens typ, i `ordning`. Inaktiva hämtas aldrig. */
export function fragorFor(fragor: Fraga[], typ: MaskinTyp | null): Fraga[] {
  return fragor
    .filter((f) => f.maskin_typ == null || (typ != null && f.maskin_typ === typ))
    .slice()
    .sort((a, b) => a.ordning - b.ordning || a.kod.localeCompare(b.kod, 'sv'));
}

/** Samma dag en kalendermånad senare (31 jan → 28/29 feb, aldrig 3 mars). */
export function enManadSenare(d: Date): Date {
  const ut = new Date(d.getFullYear(), d.getMonth() + 1, 1, d.getHours(), d.getMinutes());
  const sista = new Date(ut.getFullYear(), ut.getMonth() + 1, 0).getDate();
  ut.setDate(Math.min(d.getDate(), sista));
  return ut;
}

/** Är det dags? Ingen klar koll alls → ja. Annars när en kalendermånad gått sedan den senaste (räknat i hela dagar). */
export function arDags(senasteKlar: string | Date | null | undefined, nu: Date = new Date()): boolean {
  if (!senasteKlar) return true;
  const klar = new Date(senasteKlar);
  if (Number.isNaN(klar.getTime())) return true;
  const forfaller = enManadSenare(new Date(klar.getFullYear(), klar.getMonth(), klar.getDate()));
  const idag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
  return idag.getTime() >= forfaller.getTime();
}

const MANADER = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

/** "30 november" — för "Nästa maskinkoll …". */
export function datumText(d: Date): string {
  return `${d.getDate()} ${MANADER[d.getMonth()]}`;
}

const sakert = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_');

/** `<medarbetare>/<maskinkoll>/<del>-<tid>.jpg`. Unik per foto — ett omtag blir en ny fil (Storage har ingen update-policy). */
export function fotoSokvag(medarbetareId: string, maskinkollId: string, del: string, tid: number): string {
  return `${sakert(medarbetareId)}/${sakert(maskinkollId)}/${sakert(del)}-${tid}.jpg`;
}

/** Hur många frågor som återstår, och första obesvarade (för "Fortsätt"). */
export function lage(fragor: Fraga[], svar: Svar[]): { besvarade: number; kvar: number; forstaObesvarade: number } {
  const svarade = new Set(svar.map((s) => s.fraga_id));
  const forsta = fragor.findIndex((f) => !svarade.has(f.id));
  const besvarade = fragor.filter((f) => svarade.has(f.id)).length;
  return { besvarade, kvar: fragor.length - besvarade, forstaObesvarade: forsta === -1 ? fragor.length : forsta };
}

// ── Nytagen bild ─────────────────────────────────────────────────────────
// En bild ur galleriet bevisar ingenting (Martins test 2026-10-31: samma bild för två saker). iPhone låter alltid
// användaren välja galleriet, så vi kan inte stänga det — bara säga nej till en bild som är äldre än några minuter.
// Tiden läses ur bildens EXIF (DateTimeOriginal, annars DateTime) och annars filens lastModified.
// OBS: inte provat på en riktig iPhone — hur Safari sätter EXIF och lastModified för en bild ur galleriet är inte kontrollerat.

/** Hur gammal en bild får vara. */
export const BILD_MAX_ALDER_MIN = 10;

/** "2026:10:31 17:59:12" (EXIF, lokal tid utan zon) → Date. */
export function tolkaExifTid(s: string): Date | null {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s.trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isNaN(d.getTime()) || +m[1] < 1990 ? null : d;
}

/** Tiden bilden togs ur en JPEG:s EXIF. null = ingen EXIF, inte JPEG eller inte läsbar. Läser bara buffertens början. */
export function exifTid(buf: ArrayBuffer): Date | null {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let p = 2;
  while (p + 4 <= v.byteLength) {
    if (v.getUint8(p) !== 0xff) return null;
    const markor = v.getUint8(p + 1);
    const len = v.getUint16(p + 2);
    if (markor === 0xe1 && p + 10 <= v.byteLength && v.getUint32(p + 4) === 0x45786966) return lasTiff(v, p + 10, p + 2 + len);
    if (markor === 0xda) return null;
    p += 2 + len;
  }
  return null;
}

function lasTiff(v: DataView, start: number, slut: number): Date | null {
  if (start + 8 > v.byteLength) return null;
  const le = v.getUint16(start) === 0x4949;
  const u16 = (o: number) => v.getUint16(start + o, le);
  const u32 = (o: number) => v.getUint32(start + o, le);
  const max = Math.min(slut, v.byteLength) - start;
  const text = (o: number, n: number) => {
    let t = '';
    for (let i = 0; i < n && o + i < max; i++) { const c = v.getUint8(start + o + i); if (c === 0) break; t += String.fromCharCode(c); }
    return t;
  };
  const ifd = (o: number): Map<number, number> => {
    const m = new Map<number, number>();
    if (o + 2 > max) return m;
    const n = u16(o);
    for (let i = 0; i < n; i++) {
      const e = o + 2 + i * 12;
      if (e + 12 > max) break;
      m.set(u16(e), u32(e + 8));
    }
    return m;
  };
  const ifd0 = ifd(u32(4));
  const exifPek = ifd0.get(0x8769);
  const exif = exifPek != null ? ifd(exifPek) : new Map<number, number>();
  for (const [tabell, tagg] of [[exif, 0x9003], [exif, 0x9004], [ifd0, 0x0132]] as const) {
    const o = tabell.get(tagg);
    if (o != null) { const d = tolkaExifTid(text(o, 20)); if (d) return d; }
  }
  return null;
}

/** Är bilden äldre än gränsen? `tagen` = EXIF-tiden om den finns, annars filens lastModified. Okänd tid = inte gammal. */
export function bildArGammal(tagen: Date | number | null | undefined, nu: Date = new Date()): boolean {
  if (tagen == null) return false;
  const t = typeof tagen === 'number' ? tagen : tagen.getTime();
  if (!Number.isFinite(t) || t <= 0) return false;
  return nu.getTime() - t > BILD_MAX_ALDER_MIN * 60_000;
}

/** Läser filen och svarar om den är för gammal. Ett läsfel = inte gammal (bilden ska aldrig fastna på vår kontroll). */
export async function arFilenGammal(fil: File, nu: Date = new Date()): Promise<boolean> {
  try {
    const exif = exifTid(await fil.slice(0, 256 * 1024).arrayBuffer());
    return bildArGammal(exif ?? fil.lastModified, nu);
  } catch {
    return bildArGammal(fil.lastModified, nu);
  }
}

/** Sista dagen för en åtgärd: stopp = idag, annars en vecka (samma som databasens trigger). "YYYY-MM-DD" lokal tid. */
export function deadlineFor(stopp: boolean, nu: Date = new Date()): string {
  const d = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() + (stopp ? 0 : 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
