// Telefonens sida av "appen letar upp säkerhetsbladet" (servern: app/api/kemikalier/hitta, lib/arbetsmiljo/sdbSok.ts).
// Två anrop: läs etiketten (snabbt, namnet fylls i) och sök bladet (kan ta en minut). Kastar aldrig — ett fel är ett svar.

export type Etikett = { namn: string; tillverkare: string | null };
export type LasSvar = { ok: true; etikett: Etikett } | { ok: false; olaslig: boolean };
export type SokSvar =
  | { status: 'hittad'; fil: File; kalla: string; namnStammer: boolean }
  | { status: 'inget' }
  | { status: 'fel' };

async function post(body: unknown): Promise<{ status: number; json: Record<string, unknown> | null }> {
  try {
    const r = await fetch('/api/kemikalier/hitta', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    let json: Record<string, unknown> | null = null;
    try { json = await r.json(); } catch { json = null; }
    return { status: r.status, json };
  } catch { return { status: 0, json: null }; }
}

export async function blobTillBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function lasEtikettApi(bild: Blob): Promise<LasSvar> {
  const typ = ['image/jpeg', 'image/png', 'image/webp'].includes(bild.type) ? bild.type : 'image/jpeg';
  const { status, json } = await post({ steg: 'las', bild: await blobTillBase64(bild), mediaType: typ });
  const e = json?.etikett as Etikett | undefined;
  if (json?.ok && e?.namn) return { ok: true, etikett: { namn: e.namn, tillverkare: e.tillverkare ?? null } };
  return { ok: false, olaslig: status === 422 };
}

export async function sokBladApi(namn: string, tillverkare: string | null): Promise<SokSvar> {
  const { json } = await post({ steg: 'sok', namn, tillverkare });
  if (!json?.ok) return { status: 'fel' };
  if (!json.hittad || typeof json.pdf !== 'string') return { status: 'inget' };
  try {
    const bin = atob(json.pdf);
    const b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    const kalla = typeof json.kalla === 'string' ? json.kalla : 'nätet';
    const fil = new File([b], `${namn.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60)}-sdb.pdf`, { type: 'application/pdf' });
    return { status: 'hittad', fil, kalla, namnStammer: json.namnStammer === true };
  } catch { return { status: 'fel' }; }
}
