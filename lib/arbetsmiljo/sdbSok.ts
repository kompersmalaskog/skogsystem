// Appen letar upp säkerhetsbladet själv (2026-11-04, Martin: "det måste vara lätt annars blir det aldrig gjort").
// Föraren fotar etiketten — det är allt. Servern:
//   1. LÄSER etiketten (Claude ser bilden): produktens namn och tillverkaren.
//   2. SÖKER bladet på nätet (Claude med webbsökning): högst tre länkar till en PDF.
//   3. HÄMTAR varje länk själv och godtar bara en riktig PDF som säger att den är ett säkerhetsdatablad.
// Människan sista ordet: appen visar bladet och frågar "Är det här rätt blad?". Hittas inget blir det ett färdigt mejl till leverantören.
//
// AI:n hämtar ingenting — den föreslår länkar. Det är vår kod som hämtar, och bara https till ett vanligt värdnamn (aldrig en
// IP-adress, localhost eller interna namn), med högst tre omdirigeringar som var och en kontrolleras igen.
//
// SERVERKOD (nyckeln ANTHROPIC_API_KEY). Ren logik överst, nätverk längst ner.

import Anthropic from '@anthropic-ai/sdk';
import { extractText, getDocumentProxy } from 'unpdf';
import { hKoder } from './kemikalier';

/** Etiketten läses och bladet söks med en snabb modell; går den inte att nå provas nästa. Ändras med KEMIKALIE_MODELL. */
export const MODELLER = ['claude-sonnet-5-5', 'claude-sonnet-4-5', 'claude-sonnet-4-20250514'] as const;
/** Bladet skickas tillbaka till telefonen i svaret (Vercel tar 4,5 MB, base64 lägger på en tredjedel). */
export const MAX_PDF_BYTES = 3 * 1024 * 1024;
export const MAX_URLER = 3;
const SOK_TIDSGRANS_MS = 90_000;
const HAMTA_TIDSGRANS_MS = 15_000;

// ── Ren logik ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export type Etikett = { namn: string; tillverkare: string | null };

/** JSON i modellens svar, också inbäddad i text eller ett kodblock. */
function jsonUr(text: string): unknown {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

const ren = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
};

/** Modellens svar på etiketten. null = inget namn gick att läsa. */
export function tolkaEtikett(text: string): Etikett | null {
  const j = jsonUr(text) as { namn?: unknown; tillverkare?: unknown } | null;
  const namn = ren(j?.namn, 120);
  if (!namn) return null;
  return { namn, tillverkare: ren(j?.tillverkare, 80) };
}

/** Modellens länkar: bara säkra, högst MAX_URLER, inga dubbletter. */
export function tolkaUrler(text: string): string[] {
  const j = jsonUr(text) as { urler?: unknown } | null;
  const lista = Array.isArray(j?.urler) ? j!.urler : [];
  const ut: string[] = [];
  for (const u of lista) {
    if (typeof u !== 'string') continue;
    const s = sakerUrl(u.trim());
    if (s && !ut.includes(s)) ut.push(s);
    if (ut.length >= MAX_URLER) break;
  }
  return ut;
}

/** Bara https till ett vanligt värdnamn. Aldrig IP-adresser, localhost, interna namn eller inloggningsuppgifter i adressen. */
export function sakerUrl(u: string): string | null {
  let url: URL;
  try { url = new URL(u); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '443') return null;
  const h = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!h.includes('.')) return null; // "localhost", "intranet"
  if (/^[\d.]+$/.test(h) || h.includes(':') || h.startsWith('[')) return null; // IPv4 / IPv6
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/.test(h)) return null;
  if (/\.(supabase\.co|vercel\.app|vercel\.com)$/.test(h)) return null; // våra egna tjänster
  return url.toString();
}

/** Det som räknas som ett säkerhetsdatablad: rubriken eller avsnitt 1, på svenska, engelska, norska eller danska. */
const SDB_ORD = /s[äa]kerhetsdatablad|safety\s*data\s*sheet|sikkerhetsdatablad|sikkerhedsdatablad|material\s*safety|avsnitt\s*1\b|section\s*1\b|punkt\s*1\b/i;

/** Ord i namnet som säger något (inte "olja", "spray" …). */
const VANLIGA = new Set(['olja', 'oil', 'spray', 'fett', 'grease', 'med', 'och', 'for', 'för', 'the', 'and', 'liter', 'ltr', 'kg']);
export function namnOrd(namn: string): string[] {
  return namn.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(o => o.length >= 3 && !VANLIGA.has(o) && !/^\d+$/.test(o));
}

export type Kontroll = { arSdb: boolean; namnStammer: boolean };
/** Är texten ett säkerhetsdatablad, och nämner den produkten? */
export function kontrolleraText(text: string, namn: string): Kontroll {
  const t = text.toLowerCase();
  const ord = namnOrd(namn);
  return { arSdb: SDB_ORD.test(text), namnStammer: ord.length > 0 && ord.some(o => t.includes(o)) };
}

/** Är bytesen en PDF? */
export function arPdf(b: Uint8Array): boolean {
  return b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
}

export const ETIKETT_PROMPT =
  'Det här är en bild på etiketten på en produkt (olja, smörjmedel, bränsle, spray, kemikalie) som används i skogsbruk. ' +
  'Läs produktens fullständiga handelsnamn som det står på etiketten (t.ex. "Hydraway HVXA 46" eller "X-Guard kedjeolja") och tillverkarens/varumärkets namn. ' +
  'Hitta inte på något. Går namnet inte att läsa, sätt namn till null. Svara ENDAST med JSON: {"namn": "", "tillverkare": ""}';

