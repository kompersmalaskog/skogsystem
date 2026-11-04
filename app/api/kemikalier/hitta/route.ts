// Kemikalier: läs etiketten och leta upp säkerhetsbladet (lib/arbetsmiljo/sdbSok.ts). Två steg så att namnet syns direkt
// medan sökningen pågår:
//   { steg: 'las', bild: <base64>, mediaType } → { ok, etikett: { namn, tillverkare } }
//   { steg: 'sok', namn, tillverkare }          → { ok, hittad, pdf?: <base64>, kalla?: <värdnamn>, namnStammer?, koder? }
//   { steg: 'koder', pdf: <base64> }            → { ok, koder: ['H317', …] }  (ett blad man valt själv, eller ett äldre)
// Alla med medarbetarrad får använda den (förarna lägger till det de köpt). Ingenting sparas här — telefonen visar bladet och
// sparar det först när någon sagt att det är rätt blad.
import { NextResponse } from 'next/server';
import { kravInloggad } from '@/lib/auth/server';
import { arPdf, lasEtikett, pdfText, sokUrler, valjBlad } from '@/lib/arbetsmiljo/sdbSok';
import { hKoder } from '@/lib/arbetsmiljo/kemikalier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_BILD_BASE64 = 6 * 1024 * 1024;
/** Vercel tar emot 4,5 MB per anrop. */
const MAX_PDF_BASE64 = 4 * 1024 * 1024;
const BILDTYPER = ['image/jpeg', 'image/png', 'image/webp'];
const fel = (status: number, error: string, skal?: string) => NextResponse.json({ ok: false, error, skal }, { status });

export async function POST(req: Request) {
  const v = await kravInloggad();
  if (!v.ok) return v.res;
  if (!v.session.medarbetareId) return fel(403, 'Ingen medarbetare kopplad till inloggningen');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fel(400, 'Ogiltig förfrågan'); }

  if (body.steg === 'las') {
    const bild = typeof body.bild === 'string' ? body.bild : '';
    const typ = typeof body.mediaType === 'string' ? body.mediaType : 'image/jpeg';
    if (!bild || bild.length > MAX_BILD_BASE64 || !BILDTYPER.includes(typ)) return fel(400, 'Bilden saknas eller är för stor');
    const r = await lasEtikett(bild, typ);
    if (!r.ok) return fel(r.skal === 'oläslig' ? 422 : 502, r.skal === 'oläslig' ? 'Kunde inte läsa etiketten' : 'Kunde inte läsa bilden just nu', r.skal);
    return NextResponse.json({ ok: true, etikett: r.etikett });
  }

  if (body.steg === 'sok') {
    const namn = typeof body.namn === 'string' ? body.namn.trim().slice(0, 120) : '';
    const tillverkare = typeof body.tillverkare === 'string' && body.tillverkare.trim() ? body.tillverkare.trim().slice(0, 80) : null;
    if (!namn) return fel(400, 'Namnet saknas');
    const s = await sokUrler({ namn, tillverkare });
    if (!s.ok) return fel(502, 'Kunde inte söka just nu', s.skal);
    const f = await valjBlad(s.urler, namn);
    if (!f) return NextResponse.json({ ok: true, hittad: false });
    return NextResponse.json({
      ok: true, hittad: true, pdf: Buffer.from(f.pdf).toString('base64'),
      kalla: new URL(f.url).hostname.replace(/^www\./, ''), namnStammer: f.namnStammer, koder: f.koder,
    });
  }

  if (body.steg === 'koder') {
    const b64 = typeof body.pdf === 'string' ? body.pdf : '';
    if (!b64 || b64.length > MAX_PDF_BASE64) return fel(400, 'Bladet saknas eller är för stort');
    const pdf = new Uint8Array(Buffer.from(b64, 'base64'));
    if (!arPdf(pdf)) return fel(400, 'Det är inte en PDF');
    return NextResponse.json({ ok: true, koder: hKoder(await pdfText(pdf)) });
  }

  return fel(400, 'Okänt steg');
}
