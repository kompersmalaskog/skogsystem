// Ritad utan nät: det som hämtas till Ritad (objektets fakta, laserdatan, blött/brant, stammarna) sparas i enheten (Cache Storage `RITAD_CACHE`)
// varje gång det hämtas med nät. Går nätet inte, eller servern svarar fel, används det sparade. Nät FÖRST: med täckning är allt färskt som förut.
// Fylls också i förväg av bakgrundsnedladdningen (lib/hooks/useBakgrundsNedladdning) för trakterna man ska till.
export const RITAD_CACHE = 'ritad-v1';

const nyckelUrl = (nyckel: string) => {
  const bas = typeof window !== 'undefined' ? window.location.origin : 'https://app.local';
  return `${bas}/__ritad/${encodeURIComponent(nyckel)}`;
};

async function oppna(): Promise<Cache | null> {
  try { return typeof caches === 'undefined' ? null : await caches.open(RITAD_CACHE); } catch { return null; }
}

/** Läser det sparade svaret, eller null. */
export async function lasSparat<T>(nyckel: string): Promise<T | null> {
  const c = await oppna();
  if (!c) return null;
  try { const r = await c.match(nyckelUrl(nyckel)); return r ? ((await r.json()) as T) : null; } catch { return null; }
}

export async function spara(nyckel: string, varde: unknown): Promise<void> {
  const c = await oppna();
  if (!c) return;
  try { await c.put(nyckelUrl(nyckel), new Response(JSON.stringify(varde), { headers: { 'content-type': 'application/json' } })); } catch { /* fullt — nästa gång */ }
}

/**
 * Nät först, det sparade som reserv. `hamta` ger `{ ok: true, varde }` (sparas) eller `{ ok: false }` (servern sa nej).
 * Kastar `hamta` (inget nät) eller svarar `ok: false` används det sparade; finns inget sparat blir svaret det som `hamta` gav (eller null).
 */
export async function medReserv<T>(nyckel: string, hamta: () => Promise<{ ok: true; varde: T } | { ok: false }>): Promise<{ varde: T; sparat: boolean } | null> {
  try {
    const r = await hamta();
    if (r.ok) { await spara(nyckel, r.varde); return { varde: r.varde, sparat: false }; }
  } catch { /* inget nät — det sparade */ }
  const s = await lasSparat<T>(nyckel);
  return s == null ? null : { varde: s, sparat: true };
}
