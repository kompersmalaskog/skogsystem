/**
 * Notisen "Vilken maskin?" — bilen har lastat och lossat en maskin och appen vet inte säkert vilken.
 *
 *   lass_maskin → Martin eller Joacim (admin): "Vilken maskin? Lass Vällust 07:40 → Tjuvön 09:10"  → /lastbil?lass=<id>
 *
 * Texten byggs FÄRSKT vid utskick (som ledighetsnotiserna), ur lasset som det ser ut just då: är det redan besvarat, avvisat eller
 * borttaget skickas ingenting, och ett läsfel lämnar raden oskickad så nästa cron försöker igen. Köas med skickas_at = 'infinity' så
 * att den GAMLA flushen på production (som skickar okända typer som en generisk "Notis" + rå JSON) aldrig tar raden — den nya
 * flushen tar typen oavsett skickas_at (se `flushUrval` i lib/ledighet/notis.ts) och hoppar över allt köat för mer än 24 timmar sedan.
 *
 * MOTTAGARE. Den av Martin och Joacim som var inne i appen under rundan (push_subscriptions.senast_oppnad ≥ rundans start). Har
 * ingen varit inne: båda. Första svaret stänger frågan — den andras notis hoppas över om den inte hunnit skickas, och sheeten säger
 * "Redan besvarat av Martin" om den öppnas efteråt.
 *
 * Ren modul (ingen Supabase-import): raden hämtas av anroparen, så skip-reglerna kan testas utan nätverk.
 */

export const LASS_MASKIN = 'lass_maskin';
export const arLassNotis = (typ: unknown): typ is typeof LASS_MASKIN => typ === LASS_MASKIN;

/** Samma 24-timmarsregel som ledighetsnotiserna: en hög som väntat på release skickas aldrig på en gång. */
export const LASS_MAX_ALDER_MS = 24 * 60 * 60 * 1000;

/**
 * Så länge väntar ett lass innan någon får frågan: maskinernas GPS-spår importeras timmar efter transporten, och kommer det
 * och lasset blir Hög skapas flytten av sig själv. Samma gräns styr märket "N lass saknar maskin" (lib/lastbil/lass/vantar.ts).
 */
export const NOTIS_FORDROJNING_MIN = 120;

/** Vem som kan få frågan. E-post (inte roll), som GROT-påminnelserna: det är två namngivna personer. */
export const LASS_MOTTAGARE_EPOST = [
  'martin.lindqvist@kompersmalaskog.com',
  'joacim.ringberg@kompersmalaskog.com',
] as const;

export interface Mottagare { id: string; epost: string }

/**
 * @param narvaro  mottagare-id → senast appen öppnades på någon av personens enheter (ISO), saknas/null = okänt
 * @param rundaStart  när rundan (eller lassningen) började: den som öppnat appen sedan dess "var inne under rundan"
 */
export function valjMottagare(mottagare: readonly Mottagare[], narvaro: ReadonlyMap<string, string | null>, rundaStart: string): Mottagare[] {
  const start = Date.parse(rundaStart);
  if (!Number.isFinite(start)) return [...mottagare];
  const inne = mottagare.filter(m => {
    const t = Date.parse(narvaro.get(m.id) ?? '');
    return Number.isFinite(t) && t >= start;
  });
  return inne.length ? inne : [...mottagare];
}

export type LassNotisRad = {
  id: string;
  status: string;
  status_orsak: string | null;
  fran_namn: string | null;
  till_namn: string | null;
  lassning_tid: string;
  lossning_tid: string;
  forslag_maskin_namn?: string | null;
};

/** `rad: null` = lasset finns inte. `fel` = läsningen misslyckades (inte samma sak som "finns inte"). */
export type HamtaLass = (lassId: string) => Promise<{ rad: LassNotisRad | null; fel?: string }>;

export type LassNotisUtfall =
  | { typ: 'skicka'; meddelande: { title: string; body: string; url: string; tag: string } }
  | { typ: 'hoppa_over'; orsak: string }
  | { typ: 'uppskjut' };

const hhmm = (iso: string): string =>
  new Date(iso).toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' });

/** Platsnamnet kortas till det som känns igen: första ordet/orden före traktens fastighetsbeteckning. */
export function kortNamn(namn: string | null | undefined): string {
  const n = (namn ?? '').trim();
  if (!n) return 'okänd plats';
  return n.length > 28 ? `${n.slice(0, 27).trimEnd()}…` : n;
}

/** Frågan som notisen och sheetens rubrik ställer. Saknad kund är en annan fråga än saknad maskin. */
export function lassFraga(orsak: string | null | undefined): string {
  return orsak === 'kund_saknas' ? 'Vilken kund?' : 'Vilken maskin?';
}

export function lassNotisText(rad: Pick<LassNotisRad, 'status_orsak' | 'fran_namn' | 'till_namn' | 'lassning_tid' | 'lossning_tid'>): string {
  return `${lassFraga(rad.status_orsak)} Lass ${kortNamn(rad.fran_namn)} ${hhmm(rad.lassning_tid)} → ${kortNamn(rad.till_namn)} ${hhmm(rad.lossning_tid)}`;
}

export async function byggLassNotis(
  n: { typ: string; payload?: Record<string, unknown> | null; skapad_at?: string | null },
  hamtaLass: HamtaLass,
  nu: number = Date.now(),
): Promise<LassNotisUtfall> {
  const id = n.payload?.lass_id;
  if (typeof id !== 'string' || !id) return { typ: 'hoppa_over', orsak: 'Ej skickad — notisen saknar lass_id' };

  // För gammal? Kollas FÖRE läsningen: en gammal rad ska aldrig skjutas upp av ett läsfel (och aldrig skickas).
  const koad = n.skapad_at ? Date.parse(n.skapad_at) : NaN;
  if (Number.isFinite(koad) && nu - koad > LASS_MAX_ALDER_MS) {
    return { typ: 'hoppa_over', orsak: 'Ej skickad — för gammal (köad för mer än 24 timmar sedan)' };
  }

  const { rad, fel } = await hamtaLass(id);
  if (fel) return { typ: 'uppskjut' };
  if (!rad) return { typ: 'hoppa_over', orsak: 'Ej skickad — lasset finns inte kvar' };
  if (rad.status !== 'vantar_maskin') return { typ: 'hoppa_over', orsak: 'Ej skickad — lasset var redan besvarat' };

  return {
    typ: 'skicka',
    meddelande: {
      title: 'Lastbilen',
      body: lassNotisText(rad),
      // Id:t i länken öppnar sheeten på lasset, inte bara sidan.
      url: `/lastbil?lass=${encodeURIComponent(rad.id)}`,
      tag: `lass-maskin-${rad.id}`,
    },
  };
}