export function sokPrompt(e: Etikett): string {
  const vem = e.tillverkare ? ` från ${e.tillverkare}` : '';
  return `Hitta säkerhetsdatabladet (SDB, safety data sheet) som PDF för produkten "${e.namn}"${vem}. ` +
    'Föredra den svenska versionen och tillverkarens egen webbplats; en återförsäljare går också. ' +
    `Ge högst ${MAX_URLER} DIREKTA länkar till PDF-filer, bästa först. Gissa aldrig en adress — bara länkar du sett i sökresultaten. ` +
    'Svara ENDAST med JSON: {"urler": ["https://…"]} (tom lista om du inte hittar något).';
}

// ── Nätverk ────────────────────────────────────────────────────────────────────────────────────────────────────────────

type Block = { type: string; text?: string };
type Svar = { content: Block[]; stop_reason?: string | null };
export type KlientLike = { messages: { create(p: Record<string, unknown>, o?: { timeout?: number }): Promise<Svar> } };

function klient(): KlientLike | null {
  const k = process.env.ANTHROPIC_API_KEY;
  return k ? (new Anthropic({ apiKey: k }) as unknown as KlientLike) : null;
}

const modeller = (): string[] => (process.env.KEMIKALIE_MODELL ? [process.env.KEMIKALIE_MODELL, ...MODELLER] : [...MODELLER]);
const text = (s: Svar) => s.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('\n');

/** Ett anrop, med nästa modell om en modell inte finns. */
async function anropa(k: KlientLike, p: Record<string, unknown>, timeout: number): Promise<Svar> {
  let sist: unknown;
  for (const model of modeller()) {
    try { return await k.messages.create({ ...p, model }, { timeout }); }
    catch (e) {
      sist = e;
      const status = (e as { status?: number }).status;
      if (status !== 404 && !/model/i.test(String((e as Error).message))) throw e;
    }
  }
  throw sist;
}

export type LasResultat = { ok: true; etikett: Etikett } | { ok: false; skal: 'nyckel' | 'oläslig' | 'fel' };

/** Läs etiketten på bilden. */
export async function lasEtikett(base64: string, mediaType: string, k: KlientLike | null = klient()): Promise<LasResultat> {
  if (!k) return { ok: false, skal: 'nyckel' };
  try {
    const s = await anropa(k, {
      max_tokens: 300,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: ETIKETT_PROMPT },
      ] }],
    }, 30_000);
    const e = tolkaEtikett(text(s));
    return e ? { ok: true, etikett: e } : { ok: false, skal: 'oläslig' };
  } catch { return { ok: false, skal: 'fel' }; }
}

/** Länkar till bladet ur en webbsökning. Fortsätter när svaret pausar (lång sökning). */
export async function sokUrler(e: Etikett, k: KlientLike | null = klient()): Promise<{ ok: true; urler: string[] } | { ok: false; skal: 'nyckel' | 'fel' }> {
  if (!k) return { ok: false, skal: 'nyckel' };
  const messages: Array<{ role: string; content: unknown }> = [{ role: 'user', content: sokPrompt(e) }];
  try {
    for (let varv = 0; varv < 3; varv++) {
      const s = await anropa(k, {
        max_tokens: 1500, messages,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      }, SOK_TIDSGRANS_MS);
      if (s.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: s.content }); continue; }
      return { ok: true, urler: tolkaUrler(text(s)) };
    }
    return { ok: true, urler: [] };
  } catch { return { ok: false, skal: 'fel' }; }
}

type Hamta = (url: string, init: RequestInit) => Promise<Response>;

/** Hämta en länk som PDF. Omdirigeringar följs för hand (högst 3) och varje adress kontrolleras. null = inte en PDF vi tar emot. */
export async function hamtaPdf(start: string, hamta: Hamta = fetch): Promise<Uint8Array | null> {
  let url = sakerUrl(start);
  for (let i = 0; url && i <= 3; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), HAMTA_TIDSGRANS_MS);
    try {
      const r = await hamta(url, { redirect: 'manual', signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; Skogsystem-SDB/1.0)', accept: 'application/pdf,*/*' } });
      if (r.status >= 300 && r.status < 400) {
        const till = r.headers.get('location');
        url = till ? sakerUrl(new URL(till, url).toString()) : null;
        continue;
      }
      if (!r.ok) return null;
      const langd = Number(r.headers.get('content-length') ?? 0);
      if (langd > MAX_PDF_BYTES) return null;
      const b = new Uint8Array(await r.arrayBuffer());
      if (b.length > MAX_PDF_BYTES || !arPdf(b)) return null;
      return b;
    } catch { return null; }
    finally { clearTimeout(t); }
  }
  return null;
}

export async function pdfText(b: Uint8Array): Promise<string> {
  try {
    const doc = await getDocumentProxy(new Uint8Array(b));
    const { text } = await extractText(doc, { mergePages: true });
    return Array.isArray(text) ? text.join('\n') : String(text ?? '');
  } catch { return ''; }
}

export type Fynd = { pdf: Uint8Array; url: string; namnStammer: boolean; koder: string[] };

/** Första länken som är en riktig PDF och ett säkerhetsdatablad. En där namnet syns går före en där det inte gör det. */
export async function valjBlad(urler: readonly string[], namn: string, hamta: Hamta = fetch, las: (b: Uint8Array) => Promise<string> = pdfText): Promise<Fynd | null> {
  let reserv: Fynd | null = null;
  for (const u of urler) {
    const pdf = await hamtaPdf(u, hamta);
    if (!pdf) continue;
    const text = await las(pdf);
    const k = kontrolleraText(text, namn);
    if (!k.arSdb) continue;
    if (k.namnStammer) return { pdf, url: u, namnStammer: true, koder: hKoder(text) };
    reserv ??= { pdf, url: u, namnStammer: false, koder: hKoder(text) };
  }
  return reserv;
}
